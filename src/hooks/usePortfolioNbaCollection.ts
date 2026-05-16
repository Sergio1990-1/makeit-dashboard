/**
 * usePortfolioNbaCollection — owns the per-project NBA input feeding the
 * portfolio widget (#453).
 *
 * Render path (zero cost): on mount / when the project list changes it
 * synchronously reads the engine's already-computed per-project caches
 * (`collectCachedPerProjectNba`). No Claude, no network — those caches are
 * populated for free as the user browses project hubs.
 *
 * Regenerate path (on-demand): `refreshLive()` is awaited by the widget's
 * «Регенерировать» click BEFORE the portfolio aggregate recomputes. It
 * derives lightweight signals from the already-loaded `ProjectData` and
 * calls the per-project engine (fresh week-caches short-circuit, so it is
 * mostly cache reuse). The freshly-collected results replace state, so the
 * subsequent `usePortfolioNba` recompute aggregates the new input and
 * re-writes the `makeit_portfolio_nba` cache the sidebar badge reads.
 *
 * `perProjectActions` is `undefined` until the first collection so the
 * widget's "no input" guard (disabled regenerate) holds correctly when
 * nothing is cached AND no key is configured; once we have collected
 * (even an empty array) it becomes a real array so the aggregate can run.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectData } from "../types";
import { getClaudeKey } from "../utils/config";
import {
  collectCachedPerProjectNba,
  collectLivePerProjectNba,
} from "../utils/portfolioNbaCollector";
import type { NbaResult } from "../utils/nextBestActionEngine";

export interface UsePortfolioNbaCollectionState {
  /**
   * Per-project `NbaResult[]` for `usePortfolioNba`. `undefined` only
   * before the first (synchronous) cache collection — never after, so the
   * widget's regenerate guard enables once there is real input.
   */
  perProjectActions: NbaResult[] | undefined;
  /**
   * Recompute per-project NBAs live from the loaded projects, then update
   * `perProjectActions`. Awaited by the widget before it recomputes the
   * portfolio aggregate. No-ops (returns cheaply) when no projects.
   */
  refreshLive: () => Promise<void>;
}

export function usePortfolioNbaCollection(
  projects: ProjectData[],
): UsePortfolioNbaCollectionState {
  const [perProjectActions, setPerProjectActions] = useState<
    NbaResult[] | undefined
  >(undefined);

  // Stable list of repos; recompute the cheap cached collection whenever
  // the set of repos changes (not on every ProjectData field churn).
  const repoKey = projects
    .map((p) => p.repo)
    .sort()
    .join("|");

  // Latest projects in a ref so `refreshLive` stays referentially stable
  // (it must not change identity on every projects refresh — the widget
  // memoises around it).
  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // RENDER PATH: pure cached collection. The read is synchronous and a
  // pure function of `repoKey`, so this uses React's documented "adjust
  // state during render when a prop changes" pattern (prev-value in state
  // + setState during render) — same pattern as `usePortfolioNbaBadge`'s
  // tab guard. It re-renders before commit with no effect / cascading
  // render, and (unlike a setState-in-effect) satisfies the strict
  // react-hooks lint rules. A live `refreshLive` later writes the same
  // state; the next repo-set change re-syncs from caches again.
  const [syncedRepoKey, setSyncedRepoKey] = useState<string | null>(null);
  if (syncedRepoKey !== repoKey) {
    setSyncedRepoKey(repoKey);
    const repos = repoKey.length > 0 ? repoKey.split("|") : [];
    setPerProjectActions(collectCachedPerProjectNba(repos));
  }

  const refreshLive = useCallback(async () => {
    const current = projectsRef.current;
    if (current.length === 0) {
      // Nothing to compute — fall back to the cached collection so the
      // aggregate at least re-reads any per-project caches.
      if (mountedRef.current) setPerProjectActions([]);
      return;
    }
    const apiKey = getClaudeKey() ?? "";
    const collected = await collectLivePerProjectNba(current, apiKey);
    if (mountedRef.current) setPerProjectActions(collected);
  }, []);

  return { perProjectActions, refreshLive };
}
