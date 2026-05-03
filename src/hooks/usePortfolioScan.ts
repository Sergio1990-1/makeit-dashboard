import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "../utils/config";
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_SCAN_CONCURRENCY,
  createPortfolioCache,
  isCacheFresh,
  runWithConcurrency,
} from "../utils/portfolio-scan";

// Generic portfolio-scan hook. Concrete consumers (usePortfolioHealth,
// usePortfolioOrphans) wrap this with a cache key, an enumerator that lists
// the items to scan, and a per-item scanner. The hook owns:
//
// - Cache-first read with TTL freshness check (no `loading=true` on a fresh
//   cache hit, so the UI renders instantly on tab re-open).
// - Initial-delay-then-scan kickoff on mount to let the dashboard's GraphQL
//   warm-up finish before we hammer REST.
// - Bounded-concurrency fan-out via `runWithConcurrency`.
// - Per-item error isolation: a single repo failing does not abort the rest;
//   the partial result is persisted as the new cache.
// - Race protection via a monotonic `requestId` ref + `isMounted` ref so a
//   stale in-flight scan can't overwrite a fresher run's state (matters under
//   StrictMode double-mount).
//
// `TItem` is whatever the enumerator returns (a repo name string for health,
// a project descriptor for orphans). `TResult` is the per-item scan output;
// the hook surfaces `TResult[]` (one entry per *successful* item, in input
// order). If the consumer needs to flatten (e.g. each item produces an array
// and they want a single flat list), do it in the wrapper.

export interface PortfolioScanOptions<TItem, TResult> {
  // Namespaces the localStorage entry. Bump the suffix when TResult shape
  // changes incompatibly (existing entries will fail the shape check and be
  // treated as a cache miss).
  cacheKey: string;
  // Lists the items to scan. Called once per scan, after the token check
  // passes and (on a non-fresh cache) before the bump-then-await sequence.
  // The `force` flag is forwarded so the enumerator can bypass its own
  // caches on a manual refresh — health uses this for the checklist load.
  enumerate: (token: string, force: boolean) => Promise<TItem[]>;
  // Per-item scanner. Called inside a try/catch by the runner — throw freely
  // for per-item failures, the runner will log it and keep going.
  scanItem: (token: string, item: TItem) => Promise<TResult>;
  // Russian message shown when `enumerate` throws and there is no item to
  // scan. The error's own message is preferred when available; this is the
  // generic fallback.
  enumerateErrorFallback?: string;
  // Russian message shown when at least one item failed and zero succeeded.
  // Partial success is silent (the panel just shows fewer rows).
  allFailedError: string;
  ttlMs?: number;
  concurrency?: number;
  initialDelayMs?: number;
}

export interface PortfolioScanState<TResult> {
  items: TResult[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;
}

interface InternalState<TResult> {
  items: TResult[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const TOKEN_MISSING_ERROR = "Нужен GitHub-токен";

export function usePortfolioScan<TItem, TResult>(
  opts: PortfolioScanOptions<TItem, TResult>,
): PortfolioScanState<TResult> {
  const {
    cacheKey,
    enumerate,
    scanItem,
    enumerateErrorFallback = "Не удалось подготовить список репозиториев",
    allFailedError,
    ttlMs = DEFAULT_CACHE_TTL_MS,
    concurrency = DEFAULT_SCAN_CONCURRENCY,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  } = opts;

  // Cache instance is keyed off `cacheKey`. Callers pass a static literal so
  // we only build it once; if a future caller ever varies the key at runtime,
  // they'll need to remount the hook to swap stores.
  const cacheRef = useRef(createPortfolioCache<TResult[]>(cacheKey));

  const [state, setState] = useState<InternalState<TResult>>({
    items: [],
    loading: false,
    error: null,
    lastUpdated: null,
  });

  // Monotonic request id — discriminates between in-flight scans so a stale
  // run can't overwrite a fresher one's state.
  const requestId = useRef(0);
  // Prevents setState after unmount. The in-flight GitHub calls will complete
  // in the background but their results are dropped.
  const isMounted = useRef(true);

  const run = useCallback(
    async (force: boolean, withInitialDelay: boolean) => {
      const token = getToken();
      if (!token) {
        if (isMounted.current) {
          setState({
            items: [],
            loading: false,
            error: TOKEN_MISSING_ERROR,
            lastUpdated: null,
          });
        }
        return;
      }

      // Cache-first path. On a fresh cache we never flip `loading` — the UI
      // stays calm and renders instantly.
      if (!force) {
        const cached = cacheRef.current.read();
        if (cached && isCacheFresh(cached, ttlMs)) {
          if (isMounted.current) {
            setState({
              items: cached.payload,
              loading: false,
              error: null,
              lastUpdated: cached.generated_at,
            });
          }
          return;
        }
      }

      // Bump the request id BEFORE any await so the cleanup path (which also
      // bumps requestId) can invalidate this run while it's parked in the
      // initial delay. Without this, a StrictMode double-mount can let the
      // first run's setTimeout resolve under the second mount's
      // `isMounted=true` and write stale state.
      const myReq = ++requestId.current;

      if (withInitialDelay) {
        await new Promise((r) => setTimeout(r, initialDelayMs));
        if (myReq !== requestId.current || !isMounted.current) return;
      }

      if (isMounted.current) {
        setState((s) => ({ ...s, loading: true, error: null }));
      }

      let items: TItem[];
      try {
        items = await enumerate(token, force);
      } catch (err) {
        if (myReq !== requestId.current || !isMounted.current) return;
        const msg = err instanceof Error ? err.message : enumerateErrorFallback;
        setState((s) => ({ ...s, loading: false, error: msg }));
        return;
      }

      if (myReq !== requestId.current || !isMounted.current) return;

      type Settled = { ok: true; result: TResult } | { ok: false; error: string };
      const settled = await runWithConcurrency<TItem, Settled>(items, concurrency, async (item) => {
        try {
          const result = await scanItem(token, item);
          return { ok: true, result };
        } catch (err) {
          // Per-item isolation: a 404 / rate-limit on one item mustn't wipe
          // the whole scan.
          const msg = err instanceof Error ? err.message : "scan failed";
          return { ok: false, error: msg };
        }
      });

      if (myReq !== requestId.current || !isMounted.current) return;

      const successes = settled
        .filter((r): r is { ok: true; result: TResult } => r.ok)
        .map((r) => r.result);
      const failedCount = settled.length - successes.length;
      const generatedAt = cacheRef.current.write(successes);

      setState({
        items: successes,
        loading: false,
        // Surface failures only when the entire scan was wiped — partial
        // success is the common "one repo rate-limited" case and shouldn't
        // block the UI.
        error: successes.length === 0 && failedCount > 0 ? allFailedError : null,
        lastUpdated: generatedAt,
      });
    },
    [enumerate, scanItem, ttlMs, concurrency, initialDelayMs, allFailedError, enumerateErrorFallback],
  );

  useEffect(() => {
    isMounted.current = true;
    // Kick off on mount with the initial delay; cache hit short-circuits
    // before the timer fires.
    void run(false, true);
    return () => {
      isMounted.current = false;
      // Bump the request id so any in-flight handlers see a stale id and
      // skip their setState calls. We deliberately mutate the live ref —
      // the "snapshot ref before cleanup" advice doesn't apply.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
    };
  }, [run]);

  const refresh = useCallback(() => {
    cacheRef.current.clear();
    void run(true, false);
  }, [run]);

  return { ...state, refresh };
}
