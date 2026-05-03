import { useCallback, useEffect, useRef, useState } from "react";
import { GITHUB_OWNER, getToken } from "../utils/config";
import { loadChecklist } from "../utils/checklist";
import { ClassificationMissingError, runHealthCheck } from "../utils/health-engine";
import type { HealthReport } from "../types/health";

const SESSION_PREFIX = "makeit_health_";

interface State {
  report: HealthReport | null;
  loading: boolean;
  error: string | null;
  // Set when the engine raised a typed ClassificationMissingError —
  // the UI uses this instead of substring-matching the error message.
  classificationMissing: boolean;
}

// Hook that runs the health pipeline for one repo. Caches the last report in
// sessionStorage keyed by repo so navigating between projects doesn't re-scan
// every time. Cache survives only the current tab session.
export function useProjectHealth(repo: string | null): State & { refresh: () => void } {
  const [state, setState] = useState<State>({
    report: null,
    loading: false,
    error: null,
    classificationMissing: false,
  });
  const requestId = useRef(0);

  const run = useCallback(
    async (currentRepo: string, force: boolean) => {
      const token = getToken();
      if (!token) {
        setState({ report: null, loading: false, error: "Нужен GitHub-токен", classificationMissing: false });
        return;
      }

      // Cache shortcut FIRST: avoids loading-flicker on navigation between
      // already-scanned projects. Only after a cache miss do we flip to
      // loading=true.
      if (!force) {
        const cached = sessionStorage.getItem(SESSION_PREFIX + currentRepo);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as HealthReport;
            const myReq = ++requestId.current;
            void myReq;
            setState({ report: parsed, loading: false, error: null, classificationMissing: false });
            return;
          } catch {
            sessionStorage.removeItem(SESSION_PREFIX + currentRepo);
          }
        }
      }

      const myReq = ++requestId.current;
      setState((s) => ({ ...s, loading: true, error: null, classificationMissing: false }));

      try {
        const doc = await loadChecklist(token, force);
        const report = await runHealthCheck(token, GITHUB_OWNER, currentRepo, doc);
        if (myReq !== requestId.current) return;
        try {
          sessionStorage.setItem(SESSION_PREFIX + currentRepo, JSON.stringify(report));
        } catch {
          // Quota exceeded — drop silently, the next render will recompute.
        }
        setState({ report, loading: false, error: null, classificationMissing: false });
      } catch (err) {
        if (myReq !== requestId.current) return;
        if (err instanceof ClassificationMissingError) {
          setState({ report: null, loading: false, error: null, classificationMissing: true });
          return;
        }
        const msg = err instanceof Error ? err.message : "Не удалось выполнить health-чек";
        setState({ report: null, loading: false, error: msg, classificationMissing: false });
      }
    },
    [],
  );

  useEffect(() => {
    if (!repo) {
      setState({ report: null, loading: false, error: null, classificationMissing: false });
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
