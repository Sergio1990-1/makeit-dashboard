/**
 * Next Best Action engine (Epic-012 Task-05, FR-38, FR-39).
 *
 * Produces ranked "what to do next" recommendations:
 *   - `computeProjectNBA(repo, inputs)` → top-3 per-project actions
 *   - `computePortfolioNBA(perProjectActions)` → top-5 cross-portfolio
 *
 * Design — **pure-injectable** (same pattern as the DORA calculator,
 * Epic-012 Task-03 / #381 and the Decision Log extractor, #379):
 * the caller injects the raw signals (audit findings, risks, overdue
 * commitments, drift indicators, inbox). This engine does NOT import
 * `health-engine`, `commitmentsExtractor` (Epic-011 Task-02 — does not
 * exist yet), or any concrete data client. It only depends on
 * `claudeBudget` (Task-01, already on main) for cap enforcement and on
 * the Anthropic SDK for the model call.
 *
 * Model: Claude Sonnet, downgraded to Haiku via `effectiveModel` when
 * `shouldFallbackToHaiku()` is true (FR-41 budget fallback). On budget
 * hard-stop the engine returns the last good cached result plus a
 * `warning` instead of throwing, so the UI degrades rather than breaks.
 *
 * Cache: `localStorage`, week-scoped.
 *   - per-project → `makeit_nba:{repo}`
 *   - portfolio   → `makeit_portfolio_nba`
 * A cache entry is fresh only within the ISO week it was written; a new
 * week always forces a real recompute. #476: a per-project entry also
 * carries the signature of the inputs that produced it, so
 * `computeProjectNBA(repo, inputs, apiKey, sig)` recomputes when the
 * signals changed *within* the same ISO week — including across a full
 * page reload (the engine gates on the stored `env.sig`, so no hook-side
 * ref workaround is needed). A no-sig caller (portfolio) keeps the pure
 * ISO-week behavior. `invalidateNbaCache(scope)` powers the "Regenerate"
 * button (Epic-010 UI wiring landed in #418/#349).
 *
 * #389: the portfolio aggregate is derived from the per-project results,
 * so a mid-week per-project invalidation could leave the week-scoped
 * portfolio cache stale (desynced from the projects it summarises).
 * `invalidateNbaCache({kind:"project"})` therefore also drops the
 * portfolio cache (option c) so the next `computePortfolioNBA`
 * recomputes from fresh inputs. The cache is kept (not removed) because
 * `usePortfolioNba` reads `makeit_portfolio_nba` directly for the
 * sidebar NBA badge (#349) and the «Сгенерирован N дней назад» label.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { HealthSeverity } from "../types/health";
import {
  assertNotHardStopped,
  effectiveModel,
  isHardStopped,
  logCall,
} from "./claudeBudget";
import { SONNET_MODEL } from "./claudeModels";
import { maybeDispatchAuthLostFromError } from "./external-auth-events";

// ── Public types ───────────────────────────────────────────────────────────

/**
 * A single ranked recommendation. Shape per Task-05 spec
 * (`title / rationale / severity / link`). The Epic-009/010 hub consumer
 * adapts this to the lighter `NextBestAction` (`text / reason`) — that
 * mapping lives with the consumer, not here, to keep the engine
 * decoupled from the hub aggregate.
 */
export interface NbaAction {
  /** Stable id (scope + index) so React keys don't churn between renders. */
  id: string;
  /** Short imperative recommendation. */
  title: string;
  /** Why this matters now — grounded in the injected signals. */
  rationale: string;
  /** Severity drives portfolio ranking and UI colour. */
  severity: HealthSeverity;
  /** Optional deep link (issue url, hub tab, doc) — may be empty. */
  link?: string;
  /** Repo this action belongs to (set for portfolio aggregation). */
  repo?: string;
}

/** One audit finding the caller wants the engine to weigh. */
export interface NbaFindingInput {
  severity: HealthSeverity;
  description: string;
  file?: string;
  line?: number;
}

/** One known risk (Risk Register entry, Epic-011 Task-03 — injected). */
export interface NbaRiskInput {
  title: string;
  severity: HealthSeverity;
  status?: string;
}

/**
 * One overdue commitment. `commitmentsExtractor` (Epic-011 Task-02) does
 * NOT exist yet — this field is optional and the caller supplies it
 * later. Empty/absent → the prompt simply omits the commitments section.
 */
export interface NbaCommitmentInput {
  title: string;
  dueDate: string; // ISO
  daysOverdue?: number;
}

/** One drift indicator (norm violation) — free-form label + severity. */
export interface NbaDriftInput {
  label: string;
  severity?: HealthSeverity;
}

/** One inbox item (unread mention / review request / alert). */
export interface NbaInboxInput {
  label: string;
  url?: string;
}

/**
 * Everything the engine reasons over for one project. Every list is
 * optional and gracefully degrades — an all-empty input still returns a
 * valid (possibly empty) result rather than throwing.
 */
export interface NbaInputs {
  findings?: NbaFindingInput[];
  risks?: NbaRiskInput[];
  overdueCommitments?: NbaCommitmentInput[];
  drift?: NbaDriftInput[];
  inbox?: NbaInboxInput[];
}

/** Result envelope — never throws to the caller on budget hard-stop. */
export interface NbaResult {
  actions: NbaAction[];
  /** True when the model was downgraded Sonnet → Haiku for budget. */
  budgetFallback: boolean;
  /** Set when we served stale cache instead of a fresh call. */
  warning?: string;
}

export type NbaScope = { kind: "project"; repo: string } | { kind: "portfolio" };

// ── Constants ──────────────────────────────────────────────────────────────

const PROJECT_KEY_PREFIX = "makeit_nba";
const PORTFOLIO_KEY = "makeit_portfolio_nba";

const PROJECT_TOP_N = 3;
const PORTFOLIO_TOP_N = 5;
/** Cap injected list sizes per the spec (top-3 / top-5) before prompting. */
const MAX_FINDINGS = 3;
const MAX_RISKS = 3;
const MAX_COMMITMENTS = 3;
const MAX_DRIFT = 5;
const MAX_INBOX = 5;

/** Numeric weight per severity — higher = ranked first in portfolio. */
const SEVERITY_RANK: Record<HealthSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ── ISO-week cache plumbing ────────────────────────────────────────────────

/**
 * ISO-8601 week key, e.g. `2026-W18`, in UTC so it is deterministic
 * across timezones (matches the `claudeBudget` month-key convention).
 */
function isoWeekKey(d: Date = new Date()): string {
  // Copy to avoid mutating the caller's Date.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7. Shift to the Thursday of this week —
  // the ISO week-year is defined by which year that Thursday lands in.
  const dayNum = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

interface CacheEnvelope {
  week: string;
  result: NbaResult;
  /**
   * Signature of the inputs that produced `result` (#476). Optional: a
   * caller may not supply one (portfolio aggregate, budget-degrade reads)
   * and envelopes written before #476 lack it entirely. `readCache` only
   * gates on it when the caller passes a defined `sig` AND `requireFresh`
   * — so a no-sig caller keeps the pure ISO-week behavior, and an old
   * sig-less envelope is treated as stale exactly once (one recompute,
   * then a rewrite carries the sig and the cache stabilises).
   */
  sig?: string;
}

function scopeKey(scope: NbaScope): string {
  return scope.kind === "project"
    ? `${PROJECT_KEY_PREFIX}:${scope.repo}`
    : PORTFOLIO_KEY;
}

/**
 * Read the cache for `scope`. `requireFresh=true` (the normal path)
 * returns `null` when the entry is from an earlier ISO week so the
 * caller recomputes. `requireFresh=false` (budget hard-stop fallback)
 * returns even a stale entry so the UI has *something* to show.
 *
 * `sig` (#476) is the signature of the inputs the caller is about to
 * compute over. It is ONLY consulted when `requireFresh === true` AND a
 * defined `sig` is supplied: then a stored `env.sig` differing from it
 * (including the `undefined → defined` case for a pre-#476 envelope)
 * means the same-ISO-week entry was produced by *different* inputs, so
 * it is treated as stale and `null` is returned for a recompute. When
 * `sig` is undefined the check is skipped entirely — every existing
 * no-sig caller (portfolio aggregate, budget-degrade `requireFresh=false`
 * reads) keeps its exact pre-#476 ISO-week-only behavior.
 */
function readCache(
  scope: NbaScope,
  requireFresh: boolean,
  sig?: string,
): NbaResult | null {
  if (typeof localStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(scopeKey(scope));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const env = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (
      env === null ||
      typeof env.week !== "string" ||
      env.result === undefined ||
      !Array.isArray(env.result.actions)
    ) {
      return null;
    }
    if (requireFresh && env.week !== isoWeekKey()) return null;
    // Signature gate (#476): only when the caller supplied a defined
    // `sig` and wants a fresh entry. `env.sig !== sig` covers both a
    // genuine input change and a pre-#476 envelope (`env.sig` undefined
    // vs a defined incoming `sig`) → treated as stale → one recompute,
    // then `writeCache` rewrites with `sig` and the cache stabilises.
    if (requireFresh && sig !== undefined && env.sig !== sig) return null;
    return env.result;
  } catch {
    return null;
  }
}

function writeCache(
  scope: NbaScope,
  result: NbaResult,
  sig?: string,
): void {
  if (typeof localStorage === "undefined") return;
  // Store `sig` only when supplied — a no-sig caller (portfolio) writes a
  // sig-less envelope exactly as before, and `JSON.stringify` drops the
  // undefined key so the on-disk shape is unchanged for those callers.
  const env: CacheEnvelope = { week: isoWeekKey(), result, sig };
  try {
    localStorage.setItem(scopeKey(scope), JSON.stringify(env));
  } catch {
    // Quota exceeded / disabled storage / private mode — cache is
    // best-effort, the freshly-computed result is still returned.
  }
}

/**
 * Drop the cached entry for one scope so the next compute call makes a
 * real Claude request. Powers the "Regenerate" button (Epic-010 UI).
 *
 * #389: a per-project change can reshuffle the portfolio top-5, so
 * invalidating any project also drops the portfolio aggregate (option c)
 * — the next `computePortfolioNBA` then recomputes from fresh inputs
 * instead of serving a stale mid-week portfolio cache.
 */
export function invalidateNbaCache(scope: NbaScope): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(scopeKey(scope));
    if (scope.kind === "project") {
      localStorage.removeItem(PORTFOLIO_KEY);
    }
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

// ── Prompt construction ────────────────────────────────────────────────────

const NBA_SYSTEM_PROMPT = `You are a senior delivery lead for a micro software studio.
Given a project's current signals, recommend the single most valuable next actions.

Rules:
- Output ONLY a JSON array, no markdown fences, no prose.
- At most ${PROJECT_TOP_N} items, ordered most-important first.
- Each item: {"title": <≤90 chars imperative>, "rationale": <1-2 sentences, grounded in the signals>, "severity": <"critical"|"high"|"medium"|"low">, "link": <url or "" if none>}.
- "severity" must reflect real urgency: data loss / security / down service / overdue client commitment = critical or high.
- Be concrete. Reference the actual finding/risk/commitment, never invent facts not present in the input.
- If there is nothing meaningful to act on, return [].`;

/** Truncate a free-text field so a hostile/huge input can't blow the prompt. */
function clip(s: string, max = 280): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function buildUserPrompt(repo: string, inputs: NbaInputs): string {
  const sections: string[] = [`Project: ${repo}`];

  const findings = (inputs.findings ?? []).slice(0, MAX_FINDINGS);
  if (findings.length > 0) {
    sections.push(
      "Top audit findings:\n" +
        findings
          .map(
            (f) =>
              `- [${f.severity}] ${clip(f.description)}${
                f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""
              }`,
          )
          .join("\n"),
    );
  }

  const risks = (inputs.risks ?? []).slice(0, MAX_RISKS);
  if (risks.length > 0) {
    sections.push(
      "Top risks:\n" +
        risks
          .map(
            (r) =>
              `- [${r.severity}] ${clip(r.title)}${
                r.status ? ` (status: ${r.status})` : ""
              }`,
          )
          .join("\n"),
    );
  }

  // `overdueCommitments` is optional — `commitmentsExtractor` (Epic-011
  // Task-02) does not exist yet. When absent we simply omit the section
  // so the model isn't told to weigh data we never had.
  const commitments = (inputs.overdueCommitments ?? []).slice(0, MAX_COMMITMENTS);
  if (commitments.length > 0) {
    sections.push(
      "Overdue commitments:\n" +
        commitments
          .map(
            (c) =>
              `- ${clip(c.title)} (due ${c.dueDate}${
                c.daysOverdue != null ? `, ${c.daysOverdue}d overdue` : ""
              })`,
          )
          .join("\n"),
    );
  }

  const drift = (inputs.drift ?? []).slice(0, MAX_DRIFT);
  if (drift.length > 0) {
    sections.push(
      "Drift indicators:\n" +
        drift
          .map((d) => `- ${clip(d.label)}${d.severity ? ` [${d.severity}]` : ""}`)
          .join("\n"),
    );
  }

  const inbox = (inputs.inbox ?? []).slice(0, MAX_INBOX);
  if (inbox.length > 0) {
    sections.push(
      "Inbox (unactioned):\n" +
        inbox.map((i) => `- ${clip(i.label)}`).join("\n"),
    );
  }

  sections.push(
    `Return a JSON array of at most ${PROJECT_TOP_N} ranked actions.`,
  );
  return sections.join("\n\n");
}

function hasAnySignal(inputs: NbaInputs): boolean {
  return (
    (inputs.findings?.length ?? 0) > 0 ||
    (inputs.risks?.length ?? 0) > 0 ||
    (inputs.overdueCommitments?.length ?? 0) > 0 ||
    (inputs.drift?.length ?? 0) > 0 ||
    (inputs.inbox?.length ?? 0) > 0
  );
}

// ── Response parsing ───────────────────────────────────────────────────────

interface RawAction {
  title?: unknown;
  rationale?: unknown;
  severity?: unknown;
  link?: unknown;
}

function coerceSeverity(v: unknown): HealthSeverity {
  if (v === "critical" || v === "high" || v === "medium" || v === "low") {
    return v;
  }
  // Unknown / missing severity defaults to "medium" so a malformed model
  // row still ranks deterministically instead of crashing the sort.
  return "medium";
}

function parseActions(text: string, repo: string): NbaAction[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (match === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: NbaAction[] = [];
  parsed.slice(0, PROJECT_TOP_N).forEach((row, idx) => {
    const r = row as RawAction;
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (title.length === 0) return; // skip junk rows
    out.push({
      id: `${repo}:${idx}`,
      title: title.slice(0, 200),
      rationale: typeof r.rationale === "string" ? r.rationale.trim() : "",
      severity: coerceSeverity(r.severity),
      link:
        typeof r.link === "string" && r.link.trim().length > 0
          ? r.link.trim()
          : undefined,
      repo,
    });
  });
  return out;
}

// ── computeProjectNBA ──────────────────────────────────────────────────────

/**
 * Top-3 next actions for one project.
 *
 * Order of operations:
 *   1. Fresh week-cache hit (same ISO week AND, when `sig` is supplied,
 *      same input signature) → return it, no Claude call.
 *   2. No actionable signal → return empty result (and cache it, keyed by
 *      `sig`, so we don't re-prompt an empty project every render).
 *   3. Budget hard-stop → return stale cache + warning, never throw.
 *   4. Otherwise call Claude (Sonnet, or Haiku on budget fallback),
 *      parse, cache, return.
 *
 * `apiKey` is injected by the caller (pure-injectable — the engine never
 * reads it from config/localStorage itself).
 *
 * `sig` (#476) is an optional signature of `inputs`. When supplied, a
 * same-ISO-week cache entry produced by a *different* signature (or by a
 * pre-#476 sig-less write) is treated as stale → one recompute, then the
 * rewrite carries `sig` and the cache stabilises. Omitting `sig`
 * preserves the exact pre-#476 behavior (ISO-week-only freshness) for
 * every existing caller (`portfolioNbaCollector`). The stale-fallback
 * budget-degrade `readCache(scope, false)` reads deliberately pass NO
 * sig — they intentionally serve any last-good cache.
 */
export async function computeProjectNBA(
  repo: string,
  inputs: NbaInputs,
  apiKey: string,
  sig?: string,
): Promise<NbaResult> {
  const scope: NbaScope = { kind: "project", repo };

  const fresh = readCache(scope, true, sig);
  if (fresh !== null) return fresh;

  if (!hasAnySignal(inputs)) {
    const empty: NbaResult = { actions: [], budgetFallback: false };
    // Key the empty result by `sig` too: an empty cached under an old
    // signature must not serve under a new one (otherwise a project that
    // gained a risk/commitment after a no-signal run would keep showing
    // empty for the rest of the ISO week).
    writeCache(scope, empty, sig);
    return empty;
  }

  // Budget hard-stop: never throw at the caller. Serve the last good
  // cache (even if stale) so the UI degrades; if there is nothing
  // cached, return an empty result carrying the warning.
  if (isHardStopped()) {
    const stale = readCache(scope, false);
    const warning =
      "Claude budget hard-stopped — showing last cached actions.";
    // Normalize budgetFallback: a hard-stop / missing-key degrade is not
    // a Haiku fallback, so don't let a stale `true` light the budget badge.
    return stale !== null
      ? { ...stale, budgetFallback: false, warning }
      : { actions: [], budgetFallback: false, warning };
  }

  if (!apiKey) {
    // No key injected — degrade to stale cache rather than a hard error.
    const stale = readCache(scope, false);
    const warning = "Claude API key not configured — showing cached actions.";
    // Normalize budgetFallback: a hard-stop / missing-key degrade is not
    // a Haiku fallback, so don't let a stale `true` light the budget badge.
    return stale !== null
      ? { ...stale, budgetFallback: false, warning }
      : { actions: [], budgetFallback: false, warning };
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  // assertNotHardStopped re-checks under a possible race (another tab
  // pushing us over the cap between the isHardStopped() above and here).
  try {
    assertNotHardStopped();
  } catch {
    const stale = readCache(scope, false);
    const warning =
      "Claude budget hard-stopped — showing last cached actions.";
    // Normalize budgetFallback: a hard-stop / missing-key degrade is not
    // a Haiku fallback, so don't let a stale `true` light the budget badge.
    return stale !== null
      ? { ...stale, budgetFallback: false, warning }
      : { actions: [], budgetFallback: false, warning };
  }

  const model = effectiveModel(SONNET_MODEL);
  const budgetFallback = !model.toLowerCase().includes("sonnet");

  try {
    const response = await client.messages
      .create({
        model,
        max_tokens: 1024,
        system: NBA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(repo, inputs) }],
      })
      .catch((e) => {
        // FR-8: surface an invalid Claude key as auth-lost so the user
        // can rotate it; re-throw so the catch below degrades gracefully.
        throw maybeDispatchAuthLostFromError("claude", e);
      });

    // Account for spend before touching the payload — Anthropic billed
    // us regardless of whether parsing succeeds.
    logCall({
      type: "nba",
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const result: NbaResult = {
      actions: parseActions(text, repo),
      budgetFallback,
    };
    writeCache(scope, result, sig);
    return result;
  } catch (e) {
    // Network / parse / auth failure must not break the dashboard.
    // Prefer any cache (even stale) over an empty screen.
    console.warn(`computeProjectNBA failed for ${repo}:`, e);
    const stale = readCache(scope, false);
    const warning = "Could not refresh actions — showing cached data.";
    // budgetFallback reflects THIS run's model choice (computed above),
    // which is more accurate than the stale envelope's stored value.
    return stale !== null
      ? { ...stale, budgetFallback, warning }
      : { actions: [], budgetFallback, warning };
  }
}

// ── computePortfolioNBA ────────────────────────────────────────────────────

/**
 * Cross-portfolio top-5. Aggregation is local (no Claude call): take the
 * #1 action from each project, sort by severity (then a deterministic
 * tiebreak), keep the top 5. Result is week-cached under
 * `makeit_portfolio_nba` so `usePortfolioNba` can render it (and the
 * sidebar badge / freshness label) without recomputing every mount.
 *
 * #389: this cache could desync from the per-project caches when a
 * single project was invalidated mid-week. Fixed at the invalidation
 * site — `invalidateNbaCache({kind:"project"})` also drops this
 * portfolio cache — so a stale entry here can only survive while the
 * per-project inputs it summarises are themselves unchanged.
 *
 * `perProjectActions` is the list of per-project results the caller
 * already computed (one entry per project). Empty input → empty result.
 * `budgetFallback` is true if ANY contributing project fell back. Stays
 * `async` to preserve the existing call signature.
 */
export async function computePortfolioNBA(
  perProjectActions: NbaResult[],
): Promise<NbaResult> {
  const scope: NbaScope = { kind: "portfolio" };

  const fresh = readCache(scope, true);
  if (fresh !== null) return fresh;

  // Take the top-1 from each project that produced at least one action.
  const top1: NbaAction[] = [];
  let anyFallback = false;
  for (const p of perProjectActions) {
    if (p.budgetFallback) anyFallback = true;
    if (p.actions.length > 0) top1.push(p.actions[0]);
  }

  // Sort by severity desc with a deterministic tiebreak (title, then
  // link) so the top-5 is stable regardless of how the caller iterated
  // projects (Map/Object.entries order is not guaranteed).
  const ranked = [...top1].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byTitle = a.title.localeCompare(b.title);
    if (byTitle !== 0) return byTitle;
    return (a.link ?? "").localeCompare(b.link ?? "");
  });

  const result: NbaResult = {
    actions: ranked.slice(0, PORTFOLIO_TOP_N),
    budgetFallback: anyFallback,
  };
  writeCache(scope, result);
  return result;
}
