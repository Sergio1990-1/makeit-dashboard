import { useCallback, useEffect, useRef, useState } from "react";
import { GITHUB_OWNER, getToken } from "../utils/config";
import { loadChecklist } from "../utils/checklist";
import { runHealthCheck } from "../utils/health-engine";
import type { HealthReport } from "../types/health";

// Cache key for the persisted portfolio scan. Bump the suffix when the
// HealthReport shape changes incompatibly.
const CACHE_KEY = "makeit_portfolio_health_v1";
// 30 minutes — long enough to feel "free" on tab re-open, short enough that
// a missing finding gets re-evaluated within the working hour.
const CACHE_TTL_MS = 30 * 60 * 1000;
// Concurrent health-checks. Each scan fans out ~50 GitHub calls internally
// (see health-engine), so 3 parallel repos ≈ 150 in-flight requests at peak.
// Higher concurrency tripped GitHub secondary rate limits in testing.
const SCAN_CONCURRENCY = 3;
// Defer the very first scan a bit so the rest of the dashboard finishes its
// own GraphQL warm-up before we hammer the REST API. Also keeps the initial
// render snappy.
const INITIAL_DELAY_MS = 1500;

interface CacheShape {
  generated_at: string;
  reports: HealthReport[];
}

interface State {
  reports: HealthReport[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const IDLE_STATE: State = {
  reports: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed.generated_at || !Array.isArray(parsed.reports)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(reports: HealthReport[], generatedAt: string): void {
  try {
    const payload: CacheShape = { generated_at: generatedAt, reports };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded — drop silently. The next refresh will retry.
  }
}

function isCacheFresh(cache: CacheShape): boolean {
  const age = Date.now() - new Date(cache.generated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

// Bounded-concurrency runner. Mapper is called eagerly with `index`, so the
// caller can stash partial results in a fixed slot if needed; here we just
// collect them into an array preserving input order.
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

// Hook that runs the health pipeline for every repo classified in the
// checklist. Cached in localStorage with a 30-minute TTL so a tab refresh
// is effectively free. Per-repo failures are isolated: a rate-limit on one
// project does not abort the rest — failed repos are simply omitted from
// `reports`, the rest are persisted as a partial result.
export function usePortfolioHealth(): State & { refresh: () => void } {
  const [state, setState] = useState<State>(IDLE_STATE);
  // Monotonic request id — discriminates between in-flight scans so a stale
  // run can't overwrite a fresher one's state.
  const requestId = useRef(0);
  // Prevents setState after unmount; the in-flight GitHub calls themselves
  // will complete in the background but their results are dropped.
  const isMounted = useRef(true);

  const run = useCallback(async (force: boolean, withInitialDelay: boolean) => {
    const token = getToken();
    if (!token) {
      if (isMounted.current) {
        setState({
          reports: [],
          loading: false,
          error: "Нужен GitHub-токен",
          lastUpdated: null,
        });
      }
      return;
    }

    // Cache-first path. On a fresh cache we never flip `loading` — the UI
    // stays calm and renders instantly.
    if (!force) {
      const cached = readCache();
      if (cached && isCacheFresh(cached)) {
        if (isMounted.current) {
          setState({
            reports: cached.reports,
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
    // first run's setTimeout resolve under the second mount's `isMounted=true`
    // and write stale state.
    const myReq = ++requestId.current;

    if (withInitialDelay) {
      await new Promise((r) => setTimeout(r, INITIAL_DELAY_MS));
      if (myReq !== requestId.current || !isMounted.current) return;
    }

    if (isMounted.current) {
      setState((s) => ({ ...s, loading: true, error: null }));
    }

    let doc;
    try {
      doc = await loadChecklist(token, force);
    } catch (err) {
      if (myReq !== requestId.current || !isMounted.current) return;
      const msg = err instanceof Error ? err.message : "Не удалось загрузить чеклист";
      setState((s) => ({ ...s, loading: false, error: msg }));
      return;
    }

    if (myReq !== requestId.current || !isMounted.current) return;

    const repos = Object.keys(doc.project_classification);
    const settled = await runWithConcurrency(repos, SCAN_CONCURRENCY, async (repo) => {
      try {
        const report = await runHealthCheck(token, GITHUB_OWNER, repo, doc);
        return { ok: true as const, report };
      } catch (err) {
        // Per-repo isolation: capture and keep going. ClassificationMissing
        // can't realistically fire here (we iterate the classification keys),
        // but rate-limit / network / 404 errors absolutely can.
        const msg = err instanceof Error ? err.message : "scan failed";
        return { ok: false as const, repo, error: msg };
      }
    });

    if (myReq !== requestId.current || !isMounted.current) return;

    const reports = settled
      .filter((r): r is { ok: true; report: HealthReport } => r.ok)
      .map((r) => r.report);
    const failed = settled.filter((r) => !r.ok);
    const generatedAt = new Date().toISOString();
    writeCache(reports, generatedAt);

    setState({
      reports,
      loading: false,
      // Surface failures only when the entire scan was wiped — partial
      // success is the common "one repo rate-limited" case and shouldn't
      // block the UI.
      error: reports.length === 0 && failed.length > 0
        ? "Не удалось просканировать ни один репозиторий"
        : null,
      lastUpdated: generatedAt,
    });
  }, []);

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
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore — readCache will still treat a malformed entry as a miss.
    }
    void run(true, false);
  }, [run]);

  return { ...state, refresh };
}
