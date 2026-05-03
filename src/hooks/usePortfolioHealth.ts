import { useCallback } from "react";
import { GITHUB_OWNER } from "../utils/config";
import { loadChecklist } from "../utils/checklist";
import { runHealthCheck } from "../utils/health-engine";
import type { ChecklistDocument, HealthReport } from "../types/health";
import { usePortfolioScan, type PortfolioScanState } from "./usePortfolioScan";

// Cache key for the persisted portfolio scan. Bump the suffix when the
// HealthReport shape changes incompatibly.
const CACHE_KEY = "makeit_portfolio_health_v1";

// Each enumerated item carries the repo name plus a reference to the
// already-loaded checklist so `scanItem` doesn't have to re-fetch it per
// repo. The doc is loaded once per scan inside `enumerate`.
interface HealthScanItem {
  repo: string;
  doc: ChecklistDocument;
}

interface UsePortfolioHealthResult extends Omit<PortfolioScanState<HealthReport>, "items"> {
  reports: HealthReport[];
}

// Hook that runs the health pipeline for every repo classified in the
// checklist. Cached in localStorage with a 30-minute TTL so a tab refresh
// is effectively free. Per-repo failures are isolated: a rate-limit on one
// project does not abort the rest — failed repos are simply omitted from
// `reports`, the rest are persisted as a partial result.
//
// Thin wrapper around `usePortfolioScan` (see issue #170) — the cache,
// concurrency, race-protection, and initial-delay machinery lives there.
export function usePortfolioHealth(): UsePortfolioHealthResult {
  const enumerate = useCallback(async (token: string, force: boolean): Promise<HealthScanItem[]> => {
    const doc = await loadChecklist(token, force);
    return Object.keys(doc.project_classification).map((repo) => ({ repo, doc }));
  }, []);

  const scanItem = useCallback(
    (token: string, item: HealthScanItem): Promise<HealthReport> =>
      runHealthCheck(token, GITHUB_OWNER, item.repo, item.doc),
    [],
  );

  const { items, ...rest } = usePortfolioScan<HealthScanItem, HealthReport>({
    cacheKey: CACHE_KEY,
    enumerate,
    scanItem,
    enumerateErrorFallback: "Не удалось загрузить чеклист",
    allFailedError: "Не удалось просканировать ни один репозиторий",
  });

  return { reports: items, ...rest };
}
