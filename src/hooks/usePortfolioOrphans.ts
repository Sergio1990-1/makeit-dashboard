import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PROJECTS, getToken } from "../utils/config";
import { listOrphanIssuesWithMeta, type OrphanIssueMeta } from "../utils/github-actions";

// Bumped suffix when the cache shape changes incompatibly.
const CACHE_KEY = "makeit_portfolio_orphans_v1";
// 30 minutes — same envelope as usePortfolioHealth so the two panels
// refresh in lockstep on a tab re-open.
const CACHE_TTL_MS = 30 * 60 * 1000;
// 3 parallel REST scans. Each repo touches ~1-5 pages of /issues, so 3
// concurrent ≈ 15 in-flight requests at peak — well under GitHub's
// secondary rate-limit threshold.
const SCAN_CONCURRENCY = 3;
// Defer the very first scan so the dashboard's GraphQL warm-up finishes
// before we hammer REST.
const INITIAL_DELAY_MS = 1500;

interface CacheShape {
  generated_at: string;
  items: OrphanIssueMeta[];
}

interface State {
  items: OrphanIssueMeta[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const IDLE_STATE: State = {
  items: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed.generated_at || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: OrphanIssueMeta[], generatedAt: string): void {
  try {
    const payload: CacheShape = { generated_at: generatedAt, items };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded — drop silently. Next refresh retries.
  }
}

function isCacheFresh(cache: CacheShape): boolean {
  const age = Date.now() - new Date(cache.generated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

// Bounded-concurrency runner — same shape as the helper inside
// usePortfolioHealth. Kept inline (not extracted) because the two callers
// are the only consumers and a shared module would force a generics
// signature with no other benefit.
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Loads orphan-issue metadata across the full portfolio with caching and
// per-repo failure isolation. Mirrors the usePortfolioHealth contract so
// downstream panels can switch between the two without surprise.
export function usePortfolioOrphans(): State & { refresh: () => void } {
  const [state, setState] = useState<State>(IDLE_STATE);
  // Monotonic request id — discriminates between in-flight scans so a
  // stale run can't overwrite a fresher one's state.
  const requestId = useRef(0);
  const isMounted = useRef(true);

  const run = useCallback(async (force: boolean, withInitialDelay: boolean) => {
    const token = getToken();
    if (!token) {
      if (isMounted.current) {
        setState({
          items: [],
          loading: false,
          error: "Нужен GitHub-токен",
          lastUpdated: null,
        });
      }
      return;
    }

    if (!force) {
      const cached = readCache();
      if (cached && isCacheFresh(cached)) {
        if (isMounted.current) {
          setState({
            items: cached.items,
            loading: false,
            error: null,
            lastUpdated: cached.generated_at,
          });
        }
        return;
      }
    }

    // Bump request id BEFORE any await so cleanup can invalidate this run
    // while it's parked in the initial delay.
    const myReq = ++requestId.current;

    if (withInitialDelay) {
      await new Promise((r) => setTimeout(r, INITIAL_DELAY_MS));
      if (myReq !== requestId.current || !isMounted.current) return;
    }

    if (isMounted.current) {
      setState((s) => ({ ...s, loading: true, error: null }));
    }

    const settled = await runWithConcurrency(DEFAULT_PROJECTS, SCAN_CONCURRENCY, async (proj) => {
      try {
        const meta = await listOrphanIssuesWithMeta(token, proj.owner, proj.repo);
        return { ok: true as const, meta };
      } catch (err) {
        // Per-repo isolation: a 404 / rate-limit on one project mustn't
        // wipe the whole scan.
        const msg = err instanceof Error ? err.message : "scan failed";
        return { ok: false as const, repo: proj.repo, error: msg };
      }
    });

    if (myReq !== requestId.current || !isMounted.current) return;

    const items = settled
      .filter((r): r is { ok: true; meta: OrphanIssueMeta[] } => r.ok)
      .flatMap((r) => r.meta);
    const failedAll = settled.every((r) => !r.ok);
    const generatedAt = new Date().toISOString();
    writeCache(items, generatedAt);

    setState({
      items,
      loading: false,
      // Surface error only when *every* repo failed — partial success is the
      // common rate-limit case and shouldn't block the chart.
      error: failedAll && DEFAULT_PROJECTS.length > 0
        ? "Не удалось загрузить orphan-issues ни для одного репозитория"
        : null,
      lastUpdated: generatedAt,
    });
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void run(false, true);
    return () => {
      isMounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
    };
  }, [run]);

  const refresh = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore — readCache will treat a malformed entry as a miss.
    }
    void run(true, false);
  }, [run]);

  return { ...state, refresh };
}
