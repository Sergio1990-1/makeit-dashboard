import { useCallback, useMemo } from "react";
import { DEFAULT_PROJECTS } from "../utils/config";
import { listOrphanIssuesWithMeta, type OrphanIssueMeta } from "../utils/github-actions";
import { usePortfolioScan, type PortfolioScanState } from "./usePortfolioScan";

// Bumped suffix when the cache shape changes incompatibly.
const CACHE_KEY = "makeit_portfolio_orphans_v1";

// Per-project scan returns an array of orphans; the wrapper flattens these
// into one list so consumers (OrphanIssuesPanel) get a flat `items` array.
type OrphansPerRepo = OrphanIssueMeta[];

interface UsePortfolioOrphansResult extends Omit<PortfolioScanState<OrphansPerRepo>, "items"> {
  items: OrphanIssueMeta[];
}

// Loads orphan-issue metadata across the full portfolio with caching and
// per-repo failure isolation. Mirrors the usePortfolioHealth contract so
// downstream panels can switch between the two without surprise.
//
// Thin wrapper around `usePortfolioScan` (see issue #170) — the cache,
// concurrency, race-protection, and initial-delay machinery lives there.
export function usePortfolioOrphans(): UsePortfolioOrphansResult {
  const enumerate = useCallback(async () => DEFAULT_PROJECTS, []);

  const scanItem = useCallback(
    (token: string, proj: typeof DEFAULT_PROJECTS[number]): Promise<OrphansPerRepo> =>
      listOrphanIssuesWithMeta(token, proj.owner, proj.repo),
    [],
  );

  const { items: perRepo, ...rest } = usePortfolioScan<typeof DEFAULT_PROJECTS[number], OrphansPerRepo>({
    cacheKey: CACHE_KEY,
    enumerate,
    scanItem,
    allFailedError: "Не удалось загрузить orphan-issues ни для одного репозитория",
  });

  // Flatten N×M (N repos × M orphans each) → single list. Memoised so the
  // reference is stable when `perRepo` is unchanged — keeps downstream
  // useMemo deps from re-firing on every render.
  const items = useMemo(() => perRepo.flat(), [perRepo]);

  return { items, ...rest };
}
