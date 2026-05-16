/**
 * usePortfolioNba — shared fetch layer for the portfolio Next-Best-Action
 * widget (Epic-010 Task-02, #344).
 *
 * Wraps `computePortfolioNBA` / `invalidateNbaCache` from
 * `nextBestActionEngine` (#388). The engine is **pure-injectable**: it does
 * the aggregation locally over per-project `NbaResult[]` and never calls
 * Claude itself, so this hook is injectable too — the caller passes the
 * per-project actions (live cross-portfolio collection is Epic-012 Task-09,
 * #367, not done; absent input degrades to an empty state, never a crash).
 *
 * Cache contract (read directly, deliberately):
 *   The engine stores `localStorage["makeit_portfolio_nba"]` as
 *   `{ week: <ISO-week>, result: NbaResult }` and is week-scoped (a fresh
 *   ISO week forces recompute). It exposes no read-only / freshness API and
 *   `NbaResult` carries no timestamp. To render «Сгенерирован N дней назад»
 *   we read that envelope and derive age from the ISO-week boundary. The
 *   cache KEY is NOT hardcoded here — it comes from
 *   `PORTFOLIO_NBA_CACHE_KEY` so it stays in sync if the engine renames it.
 *
 * Divergence from the issue: the issue specifies a flat 7-day TTL with a
 * `{ generatedAt, actions }` shape; the merged engine is ISO-week scoped
 * with a `{ week, result }` envelope. We follow the REAL engine behaviour
 * (week-scoped) and surface freshness as the days since that week started.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computePortfolioNBA,
  invalidateNbaCache,
  type NbaResult,
} from "../utils/nextBestActionEngine";

/**
 * The engine's portfolio cache key. Kept here as the single import-point so
 * the widget/hook never inlines the literal — if the engine renames it this
 * is the one place to update (the engine itself does not export it).
 */
export const PORTFOLIO_NBA_CACHE_KEY = "makeit_portfolio_nba";

const DAY_MS = 86_400_000;

/** Shape the engine writes: `{ week: "2026-W18", result: NbaResult }`. */
interface RawCacheEnvelope {
  week?: unknown;
  result?: unknown;
}

/**
 * Parse `YYYY-Www` into the UTC ms of that ISO week's Monday. Returns null
 * for anything malformed so a corrupt cache degrades to "no freshness info"
 * instead of throwing.
 */
function isoWeekStartMs(week: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (m === null) return null;
  const year = Number(m[1]);
  const wk = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(wk) || wk < 1 || wk > 53) {
    return null;
  }
  // ISO-8601: week 1 contains Jan 4th; its Monday is the week-1 start.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay(); // Mon=1..Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const ms = week1Monday.getTime() + (wk - 1) * 7 * DAY_MS;
  return Number.isFinite(ms) ? ms : null;
}

/** Read-only peek at the engine's cache (does NOT trigger a compute). */
function readCachedEnvelope(): { actions: NbaResult["actions"]; weekStartMs: number | null } | null {
  if (typeof localStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(PORTFOLIO_NBA_CACHE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const env = JSON.parse(raw) as RawCacheEnvelope;
    if (
      env === null ||
      typeof env !== "object" ||
      typeof env.week !== "string" ||
      env.result === null ||
      typeof env.result !== "object"
    ) {
      return null;
    }
    const result = env.result as Partial<NbaResult>;
    if (!Array.isArray(result.actions)) return null;
    return {
      actions: result.actions,
      weekStartMs: isoWeekStartMs(env.week),
    };
  } catch {
    return null;
  }
}

/**
 * Read-only count of cached portfolio NBA actions for the sidebar badge
 * (Epic-010 Task-07, #349, FR-10). Returns null when there is no usable
 * cache — deliberately distinct from 0 so the badge stays hidden rather than
 * rendering «0». Never triggers a compute / Claude call.
 */
export function readPortfolioNbaCount(): number | null {
  const env = readCachedEnvelope();
  return env === null ? null : env.actions.length;
}

export interface UsePortfolioNbaState {
  /** Top-5 portfolio actions (empty array = clean / no cache). */
  actions: NbaResult["actions"];
  /** True while a regenerate request is in flight. */
  loading: boolean;
  /** User-facing error message, or null. */
  error: string | null;
  /**
   * Whole days since the cached week started, or null if there is no cache
   * yet. Drives the «Сгенерирован N дней назад» label.
   */
  ageDays: number | null;
  /** True when a non-stale cache was loaded (no auto-recompute needed). */
  hasCache: boolean;
  /** Engine flagged a Claude budget downgrade for a contributing project. */
  budgetFallback: boolean;
  /**
   * Drop the cache and recompute the portfolio aggregate. No-ops while a
   * previous regenerate is still running (button is disabled in the UI too,
   * this is the belt-and-braces guard against a double-fire).
   *
   * `override` lets the caller hand in freshly-collected per-project
   * results computed *just before* this call (#453): the live collector
   * resolves asynchronously, so its result can't be in the closed-over
   * `perProjectActions` prop yet. When omitted we fall back to the prop —
   * preserving the original (override-less) behaviour.
   */
  regenerate: (override?: NbaResult[]) => void;
}

/**
 * @param perProjectActions  Per-project `NbaResult[]` the caller already
 *   computed. The engine aggregates these locally. Undefined/empty →
 *   graceful empty state (full live collection is Task-09, out of scope).
 */
export function usePortfolioNba(
  perProjectActions: NbaResult[] | undefined,
): UsePortfolioNbaState {
  const initial = readCachedEnvelope();

  const [actions, setActions] = useState<NbaResult["actions"]>(
    () => initial?.actions ?? [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetFallback, setBudgetFallback] = useState(false);
  const [weekStartMs, setWeekStartMs] = useState<number | null>(
    () => initial?.weekStartMs ?? null,
  );
  const [hasCache, setHasCache] = useState<boolean>(() => initial !== null);

  // Guards against a double-fire (rapid clicks / Strict-Mode double-invoke)
  // and against a state update after unmount when an async regenerate
  // resolves late.
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const regenerate = useCallback(
    (override?: NbaResult[]) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    // Invalidate first so computePortfolioNBA can't short-circuit on the
    // (now intentionally stale) week cache and actually recomputes.
    try {
      invalidateNbaCache({ kind: "portfolio" });
    } catch {
      // best-effort — a disabled localStorage just means no cache to clear
    }

    // Prefer freshly-collected input handed in by the caller (#453); the
    // live per-project collection resolves after this closure was created,
    // so the prop alone would be stale on the first regenerate.
    const input = override ?? perProjectActions ?? [];

    void (async () => {
      try {
        const result = await computePortfolioNBA(input);
        if (!mountedRef.current) return;
        setActions(result.actions);
        setBudgetFallback(result.budgetFallback);
        setError(result.warning ?? null);
        // After a successful compute the engine re-wrote the cache for the
        // current ISO week — reflect that so the freshness label resets.
        const fresh = readCachedEnvelope();
        setWeekStartMs(fresh?.weekStartMs ?? null);
        setHasCache(fresh !== null);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(
          e instanceof Error
            ? e.message
            : "Не удалось сгенерировать действия по портфелю.",
        );
      } finally {
        if (mountedRef.current) setLoading(false);
        inFlightRef.current = false;
      }
    })();
    },
    [perProjectActions],
  );

  // Passive auto-aggregate (#453). `computePortfolioNBA` is LOCAL-ONLY
  // (sorts the per-project top-1s, no Claude / network call) and the
  // engine itself short-circuits on a fresh week-cache. So once the
  // caller has collected per-project results we run it once per distinct
  // input to (a) surface aggregated actions without requiring a manual
  // «Регенерировать», and (b) write the `makeit_portfolio_nba` cache the
  // sidebar badge reads — which nothing wrote before. A content signature
  // + ref guard makes this idempotent (no render loop): re-running with
  // the same input is skipped, and a same-signature recompute would be a
  // no-op cache hit anyway. Not triggered while a manual regenerate is in
  // flight, and never overrides a regenerate's fresher result.
  const autoSig =
    perProjectActions === undefined
      ? null
      : JSON.stringify(
          perProjectActions.map((p) => ({
            f: p.budgetFallback,
            a: p.actions.map((x) => `${x.id}|${x.severity}|${x.title}`),
          })),
        );
  const lastAutoSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoSig === null) return;
    // Empty input → nothing to aggregate; leave the cache untouched so an
    // earlier good portfolio cache (and its badge) survives.
    if (perProjectActions !== undefined && perProjectActions.length === 0) {
      return;
    }
    if (lastAutoSigRef.current === autoSig) return;
    if (inFlightRef.current) return;
    lastAutoSigRef.current = autoSig;
    void (async () => {
      try {
        const result = await computePortfolioNBA(perProjectActions ?? []);
        if (!mountedRef.current) return;
        // A concurrent manual regenerate is the source of truth — don't
        // clobber its (fresher) result with this passive pass.
        if (inFlightRef.current) return;
        setActions(result.actions);
        setBudgetFallback(result.budgetFallback);
        const fresh = readCachedEnvelope();
        setWeekStartMs(fresh?.weekStartMs ?? null);
        setHasCache(fresh !== null);
      } catch {
        // Local aggregation effectively never throws; on the off chance
        // it does, keep whatever (cache-seeded) state we already have.
      }
    })();
  }, [autoSig, perProjectActions]);

  const ageDays =
    weekStartMs === null
      ? null
      : Math.max(0, Math.floor((Date.now() - weekStartMs) / DAY_MS));

  return {
    actions,
    loading,
    error,
    ageDays,
    hasCache,
    budgetFallback,
    regenerate,
  };
}
