/**
 * Customer Health Score (Epic-012 Task-07, PRD-008 FR-37).
 *
 * Composite 0-100 score per project, blended from four sub-components:
 *
 *   score = sentiment×0.3 + cadence×0.3 + delivery×0.3 + paid×0.1
 *
 *   - **sentiment** (0-100): Claude Haiku over the last 3 transcripts of
 *     the project → positive/neutral/negative weighted (100/50/0).
 *   - **cadence** (0-100): actual meeting interval vs the
 *     `client_touch_interval_days` baseline from `driftNorm`. 100 when
 *     the interval is ≤ baseline, linear decay to 0 at 3× baseline.
 *   - **delivery** (0-100): share of commitments delivered on-time over
 *     the last 90 days (status=done within its due date).
 *   - **paid** (0-100): 100 if paid on time, 0 if overdue > 30 days,
 *     linear decay between.
 *
 * If the project has no transcript newer than 120 days → `score = 'n/a'`
 * (per FR / epic-012: don't show a number we can't trust).
 *
 * Sparkline: 90 daily score values. The score is recomputed at most
 * once a week (triggered by the manual "Recompute" button or an NBA
 * regeneration); in between, the cached value is reused and the
 * sparkline is back-filled so it always covers a full 90-day window.
 *
 * Cache: `makeit_health:{repo}` in localStorage, holding the last
 * computed result plus a dated history used to draw the sparkline.
 *
 * Failure model: every external dependency (Claude, transcript fetch,
 * commitments yaml, drift baseline) is wrapped — a failure degrades the
 * affected component to a neutral value rather than throwing, so the
 * gauge always renders. The function never throws.
 */

import type { ProjectTier } from "./driftNorm";
import { loadProjectNorm } from "./driftNorm";
import { readMarkdown, readYaml } from "./github-contents";
import {
  extractCommitments,
  type CommitmentsYaml,
} from "./commitmentsExtractor";
import {
  fetchTranscriptList,
  fetchTranscriptResult,
  type TranscriptListItem,
} from "./transcript";
import { callClaudeWithTool } from "./claude";
import { getClaudeKey } from "./config";

// ── Public types ──────────────────────────────────────────────────────────

/**
 * The four weighted sub-components, each in `[0, 100]`. `null` means
 * "could not be measured" (no data / dependency failed) and is treated
 * as a neutral 50 inside the blended score so a single missing signal
 * doesn't tank or inflate the overall health.
 */
export interface HealthComponents {
  sentiment: number | null;
  cadence: number | null;
  delivery: number | null;
  paid: number | null;
}

/**
 * One dated point of the 90-day sparkline. `score` is the blended value
 * for that day (always a number — `n/a` days are simply absent).
 */
export interface HealthHistoryPoint {
  /** YYYY-MM-DD (UTC). */
  date: string;
  score: number;
}

/**
 * Result of `computeHealth`. `score` is either a `0..100` number or the
 * string `'n/a'` when transcripts are too stale to trust the sentiment
 * input (epic-012 / FR-37).
 */
export interface CustomerHealthResult {
  /** Blended score, or `'n/a'` when no transcript in the last 120 days. */
  score: number | "n/a";
  components: HealthComponents;
  /**
   * 90 daily values, oldest → newest, suitable for a sparkline. Empty
   * when the score is `'n/a'` (nothing trustworthy to chart).
   */
  sparkline: number[];
  /** ISO-8601 timestamp the score was (re)computed. */
  computedAt: string;
}

// ── Configurable constants ────────────────────────────────────────────────

/** Component weights — must mirror FR-37 exactly. Sum = 1.0. */
const WEIGHTS = {
  sentiment: 0.3,
  cadence: 0.3,
  delivery: 0.3,
  paid: 0.1,
} as const;

/** Neutral fallback for a component that could not be measured. */
const NEUTRAL_COMPONENT = 50;

/** Sparkline / delivery look-back window. */
const WINDOW_DAYS = 90;

/** No transcript newer than this → `score = 'n/a'`. */
const STALE_TRANSCRIPT_DAYS = 120;

/** A `paid` debt older than this scores 0 (linear decay before that). */
const PAID_GRACE_DAYS = 30;

/** Recompute throttle: a cached score younger than this is reused. */
const RECOMPUTE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** How many recent transcripts feed the sentiment model. */
const SENTIMENT_TRANSCRIPT_COUNT = 3;

/** Bound each transcript slice fed to Claude (token / cost safety). */
const MAX_TRANSCRIPT_CHARS = 6000;

const CACHE_PREFIX = "makeit_health:";
const BRIEF_PATH = "docs/BRIEF.md";
const COMMITMENTS_PATH = "docs/commitments.yaml";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Haiku is the cheapest tier and what FR-37 specifies for sentiment. */
const SENTIMENT_MODEL = "claude-haiku-4-5-20251001" as const;

// ── Cache shape ───────────────────────────────────────────────────────────

interface CacheEntry {
  /** Last computed result (sans sparkline — that is rebuilt from history). */
  score: number | "n/a";
  components: HealthComponents;
  computedAt: string;
  /**
   * Dated score history (one point per recompute). Trimmed to the last
   * `WINDOW_DAYS` on every write so the cache can't grow unbounded.
   */
  history: HealthHistoryPoint[];
}

/** YYYY-MM-DD in UTC — deterministic across timezones. */
function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function readCache(repo: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + repo);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof parsed.computedAt !== "string"
    ) {
      return null;
    }
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter(
          (p): p is HealthHistoryPoint =>
            !!p &&
            typeof p.date === "string" &&
            typeof p.score === "number" &&
            Number.isFinite(p.score),
        )
      : [];
    const score =
      parsed.score === "n/a" ||
      (typeof parsed.score === "number" && Number.isFinite(parsed.score))
        ? parsed.score
        : "n/a";
    return {
      score,
      components: coerceComponents(parsed.components),
      computedAt: parsed.computedAt,
      history,
    };
  } catch {
    return null;
  }
}

function writeCache(repo: string, entry: CacheEntry): void {
  try {
    // Trim history to the sparkline window so the cache stays bounded.
    const cutoff = Date.now() - WINDOW_DAYS * ONE_DAY_MS;
    const trimmed = entry.history
      .filter((p) => {
        const t = Date.parse(`${p.date}T00:00:00Z`);
        return Number.isFinite(t) && t >= cutoff;
      })
      .slice(-WINDOW_DAYS);
    localStorage.setItem(
      CACHE_PREFIX + repo,
      JSON.stringify({ ...entry, history: trimmed }),
    );
  } catch {
    // Quota exceeded / storage disabled — the score just won't persist.
  }
}

/** Drop the cached health for one repo (manual "Recompute"). */
export function clearHealthCache(repo: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + repo);
  } catch {
    // Storage disabled — nothing was cached anyway.
  }
}

function coerceComponents(raw: unknown): HealthComponents {
  const empty: HealthComponents = {
    sentiment: null,
    cadence: null,
    delivery: null,
    paid: null,
  };
  if (!raw || typeof raw !== "object") return empty;
  const src = raw as Record<string, unknown>;
  const pick = (k: keyof HealthComponents): number | null => {
    const v = src[k];
    return typeof v === "number" && Number.isFinite(v) ? clamp(v) : null;
  };
  return {
    sentiment: pick("sentiment"),
    cadence: pick("cadence"),
    delivery: pick("delivery"),
    paid: pick("paid"),
  };
}

// ── Pure scoring math (exported for reasoning / reuse) ─────────────────────

/** Clamp any number into the `[0, 100]` score range. */
export function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Blend the four components into the composite score. A `null`
 * component is substituted with `NEUTRAL_COMPONENT` so one missing
 * signal neither tanks nor inflates the result. Weights are fixed
 * (FR-37) and always sum to 1, so no re-normalisation is needed.
 */
export function blendScore(c: HealthComponents): number {
  const s = c.sentiment ?? NEUTRAL_COMPONENT;
  const ca = c.cadence ?? NEUTRAL_COMPONENT;
  const d = c.delivery ?? NEUTRAL_COMPONENT;
  const p = c.paid ?? NEUTRAL_COMPONENT;
  return clamp(
    s * WEIGHTS.sentiment +
      ca * WEIGHTS.cadence +
      d * WEIGHTS.delivery +
      p * WEIGHTS.paid,
  );
}

/**
 * Cadence score from the actual mean meeting interval vs the baseline.
 * 100 when the interval is ≤ baseline (meeting often enough), decaying
 * linearly to 0 at 3× baseline (gone cold). `null` when it can't be
 * measured (no/one meeting, or a non-positive baseline).
 */
export function cadenceScore(
  intervalDays: number | null,
  baselineDays: number,
): number | null {
  if (
    intervalDays === null ||
    !Number.isFinite(intervalDays) ||
    intervalDays < 0 ||
    !Number.isFinite(baselineDays) ||
    baselineDays <= 0
  ) {
    return null;
  }
  if (intervalDays <= baselineDays) return 100;
  // Linear decay from baseline (100) to 3× baseline (0).
  const ratio = (intervalDays - baselineDays) / (2 * baselineDays);
  return clamp(100 * (1 - ratio));
}

/**
 * Paid score. 100 when there is no outstanding debt (paid on time),
 * decaying linearly to 0 once the debt has been outstanding for
 * `PAID_GRACE_DAYS`. When budget is 0 (internal / unpaid project) the
 * component is `null` (not applicable) so it falls back to neutral.
 *
 * `daysOverdue` is how long the project has been short of the expected
 * payment; pass `0` (or negative) when fully paid / not yet due.
 */
export function paidScore(
  budget: number,
  paid: number,
  daysOverdue: number,
): number | null {
  if (!Number.isFinite(budget) || budget <= 0) return null;
  const remaining = budget - paid;
  // Fully paid (or overpaid) → perfect, regardless of any stale clock.
  if (remaining <= 0) return 100;
  if (!Number.isFinite(daysOverdue) || daysOverdue <= 0) return 100;
  if (daysOverdue >= PAID_GRACE_DAYS) return 0;
  return clamp(100 * (1 - daysOverdue / PAID_GRACE_DAYS));
}

/**
 * Delivery score: share of commitments due in the last `WINDOW_DAYS`
 * that were delivered (status=done) on or before their due date.
 * `null` when there are no dated, in-window commitments to judge.
 */
export function deliveryScore(
  commitments: { due: string; status: "open" | "done" | "overdue" }[],
  now: number = Date.now(),
): number | null {
  const windowStart = now - WINDOW_DAYS * ONE_DAY_MS;
  let total = 0;
  let onTime = 0;
  for (const c of commitments) {
    const dueTs = Date.parse(c.due);
    if (!Number.isFinite(dueTs)) continue; // undated — can't judge
    // Only judge commitments whose due date falls inside the window.
    if (dueTs < windowStart || dueTs > now) continue;
    total += 1;
    // On-time = explicitly done. The extractor only marks `done` from
    // the persisted yaml status; `overdue` is derived and never on-time.
    if (c.status === "done") onTime += 1;
  }
  if (total === 0) return null;
  return clamp((onTime / total) * 100);
}

/**
 * Sentiment score from Claude's per-transcript verdicts. Each verdict
 * maps positive→100, neutral→50, negative→0; the score is their mean.
 * `null` when there are no usable verdicts.
 */
export function sentimentScore(
  verdicts: ("positive" | "neutral" | "negative")[],
): number | null {
  if (verdicts.length === 0) return null;
  const map = { positive: 100, neutral: 50, negative: 0 } as const;
  const sum = verdicts.reduce((acc, v) => acc + map[v], 0);
  return clamp(sum / verdicts.length);
}

// ── Sentiment via Claude Haiku ─────────────────────────────────────────────

interface SentimentToolResult {
  /** Per-transcript verdicts, in the order they were supplied. */
  verdicts?: unknown;
}

const SENTIMENT_TOOL = {
  name: "report_sentiment",
  description:
    "Сообщить тональность клиента в каждом транскрипте: positive (доволен, хвалит, расширяет сотрудничество), neutral (рабочий тон без явных сигналов) или negative (недоволен, жалобы, риск оттока).",
  input_schema: {
    type: "object" as const,
    properties: {
      verdicts: {
        type: "array",
        items: { type: "string", enum: ["positive", "neutral", "negative"] },
        description:
          "Массив вердиктов, по одному на каждый транскрипт во входных данных, в том же порядке.",
      },
    },
    required: ["verdicts"],
  },
};

const SENTIMENT_SYSTEM =
  "Ты анализируешь тональность клиента в транскриптах созвонов. " +
  "Для каждого транскрипта верни ровно один вердикт: positive, neutral или negative. " +
  "Оценивай отношение КЛИЕНТА к проекту и команде, а не общий тон беседы. " +
  "Сомневаешься — neutral. Верни вердикты строго в порядке входных транскриптов.";

/**
 * Run Haiku over up to 3 recent transcript bodies and return one
 * verdict per transcript. A single batched call (not one-per-transcript)
 * keeps the cost bounded. Any failure (no key, budget hard-stop,
 * network, malformed reply) returns `[]` — the caller degrades sentiment
 * to neutral rather than failing the whole score.
 */
async function classifySentiment(texts: string[]): Promise<
  ("positive" | "neutral" | "negative")[]
> {
  if (texts.length === 0) return [];
  const apiKey = getClaudeKey();
  if (!apiKey || !apiKey.trim()) return [];

  const userMessage = texts
    .map(
      (t, i) =>
        `=== Транскрипт ${i + 1} ===\n${t.slice(0, MAX_TRANSCRIPT_CHARS)}`,
    )
    .join("\n\n");

  try {
    const result = await callClaudeWithTool<SentimentToolResult>(
      apiKey,
      SENTIMENT_SYSTEM,
      `Проанализируй тональность клиента в ${texts.length} транскрипте(ах) ниже и верни массив вердиктов того же размера.\n\n${userMessage}`,
      SENTIMENT_TOOL,
      SENTIMENT_MODEL,
      512,
      "sentiment",
    );
    const raw = Array.isArray(result.verdicts) ? result.verdicts : [];
    const out: ("positive" | "neutral" | "negative")[] = [];
    for (const v of raw) {
      if (v === "positive" || v === "neutral" || v === "negative") {
        out.push(v);
      } else {
        // Unknown token from the model — treat that slot as neutral
        // rather than dropping it (keeps the mean meaningful).
        out.push("neutral");
      }
    }
    return out;
  } catch {
    // No key / budget hard-stop / network / parse — neutral fallback.
    return [];
  }
}

// ── Data gathering helpers (all best-effort, never throw) ──────────────────

/**
 * Loose repo↔transcript matching. Transcripts carry a free-text
 * `project` context (the same field the Transcripts tab filters on);
 * match case-insensitively on the repo slug appearing in that context
 * (and vice-versa) so `owner/Repo` and `Repo` both resolve.
 */
function transcriptMatchesRepo(item: TranscriptListItem, repo: string): boolean {
  const slug = repo.includes("/") ? repo.split("/")[1] : repo;
  const proj = (item.project || "").toLowerCase();
  if (proj.length === 0) return false;
  const needle = slug.toLowerCase();
  return proj.includes(needle) || needle.includes(proj);
}

/** ISO timestamp → epoch ms, or `NaN` when unparseable. */
function tsOf(iso: string): number {
  return Date.parse(iso);
}

/**
 * Fetch the project's transcripts, newest first. Returns the list (for
 * cadence/staleness) plus the bodies of the newest `count` (for
 * sentiment). All failures degrade to empty.
 */
async function loadTranscripts(
  repo: string,
  count: number,
): Promise<{ items: TranscriptListItem[]; bodies: string[] }> {
  let list: TranscriptListItem[];
  try {
    list = await fetchTranscriptList();
  } catch {
    return { items: [], bodies: [] };
  }
  const mine = list
    .filter((i) => transcriptMatchesRepo(i, repo))
    .filter((i) => Number.isFinite(tsOf(i.created_at)))
    .sort((a, b) => tsOf(b.created_at) - tsOf(a.created_at));

  // Only `done` transcripts have a usable body; queued/errored ones are
  // still kept in `items` for cadence (a meeting happened) but excluded
  // from the sentiment bodies.
  const recentDone = mine.filter((i) => i.status === "done").slice(0, count);
  const bodies: string[] = [];
  for (const item of recentDone) {
    try {
      const res = await fetchTranscriptResult(item.task_id);
      const body = `${res.brief || ""}\n\n${res.transcript || ""}`.trim();
      if (body.length > 0) bodies.push(body);
    } catch {
      // Skip a transcript we can't load — others may still work.
    }
  }
  return { items: mine, bodies };
}

/**
 * Mean gap (in days) between consecutive meetings within the look-back
 * window. `null` when fewer than two in-window meetings exist (can't
 * derive an interval).
 */
function meanMeetingIntervalDays(
  items: TranscriptListItem[],
  now: number,
): number | null {
  const windowStart = now - WINDOW_DAYS * ONE_DAY_MS;
  const times = items
    .map((i) => tsOf(i.created_at))
    .filter((t) => Number.isFinite(t) && t >= windowStart && t <= now)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const span = times[times.length - 1] - times[0];
  const gaps = times.length - 1;
  return span / gaps / ONE_DAY_MS;
}

/** Days since the most recent transcript, or `Infinity` when none. */
function daysSinceLastTranscript(
  items: TranscriptListItem[],
  now: number,
): number {
  let newest = -Infinity;
  for (const i of items) {
    const t = tsOf(i.created_at);
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (newest === -Infinity) return Infinity;
  return (now - newest) / ONE_DAY_MS;
}

/**
 * Load + merge the project's commitments (BRIEF.md + commitments.yaml).
 * Mirrors `CommitmentsTable`'s loading: BRIEF is optional context, a
 * missing yaml is the normal empty state. Any failure → `[]`.
 */
async function loadCommitments(
  repo: string,
  now: number,
): Promise<{ due: string; status: "open" | "done" | "overdue" }[]> {
  let briefMd: string | null = null;
  try {
    const brief = await readMarkdown(repo, BRIEF_PATH);
    briefMd = brief?.content ?? null;
  } catch {
    briefMd = null;
  }
  let yamlData: CommitmentsYaml = null;
  try {
    const res = await readYaml<CommitmentsYaml>(repo, COMMITMENTS_PATH);
    yamlData = res?.data ?? null;
  } catch {
    // Corrupt/inaccessible yaml — treat as no commitments rather than
    // failing the whole health score.
    yamlData = null;
  }
  try {
    return extractCommitments(briefMd, yamlData, now).map((c) => ({
      due: c.due,
      status: c.status,
    }));
  } catch {
    return [];
  }
}

/**
 * Days the project has been short of its expected payment. The
 * dashboard has no per-milestone invoice schedule, so we proxy
 * "overdue" with how long the project has been delivering without the
 * contract being paid up: time since the last client touch (a paid
 * client keeps in contact). When there is no debt this is irrelevant
 * (`paidScore` returns 100 before consulting it).
 */
function paidOverdueDays(
  budget: number,
  paid: number,
  daysSinceTouch: number,
): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  if (budget - paid <= 0) return 0;
  if (!Number.isFinite(daysSinceTouch)) return 0;
  // Only the portion beyond the grace period counts as "overdue".
  return Math.max(0, daysSinceTouch - PAID_GRACE_DAYS);
}

// ── Sparkline back-fill ────────────────────────────────────────────────────

/**
 * Build a 90-value daily sparkline from the dated history. Days without
 * a recorded point carry the most recent prior value forward (a score
 * doesn't change until it's recomputed). Leading days before the first
 * recorded point use that first value so the line starts flat rather
 * than at 0.
 */
function buildSparkline(
  history: HealthHistoryPoint[],
  now: number,
): number[] {
  if (history.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const p of history) byDay.set(p.date, p.score);

  const sorted = [...history].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const firstValue = sorted[0].score;

  const out: number[] = [];
  let carry = firstValue;
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const key = dayKey(now - i * ONE_DAY_MS);
    const v = byDay.get(key);
    if (v !== undefined) carry = v;
    out.push(Math.round(carry));
  }
  return out;
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Optional inputs `computeHealth` can't derive from `repo` alone.
 * `tier` drives the cadence baseline (`driftNorm`); `budget`/`paid`
 * drive the paid component. All optional — sensible defaults are used
 * when omitted (tier 1 = strictest, matching `driftNorm`'s own
 * fallback; no budget = paid component not applicable).
 */
export interface ComputeHealthOptions {
  tier?: ProjectTier;
  budget?: number;
  paid?: number;
  /** Bypass the weekly throttle and recompute now (manual button). */
  force?: boolean;
  /** Injectable clock for deterministic reasoning/tests. */
  now?: number;
}

/**
 * Compute (or reuse) the Customer Health Score for `repo`.
 *
 * Throttled to once a week: a cached score younger than
 * `RECOMPUTE_INTERVAL_MS` is returned as-is (only the sparkline is
 * re-derived so it always spans 90 days). Pass `force: true` (manual
 * "Recompute") to bypass the throttle and re-run sentiment via Haiku.
 *
 * Never throws — every dependency failure degrades gracefully.
 */
export async function computeHealth(
  repo: string,
  options: ComputeHealthOptions = {},
): Promise<CustomerHealthResult> {
  const now = options.now ?? Date.now();
  const cached = readCache(repo);

  // Weekly throttle: reuse a fresh cached result, only refreshing the
  // sparkline window. `force` (manual button / NBA regen) skips this.
  if (!options.force && cached) {
    const age = now - Date.parse(cached.computedAt);
    if (Number.isFinite(age) && age >= 0 && age < RECOMPUTE_INTERVAL_MS) {
      return {
        score: cached.score,
        components: cached.components,
        sparkline:
          cached.score === "n/a"
            ? []
            : buildSparkline(cached.history, now),
        computedAt: cached.computedAt,
      };
    }
  }

  // ── Gather all inputs (each best-effort) ──
  const { items: transcripts, bodies } = await loadTranscripts(
    repo,
    SENTIMENT_TRANSCRIPT_COUNT,
  );

  const staleDays = daysSinceLastTranscript(transcripts, now);
  const computedAt = new Date(now).toISOString();

  // No trustworthy transcript in the last 120 days → 'n/a'. We still
  // persist this so the gauge shows the placeholder consistently and
  // the throttle applies (don't re-scan an idle project every render).
  if (staleDays > STALE_TRANSCRIPT_DAYS) {
    const naComponents: HealthComponents = {
      sentiment: null,
      cadence: null,
      delivery: null,
      paid: null,
    };
    writeCache(repo, {
      score: "n/a",
      components: naComponents,
      computedAt,
      // Keep prior history so re-engaging the client redraws the trend.
      history: cached?.history ?? [],
    });
    return {
      score: "n/a",
      components: naComponents,
      sparkline: [],
      computedAt,
    };
  }

  // Drift baseline (cadence). Default tier 1 = strictest, mirroring
  // driftNorm's own unknown-tier fallback.
  let baselineDays = 7;
  try {
    const norm = await loadProjectNorm(repo, options.tier ?? 1);
    baselineDays = norm.client_touch_interval_days;
  } catch {
    // loadProjectNorm never throws by contract, but stay defensive.
    baselineDays = 7;
  }

  const commitments = await loadCommitments(repo, now);
  const verdicts = await classifySentiment(bodies);

  const components: HealthComponents = {
    sentiment: sentimentScore(verdicts),
    cadence: cadenceScore(
      meanMeetingIntervalDays(transcripts, now),
      baselineDays,
    ),
    delivery: deliveryScore(commitments, now),
    paid: paidScore(
      options.budget ?? 0,
      options.paid ?? 0,
      // Reuse the staleness already computed above for the n/a gate —
      // same value, no need to re-scan the transcript list.
      paidOverdueDays(options.budget ?? 0, options.paid ?? 0, staleDays),
    ),
  };

  const score = blendScore(components);

  // Append today's point (replacing an earlier same-day recompute so
  // the history stays one-point-per-day).
  const today = dayKey(now);
  const history = [
    ...(cached?.history ?? []).filter((p) => p.date !== today),
    { date: today, score },
  ];

  writeCache(repo, { score, components, computedAt, history });

  return {
    score,
    components,
    sparkline: buildSparkline(history, now),
    computedAt,
  };
}
