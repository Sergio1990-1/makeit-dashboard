import { useCallback, useEffect, useRef, useState } from "react";
import { GITHUB_OWNER, getToken } from "../utils/config";
import { loadChecklist } from "../utils/checklist";
import { runHealthCheck } from "../utils/health-engine";
import type { HealthReport } from "../types/health";

const SESSION_PREFIX = "makeit_health_";

interface State {
  report: HealthReport | null;
  loading: boolean;
  error: string | null;
}

// Hook that runs the health pipeline for one repo. Caches the last report in
// sessionStorage keyed by repo so navigating between projects doesn't re-scan
// every time. Cache survives only the current tab session.
export function useProjectHealth(repo: string | null): State & { refresh: () => void } {
  const [state, setState] = useState<State>({ report: null, loading: false, error: null });
  const requestId = useRef(0);

  const run = useCallback(
    async (currentRepo: string, force: boolean) => {
      const token = getToken();
      if (!token) {
        setState({ report: null, loading: false, error: "Нужен GitHub-токен" });
        return;
      }
      const myReq = ++requestId.current;
      setState((s) => ({ ...s, loading: true, error: null }));

      // Cache shortcut: hit sessionStorage unless force-refresh.
      if (!force) {
        const cached = sessionStorage.getItem(SESSION_PREFIX + currentRepo);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as HealthReport;
            if (myReq === requestId.current) {
              setState({ report: parsed, loading: false, error: null });
              return;
            }
          } catch {
            sessionStorage.removeItem(SESSION_PREFIX + currentRepo);
          }
        }
      }

      try {
        const doc = await loadChecklist(token, force);
        const report = await runHealthCheck(token, GITHUB_OWNER, currentRepo, doc);
        if (myReq !== requestId.current) return;
        try {
          sessionStorage.setItem(SESSION_PREFIX + currentRepo, JSON.stringify(report));
        } catch {
          // Quota exceeded — drop silently, the next render will recompute.
        }
        setState({ report, loading: false, error: null });
      } catch (err) {
        if (myReq !== requestId.current) return;
        const msg = err instanceof Error ? err.message : "Не удалось выполнить health-чек";
        setState({ report: null, loading: false, error: msg });
      }
    },
    [],
  );

  useEffect(() => {
    if (!repo) {
      setState({ report: null, loading: false, error: null });
      return;
    }
    run(repo, false);
  }, [repo, run]);

  const refresh = useCallback(() => {
    if (repo) {
      sessionStorage.removeItem(SESSION_PREFIX + repo);
      run(repo, true);
    }
  }, [repo, run]);

  return { ...state, refresh };
}
