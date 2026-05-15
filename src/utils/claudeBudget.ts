/**
 * Claude API budget tracker (Epic-012 Task-01, FR-41).
 *
 * Hard cap on monthly Claude API spend across the whole portfolio.
 * Every Claude call must:
 *   1. Check `isHardStopped()` before issuing the request.
 *   2. Optionally swap the model to Haiku when `shouldFallbackToHaiku()`
 *      returns true (>= FALLBACK_PCT of cap).
 *   3. Call `logCall(...)` with the response's token usage.
 *
 * Storage: `localStorage` under key `makeit_claude_budget:{YYYY-MM}`.
 * Each month gets its own bucket so we never lose history; only the
 * current month is consulted by the cap-checks.
 *
 * Thresholds and pricing live in constants at the top of the file —
 * adjust them there, not in callers or UI.
 */

// ── Configurable constants ────────────────────────────────────────────────

/** Monthly hard cap on Claude API spend (USD). */
export const MONTHLY_CAP_USD = 30;

/** Warning threshold (% of cap) — UI shows yellow above this. */
export const WARN_PCT = 80;

/**
 * Fallback threshold (% of cap) — `shouldFallbackToHaiku()` returns
 * true above this so callers can downgrade Sonnet/Opus to Haiku.
 */
export const FALLBACK_PCT = 110;

/**
 * Hard-stop threshold (% of cap) — `isHardStopped()` returns true
 * above this, callers must refuse to make the request. This protects
 * against runaway loops.
 */
export const HARD_STOP_PCT = 200;

/**
 * Per-million-token pricing in USD, keyed by a normalised model family.
 * Source: anthropic.com/pricing as of 2026-05.
 *
 * Lookup is fuzzy: any model id whose lowercased form contains the family
 * substring matches (e.g. `claude-sonnet-4-6` → `sonnet`). Unknown models
 * fall back to `unknown` so we still log usage but with zero cost — the
 * tester sees the call and we don't crash.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  haiku: { input: 0.8, output: 4 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
  unknown: { input: 0, output: 0 },
};

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Logical call category. Drives the breakdown in the Settings UI so the
 * user can see where the spend is going. Keep this list narrow — add new
 * values here, not as ad-hoc strings at call sites.
 */
export type ClaudeCallType =
  | "digest"
  | "nba"
  | "sentiment"
  | "verify"
  | "audit"
  | "chat"
  | "drift"
  | "other";

export interface LogCallInput {
  type: ClaudeCallType;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface MonthBucket {
  /** YYYY-MM, redundant with the key but useful when reading raw storage. */
  month: string;
  /** Total accumulated spend (USD). */
  total: number;
  /** Breakdown per ClaudeCallType (USD). */
  byType: Partial<Record<ClaudeCallType, number>>;
  /** Number of recorded calls (for debugging — UI does not require it). */
  calls: number;
}

export interface SpendSummary {
  /** Current YYYY-MM bucket inspected. */
  month: string;
  /** Total spend this month (USD). */
  total: number;
  /** Spend per category (USD). */
  byType: Partial<Record<ClaudeCallType, number>>;
  /** Percentage of `MONTHLY_CAP_USD` consumed (0..∞, can exceed 100). */
  capPct: number;
  /** Configured monthly cap (USD), echoed for UI convenience. */
  capUsd: number;
}

// ── Internals ─────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "makeit_claude_budget";

/**
 * Browser-side change notifier. UI subscribes; mutations call notify().
 * No external deps; intentionally tiny — `useSyncExternalStore` only
 * needs subscribe + getSnapshot. We expose subscribe via a helper at
 * the bottom of the file.
 */
const listeners = new Set<() => void>();

/**
 * Cached SpendSummary returned by `getSpendSnapshot`. Held until the
 * next `notify()` so `useSyncExternalStore` sees a stable reference
 * between mutations — without this, React strict-mode flags a tearing
 * loop because `getSpend()` constructs a fresh object every call.
 */
let cachedSnapshot: SpendSummary | null = null;

function notify(): void {
  // Invalidate the snapshot BEFORE notifying so listeners that re-read
  // through `getSpendSnapshot` observe the post-mutation state.
  cachedSnapshot = null;
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      // A bad listener should never poison the loop.
      console.warn("claudeBudget listener threw:", e);
    }
  }
}

/** Format a Date as YYYY-MM in UTC (deterministic across timezones). */
function monthKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function storageKey(month: string): string {
  return `${STORAGE_PREFIX}:${month}`;
}

function readBucket(month: string): MonthBucket {
  const empty: MonthBucket = { month, total: 0, byType: {}, calls: 0 };
  if (typeof localStorage === "undefined") return empty;
  const raw = localStorage.getItem(storageKey(month));
  if (raw === null) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<MonthBucket>;
    // Defensive: a corrupt or partial bucket must not crash the app.
    return {
      month,
      total: typeof parsed.total === "number" && isFinite(parsed.total) ? parsed.total : 0,
      byType:
        parsed.byType && typeof parsed.byType === "object"
          ? (parsed.byType as MonthBucket["byType"])
          : {},
      calls: typeof parsed.calls === "number" && isFinite(parsed.calls) ? parsed.calls : 0,
    };
  } catch {
    return empty;
  }
}

function writeBucket(bucket: MonthBucket): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(bucket.month), JSON.stringify(bucket));
  } catch (e) {
    // Quota exceeded or storage disabled — log but don't break the call.
    console.warn("claudeBudget: failed to persist bucket:", e);
  }
}

/**
 * Resolve a model id to a price family. Fuzzy substring match handles
 * versioned ids like `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`
 * without a per-version table.
 */
function resolvePricing(model: string): { input: number; output: number } {
  const lc = model.toLowerCase();
  if (lc.includes("haiku")) return PRICE_PER_MTOK.haiku;
  if (lc.includes("sonnet")) return PRICE_PER_MTOK.sonnet;
  if (lc.includes("opus")) return PRICE_PER_MTOK.opus;
  return PRICE_PER_MTOK.unknown;
}

/** USD cost for a single call. Internal — exported for unit tests if needed. */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = resolvePricing(model);
  // tokens × ($/Mtok) ÷ 1e6
  return (
    (Math.max(0, inputTokens) * price.input) / 1_000_000 +
    (Math.max(0, outputTokens) * price.output) / 1_000_000
  );
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Record a Claude API call against the current month's bucket.
 *
 * Safe to call from any context (browser, test, SSR — no-op without
 * `localStorage`). Never throws; on any persistence error the in-memory
 * notification still fires so listeners stay consistent with whatever
 * localStorage now holds.
 */
export function logCall(input: LogCallInput): void {
  const cost = estimateCost(input.model, input.inputTokens, input.outputTokens);
  if (!isFinite(cost) || cost < 0) {
    // Defensive — a corrupt input shouldn't poison the bucket.
    return;
  }
  const month = monthKey();
  const bucket = readBucket(month);
  bucket.total = bucket.total + cost;
  bucket.byType[input.type] = (bucket.byType[input.type] ?? 0) + cost;
  bucket.calls += 1;
  writeBucket(bucket);
  notify();
}

/** Snapshot of the current month's spend, suitable for UI rendering. */
export function getSpend(): SpendSummary {
  const month = monthKey();
  const bucket = readBucket(month);
  const capPct = MONTHLY_CAP_USD > 0 ? (bucket.total / MONTHLY_CAP_USD) * 100 : 0;
  return {
    month,
    total: bucket.total,
    byType: bucket.byType,
    capPct,
    capUsd: MONTHLY_CAP_USD,
  };
}

/**
 * Reference-stable variant of `getSpend()` for `useSyncExternalStore`.
 * Returns the same object until the next mutation calls `notify()`.
 *
 * Always-fresh callers (cap checks, log-call internals) should keep
 * using `getSpend()` so they observe the latest write within the same
 * tick.
 */
export function getSpendSnapshot(): SpendSummary {
  if (cachedSnapshot === null) cachedSnapshot = getSpend();
  return cachedSnapshot;
}

/**
 * True when the current month's spend has crossed `FALLBACK_PCT` of the
 * cap. Callers should swap Sonnet/Opus → Haiku for the rest of the
 * request lifecycle. The flag clears on month rollover.
 */
export function shouldFallbackToHaiku(): boolean {
  return getSpend().capPct >= FALLBACK_PCT;
}

/**
 * True when the current month's spend has crossed `HARD_STOP_PCT` of the
 * cap. Callers must refuse to make further Claude calls (typically by
 * throwing a typed error). Protects against runaway tool-use loops.
 */
export function isHardStopped(): boolean {
  return getSpend().capPct >= HARD_STOP_PCT;
}

/**
 * Wipe the current month's bucket. Used by the Settings panel after
 * an explicit user confirm. Other months are left untouched so history
 * is preserved.
 */
export function resetCurrentMonth(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(monthKey()));
  } catch (e) {
    console.warn("claudeBudget: failed to reset bucket:", e);
  }
  notify();
}

/**
 * Subscribe to spend changes. Returns an unsubscribe function.
 * Designed for `useSyncExternalStore` so React re-renders stay correct
 * without cross-tab `storage` event plumbing (single-tab app).
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Error type thrown when a call is refused due to hard-stop.
 * Callers can `instanceof BudgetHardStopError` to distinguish from
 * network/auth errors and surface a specific UI message.
 */
export class BudgetHardStopError extends Error {
  constructor(message = "Claude API budget hard-stopped (monthly cap exceeded 200%)") {
    super(message);
    this.name = "BudgetHardStopError";
  }
}

/**
 * Convenience guard for callers: throws `BudgetHardStopError` when the
 * monthly cap is over the hard-stop threshold. Use at the top of every
 * Claude API entry point.
 */
export function assertNotHardStopped(): void {
  if (isHardStopped()) throw new BudgetHardStopError();
}

/**
 * Pick the actual model id to send, honouring fallback. If the requested
 * model is already Haiku, returns it unchanged. Otherwise, when fallback
 * is active, returns `haikuFallback` (default: `claude-haiku-4-5-20251001`).
 */
export function effectiveModel(
  requested: string,
  haikuFallback = "claude-haiku-4-5-20251001",
): string {
  const lc = requested.toLowerCase();
  if (lc.includes("haiku")) return requested;
  if (shouldFallbackToHaiku()) return haikuFallback;
  return requested;
}
