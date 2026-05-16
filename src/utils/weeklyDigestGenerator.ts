/**
 * Weekly Project Digest generator (Epic-012 Task-02, FR-36).
 *
 * Produces a markdown weekly changelog for one project (and a
 * cross-portfolio roll-up) from the week's activity:
 *   pulse + closed issues + merged PRs + commitments delivered +
 *   audit findings.
 *
 * Output ALWAYS contains the six canonical sections in this order:
 *   `## Shipped` / `## In progress` / `## Blocked` / `## Decisions` /
 *   `## Clients touched` / `## Spend`
 * with a `—` placeholder line when a section has no content — even
 * when the entire input is empty. This is an acceptance criterion, so
 * the section skeleton is enforced *after* the model call rather than
 * trusted to the LLM.
 *
 * Model: Claude Sonnet, downgraded to Haiku when the monthly budget
 * crosses the fallback threshold (`effectiveModel` /
 * `shouldFallbackToHaiku` from `claudeBudget.ts`). Hard-stop refuses
 * the call entirely.
 *
 * Persistence: `digests/{repo}/{YYYY-WW}.md` (per-project) and
 * `digests/{YYYY-WW}-portfolio.md` (portfolio root) inside the
 * dashboard repo, via `github-contents.writeFile()`.
 *
 * Cache: localStorage `makeit_digest:{repo}:{YYYY-WW}` with a TTL that
 * expires at the end of that ISO week (a digest for the *current* week
 * keeps updating until the week closes; past weeks never expire because
 * the week is already over). `generateDigest(..., { force: true })`
 * (used by the Regenerate button) ignores and overwrites the cache.
 *
 * Failure model: every external call (Claude, GitHub Contents) is
 * wrapped. A persistence failure does NOT discard the generated
 * markdown — it is still cached and returned so the user sees the
 * digest even if the commit to the repo failed (and a warning is
 * logged). A Claude failure falls back to a deterministic
 * locally-rendered digest so the six sections always materialise.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DigestEntry, DigestInput, DigestMeta } from "../types/hub";
import { getClaudeKey, GITHUB_OWNER, PROJECTS } from "./config";
import {
  assertNotHardStopped,
  effectiveModel,
  estimateCost,
  logCall,
  shouldFallbackToHaiku,
} from "./claudeBudget";
import { SONNET_MODEL } from "./claudeModels";
import { readFile, writeFile } from "./github-contents";
import { maybeDispatchAuthLostFromError } from "./external-auth-events";

// ── Constants ───────────────────────────────────────────────────────────────

/** Dashboard repo that physically stores the digest files (FR-36). */
const DIGEST_REPO = "makeit-dashboard";

/** Sonnet is the default; downgraded to Haiku by `effectiveModel`. */
const DIGEST_MODEL = SONNET_MODEL;

const CACHE_PREFIX = "makeit_digest";

/**
 * The six canonical sections, in render order. Exported so the viewer
 * (and tests) can rely on the exact contract.
 */
export const DIGEST_SECTIONS = [
  "Shipped",
  "In progress",
  "Blocked",
  "Decisions",
  "Clients touched",
  "Spend",
] as const;

export type DigestSection = (typeof DIGEST_SECTIONS)[number];

/** Placeholder line emitted for an empty section (acceptance criterion). */
const EMPTY_PLACEHOLDER = "—";

/**
 * Token-estimate inputs for the cost preview shown before Regenerate.
 * Rough by design — the real spend is logged from the API response.
 * `inputTokens` scales with the serialised activity; `outputTokens` is
 * a fixed ceiling matching `max_tokens` below.
 */
const MAX_OUTPUT_TOKENS = 1500;

// ── ISO week helpers ────────────────────────────────────────────────────────

/**
 * ISO-8601 week of a date as `{ year, week }`. ISO weeks start Monday;
 * week 1 is the week containing the first Thursday. Computed in UTC so
 * the result is deterministic regardless of the runner's timezone.
 */
function isoWeekParts(d: Date): { year: number; week: number } {
  // Copy to a UTC midnight so DST / local offset can't shift the day.
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  // Thursday of the current week decides the ISO year.
  const day = date.getUTCDay() || 7; // Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: isoYear, week };
}

/** Format `{year, week}` as the canonical `YYYY-WW` key (zero-padded). */
function isoWeekKey(year: number, week: number): string {
  return `${year}-${String(week).padStart(2, "0")}`;
}

/**
 * Normalise a caller-supplied week identifier to the canonical
 * `YYYY-WW` form. Accepts `2026-W18`, `2026-18`, `2026W18`, or a date
 * ISO string / `Date` (resolved to the ISO week it falls in). Throws on
 * anything unparseable so a typo can't silently write to the wrong
 * file.
 */
export function normalizeWeekKey(weekISO: string | Date): string {
  if (weekISO instanceof Date) {
    const { year, week } = isoWeekParts(weekISO);
    return isoWeekKey(year, week);
  }
  const trimmed = weekISO.trim();
  const m = trimmed.match(/^(\d{4})[-]?W?(\d{1,2})$/i);
  if (m) {
    const year = Number(m[1]);
    const week = Number(m[2]);
    if (week >= 1 && week <= 53) return isoWeekKey(year, week);
  }
  // Fall back to date parsing (`2026-05-04`, full ISO timestamp, …).
  const asDate = new Date(trimmed);
  if (!Number.isNaN(asDate.getTime())) {
    const { year, week } = isoWeekParts(asDate);
    return isoWeekKey(year, week);
  }
  throw new Error(`Unrecognised ISO week identifier: "${weekISO}"`);
}

/** The current ISO week key (`YYYY-WW`), in UTC. */
export function currentWeekKey(now: Date = new Date()): string {
  const { year, week } = isoWeekParts(now);
  return isoWeekKey(year, week);
}

/**
 * The last `count` ISO week keys ending at (and including) `from`,
 * newest first. Used by the viewer's history dropdown (12 weeks).
 */
export function recentWeekKeys(count: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  for (let i = 0; i < count; i++) {
    const { year, week } = isoWeekParts(cursor);
    out.push(isoWeekKey(year, week));
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return out;
}

/**
 * Epoch ms of the end (Sunday 23:59:59.999 UTC) of ISO week `weekKey` —
 * the point a digest for that week stops being authoritative. A past
 * week never needs refreshing (the week is closed), so its value is
 * already in the past and any cached value is still served (we only
 * treat *missing* as stale for closed weeks — see `readCache`).
 *
 * Exported as the single source of this cutoff: `PortfolioDigestPanel`
 * uses it for its own sessionStorage cache TTL so the two cache layers
 * can't drift apart (#415).
 */
export function weekEndMs(weekKey: string): number {
  const m = weekKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return 0;
  const year = Number(m[1]);
  const week = Number(m[2]);
  // ISO week 1 contains Jan 4th. Monday of week N:
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const weekMonday = new Date(week1Monday);
  weekMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  // End of Sunday of that week.
  const weekSundayEnd = new Date(weekMonday);
  weekSundayEnd.setUTCDate(weekMonday.getUTCDate() + 6);
  weekSundayEnd.setUTCHours(23, 59, 59, 999);
  return weekSundayEnd.getTime();
}

// ── Cache ───────────────────────────────────────────────────────────────────

interface CachedDigest {
  entry: DigestEntry;
  /** Epoch ms when this cache entry stops being authoritative. */
  expiresAt: number;
}

function cacheKey(repo: string, weekKey: string): string {
  return `${CACHE_PREFIX}:${repo}:${weekKey}`;
}

/**
 * Read a cached digest. Returns `null` when absent, corrupt, or expired
 * for the *current* week. For a closed (past) week a cached value never
 * expires — the underlying activity can no longer change.
 */
function readCache(repo: string, weekKey: string): DigestEntry | null {
  if (typeof localStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(cacheKey(repo, weekKey));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedDigest>;
    const entry = parsed.entry;
    if (
      !entry ||
      typeof entry.markdown !== "string" ||
      typeof entry.week !== "string"
    ) {
      return null;
    }
    const expiresAt =
      typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
    // Only the *current* week's cache can go stale. A past week is
    // immutable, so even an "expired" timestamp is still served.
    if (weekKey === currentWeekKey() && Date.now() > expiresAt) {
      return null;
    }
    return {
      week: entry.week,
      generatedAt:
        typeof entry.generatedAt === "string"
          ? entry.generatedAt
          : new Date().toISOString(),
      markdown: entry.markdown,
      budgetFallback: entry.budgetFallback === true,
    };
  } catch {
    return null;
  }
}

function writeCache(repo: string, weekKey: string, entry: DigestEntry): void {
  if (typeof localStorage === "undefined") return;
  const payload: CachedDigest = { entry, expiresAt: weekEndMs(weekKey) };
  try {
    localStorage.setItem(cacheKey(repo, weekKey), JSON.stringify(payload));
  } catch (e) {
    // Quota / disabled storage / private mode — non-fatal, the digest
    // is still returned and (best-effort) committed to the repo.
    console.warn("weeklyDigest: failed to cache digest:", e);
  }
}

/** Drop a single week's cache so the next call regenerates. */
export function invalidateDigestCache(
  repo: string,
  weekISO: string | Date,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(cacheKey(repo, normalizeWeekKey(weekISO)));
  } catch (e) {
    console.warn("weeklyDigest: failed to invalidate cache:", e);
  }
}

// ── Markdown skeleton enforcement ───────────────────────────────────────────

/**
 * Guarantee the six canonical sections exist, in order, each with at
 * least a placeholder line. Reuses model-provided section bodies when
 * present; injects `—` for any missing/empty one. Run on EVERY path
 * (model success, model failure, fallback) so the contract holds
 * regardless of what the LLM returned.
 */
function enforceSectionSkeleton(markdown: string): string {
  // Split the raw markdown into a map of `section title → body lines`.
  const bodies = new Map<string, string>();
  const headerRe = /^##\s+(.+?)\s*$/gm;
  const matches: { title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  headerRe.lastIndex = 0;
  while ((m = headerRe.exec(markdown)) !== null) {
    matches.push({
      title: m[1].trim(),
      start: m.index + m[0].length,
      end: markdown.length,
    });
  }
  for (let i = 0; i < matches.length; i++) {
    if (i + 1 < matches.length) {
      // The next header starts at its `index`; we don't have it here,
      // so recompute the body bound by scanning from this body start.
      const rest = markdown.slice(matches[i].start);
      const nextHeader = rest.search(/^##\s+/m);
      matches[i].end =
        nextHeader >= 0 ? matches[i].start + nextHeader : markdown.length;
    }
    const body = markdown.slice(matches[i].start, matches[i].end).trim();
    // Case-insensitive lookup so "## shipped" still matches "Shipped".
    bodies.set(matches[i].title.toLowerCase(), body);
  }

  const parts: string[] = [];
  for (const section of DIGEST_SECTIONS) {
    const body = bodies.get(section.toLowerCase());
    parts.push(`## ${section}`);
    parts.push(body && body.length > 0 ? body : EMPTY_PLACEHOLDER);
    parts.push("");
  }
  return parts.join("\n").trimEnd() + "\n";
}

// ── Deterministic fallback renderer ─────────────────────────────────────────

function bulletList(items: string[]): string {
  if (items.length === 0) return EMPTY_PLACEHOLDER;
  return items.map((t) => `- ${t}`).join("\n");
}

/**
 * Build a digest from the raw input WITHOUT calling Claude. Used when
 * the model is unavailable / errored / budget-hard-stopped so the six
 * sections still materialise with real (if unsummarised) data.
 */
function renderFallbackDigest(input: DigestInput): string {
  const shipped = [
    ...input.mergedPRs.map((p) => `Merged PR: ${p.title}`),
    ...input.closedIssues.map((i) => `Closed: ${i.title}`),
  ];
  const inProgress = input.pulse
    .filter((e) => e.type !== "issue_closed" && e.type !== "pr_merged")
    .map((e) => e.label)
    .slice(0, 20);
  const blocked = input.auditFindings
    .filter((f) => f.severity.toLowerCase() === "critical")
    .map((f) => `Critical finding: ${f.title}`);
  const decisions = input.commitmentsDelivered.map(
    (c) => `Delivered: ${c.text}${c.client ? ` (${c.client})` : ""}`,
  );
  const clients = Array.from(
    new Set(
      input.commitmentsDelivered
        .map((c) => c.client)
        .filter((c): c is string => Boolean(c && c.trim())),
    ),
  );
  const spend =
    typeof input.spendUsd === "number" && input.spendUsd > 0
      ? `Claude API: $${input.spendUsd.toFixed(2)}`
      : EMPTY_PLACEHOLDER;

  return [
    "## Shipped",
    bulletList(shipped),
    "",
    "## In progress",
    bulletList(inProgress),
    "",
    "## Blocked",
    bulletList(blocked),
    "",
    "## Decisions",
    bulletList(decisions),
    "",
    "## Clients touched",
    bulletList(clients),
    "",
    "## Spend",
    spend,
    "",
  ].join("\n");
}

// ── Claude prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a delivery lead writing a concise weekly project digest.
Return GitHub-flavoured markdown ONLY — no preamble, no code fences.

Output EXACTLY these six level-2 sections, in this order, even if a
section is empty:

## Shipped
## In progress
## Blocked
## Decisions
## Clients touched
## Spend

Rules:
- Use short bullet points. Be specific, no filler.
- If a section has nothing, output a single line: —
- "Shipped" = merged PRs + closed issues that delivered value.
- "In progress" = ongoing work from the activity pulse.
- "Blocked" = critical audit findings or explicit blockers.
- "Decisions" = commitments delivered / notable choices.
- "Clients touched" = distinct clients interacted with.
- "Spend" = Claude API / external spend if provided, else —.
- Do not invent data not present in the input.`;

function buildUserMessage(
  repo: string,
  weekKey: string,
  input: DigestInput,
): string {
  // Cap each list so a pathological week can't blow the token budget.
  const cap = <T>(a: T[], n: number) => a.slice(0, n);
  const payload = {
    repo,
    week: weekKey,
    pulse: cap(input.pulse, 60).map((e) => ({ type: e.type, label: e.label })),
    closedIssues: cap(input.closedIssues, 60).map((i) => i.title),
    mergedPRs: cap(input.mergedPRs, 60).map((p) => p.title),
    commitmentsDelivered: cap(input.commitmentsDelivered, 40).map((c) => ({
      text: c.text,
      client: c.client,
    })),
    auditFindings: cap(input.auditFindings, 40).map((f) => ({
      title: f.title,
      severity: f.severity,
    })),
    spendUsd: input.spendUsd ?? null,
  };
  return `Project activity for ISO week ${weekKey}:\n\n${JSON.stringify(
    payload,
    null,
    2,
  )}\n\nWrite the weekly digest.`;
}

/** Rough token estimate for a string (~4 chars/token heuristic). */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/**
 * Estimated USD cost of one digest generation for `input`, for the
 * Regenerate confirmation preview. Honours the active fallback so the
 * preview reflects the model that will actually run.
 */
export function estimateDigestCost(
  repo: string,
  weekISO: string | Date,
  input: DigestInput,
): { model: string; usd: number; budgetFallback: boolean } {
  const weekKey = normalizeWeekKey(weekISO);
  const model = effectiveModel(DIGEST_MODEL);
  const inputTokens =
    estimateTokens(SYSTEM_PROMPT) +
    estimateTokens(buildUserMessage(repo, weekKey, input));
  const usd = estimateCost(model, inputTokens, MAX_OUTPUT_TOKENS);
  return { model, usd, budgetFallback: shouldFallbackToHaiku() };
}

// ── Persistence helpers ─────────────────────────────────────────────────────

function digestPath(repo: string, weekKey: string): string {
  return `digests/${repo}/${weekKey}.md`;
}

function portfolioPath(weekKey: string): string {
  return `digests/${weekKey}-portfolio.md`;
}

function metaPath(repo: string, weekKey: string): string {
  return `digests/${repo}/${weekKey}.meta.json`;
}

/**
 * Best-effort commit of the digest + its meta sidecar. A failure here
 * is logged and swallowed: the caller still has the markdown (cached
 * and returned), and losing the GitHub commit must not lose the digest.
 */
async function persistDigest(
  repo: string,
  weekKey: string,
  entry: DigestEntry,
): Promise<void> {
  const meta: DigestMeta = {
    repo,
    week: weekKey,
    generatedAt: entry.generatedAt,
    budgetFallback: entry.budgetFallback,
  };
  try {
    await writeFile(
      DIGEST_REPO,
      digestPath(repo, weekKey),
      entry.markdown,
      `chore(digest): ${repo} weekly digest ${weekKey}`,
    );
    await writeFile(
      DIGEST_REPO,
      metaPath(repo, weekKey),
      JSON.stringify(meta, null, 2) + "\n",
      `chore(digest): ${repo} digest meta ${weekKey}`,
    );
  } catch (e) {
    console.warn(
      `weeklyDigest: failed to persist ${repo} ${weekKey} to repo:`,
      e,
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface GenerateDigestOptions {
  /** Skip the cache and overwrite it (Regenerate button). */
  force?: boolean;
  /**
   * Skip the GitHub commit (used by tests / preview). The digest is
   * still cached and returned.
   */
  skipPersist?: boolean;
}

/**
 * Generate (or load from cache) the weekly digest for one project.
 *
 * Returns a `DigestEntry` whose `markdown` always contains the six
 * canonical sections. Never throws for an empty input, missing Claude
 * key, or a persistence failure — it degrades to a deterministic
 * locally-rendered digest instead.
 *
 * `options.force` invalidates the cache first (Regenerate).
 */
export async function generateDigest(
  repo: string,
  weekISO: string | Date,
  input: DigestInput,
  options: GenerateDigestOptions = {},
): Promise<DigestEntry> {
  const weekKey = normalizeWeekKey(weekISO);

  if (options.force) {
    invalidateDigestCache(repo, weekKey);
  } else {
    const cached = readCache(repo, weekKey);
    if (cached !== null) return cached;
  }

  let markdown: string;
  let budgetFallback = false;
  const apiKey = getClaudeKey();

  if (!apiKey) {
    // No key configured — deterministic digest so the UI still shows
    // the six sections with real data.
    markdown = renderFallbackDigest(input);
  } else {
    try {
      // FR-41: refuse past the hard-stop, downgrade past the fallback.
      assertNotHardStopped();
      budgetFallback = shouldFallbackToHaiku();
      const model = effectiveModel(DIGEST_MODEL);
      const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
      });
      const response = await client.messages
        .create({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: buildUserMessage(repo, weekKey, input),
            },
          ],
        })
        .catch((e) => {
          throw maybeDispatchAuthLostFromError("claude", e);
        });
      // Log spend BEFORE parsing so a malformed response still bills.
      logCall({
        type: "digest",
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      markdown = text.length > 0 ? text : renderFallbackDigest(input);
    } catch (e) {
      // Budget hard-stop, network, auth, parse — degrade gracefully.
      console.warn(`weeklyDigest: Claude generation failed for ${repo}:`, e);
      markdown = renderFallbackDigest(input);
    }
  }

  const entry: DigestEntry = {
    week: weekKey,
    generatedAt: new Date().toISOString(),
    markdown: enforceSectionSkeleton(markdown),
    budgetFallback,
  };

  // Cache first (cheap, local) so even a slow/failing commit doesn't
  // make the user wait or lose the digest.
  writeCache(repo, weekKey, entry);
  if (!options.skipPersist) {
    await persistDigest(repo, weekKey, entry);
  }
  return entry;
}

/**
 * Read back a previously-generated digest for `repo` / `weekISO`.
 *
 * Resolution order: localStorage cache → committed file in the repo.
 * Returns `null` when neither exists (no history yet). Never throws —
 * a read failure is treated as "no digest".
 *
 * Used by the viewer's history dropdown and (Task-09) `useProjectHub`.
 */
export async function loadDigest(
  repo: string,
  weekISO: string | Date,
  force = false,
): Promise<DigestEntry | null> {
  let weekKey: string;
  try {
    weekKey = normalizeWeekKey(weekISO);
  } catch {
    return null;
  }

  // `force` bypasses the localStorage cache so a forced portfolio
  // regenerate re-reads the committed per-project digest (source of
  // truth) instead of a possibly-stale cached copy. The committed file
  // re-seeds the cache below either way (#415).
  if (!force) {
    const cached = readCache(repo, weekKey);
    if (cached !== null) return cached;
  }

  try {
    const file = await readFile(DIGEST_REPO, digestPath(repo, weekKey));
    if (file === null) return null;
    // Best-effort meta sidecar for the budget-fallback badge.
    let meta: DigestMeta | null = null;
    try {
      const metaFile = await readFile(DIGEST_REPO, metaPath(repo, weekKey));
      if (metaFile !== null) {
        meta = JSON.parse(metaFile.content) as DigestMeta;
      }
    } catch {
      meta = null;
    }
    const entry: DigestEntry = {
      week: weekKey,
      generatedAt: meta?.generatedAt ?? new Date().toISOString(),
      markdown: file.content,
      budgetFallback: meta?.budgetFallback === true,
    };
    // Re-seed the cache so subsequent loads are local.
    writeCache(repo, weekKey, entry);
    return entry;
  } catch (e) {
    console.warn(`weeklyDigest: failed to load ${repo} ${weekKey}:`, e);
    return null;
  }
}

/**
 * The most recent up-to-`count` digests for a project, newest first,
 * for the history dropdown. Missing weeks are skipped (not all weeks
 * have a digest). Reads run sequentially-bounded via `Promise.all`
 * over a fixed small window (≤12) — not an N+1 over unbounded data.
 */
export async function loadDigestHistory(
  repo: string,
  count = 12,
  from: Date = new Date(),
): Promise<DigestEntry[]> {
  const weeks = recentWeekKeys(count, from);
  const results = await Promise.all(
    weeks.map((w) => loadDigest(repo, w).catch(() => null)),
  );
  return results.filter((d): d is DigestEntry => d !== null);
}

/**
 * Generate the cross-portfolio digest for a week: collects every
 * per-project digest + meta and stitches them into a single
 * `digests/{YYYY-WW}-portfolio.md` at the digests root.
 *
 * Projects without a digest for the week are listed under a short
 * "No digest" note rather than omitted silently, so the roll-up makes
 * coverage gaps visible. Never throws — a failed per-project read is
 * counted as "no digest".
 *
 * `options.force` (Regenerate) is threaded into each per-project
 * `loadDigest` so the roll-up re-reads committed per-project digests
 * instead of stitching from possibly-stale localStorage caches (#415).
 */
export async function generatePortfolioDigest(
  weekISO: string | Date,
  options: GenerateDigestOptions = {},
): Promise<DigestEntry> {
  const weekKey = normalizeWeekKey(weekISO);

  const repos = PROJECTS.map((p) => p.repo);
  const loaded = await Promise.all(
    repos.map(async (repo) => ({
      repo,
      entry: await loadDigest(repo, weekKey, options.force).catch(() => null),
    })),
  );

  const withDigest = loaded.filter((x) => x.entry !== null);
  const without = loaded.filter((x) => x.entry === null).map((x) => x.repo);
  const anyFallback = withDigest.some((x) => x.entry!.budgetFallback);

  const parts: string[] = [];
  parts.push(`# Portfolio digest — ${weekKey}`);
  parts.push("");
  parts.push(
    `_${withDigest.length}/${repos.length} проектов с дайджестом за неделю._`,
  );
  if (anyFallback) {
    parts.push("");
    parts.push("> ⚠️ Часть дайджестов сгенерирована на Haiku (budget fallback).");
  }
  parts.push("");

  for (const { repo, entry } of withDigest) {
    parts.push(`## ${repo}`);
    if (entry!.budgetFallback) parts.push("_budget fallback (Haiku)_");
    parts.push("");
    // Demote the per-project H2 sections to H3 so they nest under the
    // per-repo H2 without colliding with the portfolio outline.
    parts.push(entry!.markdown.replace(/^##\s+/gm, "### "));
    parts.push("");
  }

  if (without.length > 0) {
    parts.push("## Без дайджеста");
    parts.push(without.map((r) => `- ${r}`).join("\n"));
    parts.push("");
  }

  const markdown = parts.join("\n").trimEnd() + "\n";
  const entry: DigestEntry = {
    week: weekKey,
    generatedAt: new Date().toISOString(),
    markdown,
    budgetFallback: anyFallback,
  };

  if (!options.skipPersist) {
    try {
      await writeFile(
        DIGEST_REPO,
        portfolioPath(weekKey),
        markdown,
        `chore(digest): portfolio digest ${weekKey}`,
      );
    } catch (e) {
      console.warn(
        `weeklyDigest: failed to persist portfolio ${weekKey}:`,
        e,
      );
    }
  }
  return entry;
}

/** Re-exported for callers that only need the owner constant. */
export { GITHUB_OWNER };
