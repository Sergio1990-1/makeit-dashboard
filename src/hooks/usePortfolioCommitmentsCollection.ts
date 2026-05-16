/**
 * usePortfolioCommitmentsCollection — owns the per-project
 * overdue-commitment-count map the portfolio grid feeds into each
 * `ProjectScorecard`'s "⏰ просроч." KPI (#462).
 *
 * Render path (zero cost): on mount, when the project list changes, and
 * on every Hub enter/leave (via `refreshSignal`) it synchronously reads
 * the counts `useProjectHub` already persisted per repo to sessionStorage
 * (`collectOverdueCommitmentCounts`). No network, no fetch — those entries
 * are written for free as the user opens project hubs (`useProjectHub`
 * resolves the overdue commitments list and stores its `.length`).
 * Re-collecting on Hub-leave is what surfaces a just-visited project's
 * count without a full page reload (the project set is hardcoded, so a
 * repo-set-only key never would).
 *
 * There is no "regenerate" path here (unlike `usePortfolioNbaCollection`):
 * portfolio overdue counts are read-only — the only way a count appears
 * is the user visiting that project's Hub, which the Hub caches itself. A
 * project not yet visited this session simply has no count (the Scorecard
 * keeps its 0); this is strictly better than the previous always-0-for-all
 * and explicitly NOT a per-project portfolio fetch.
 *
 * `overdueByRepo` is `{}` until the first (synchronous) collection and
 * after it for an all-unvisited portfolio — callers treat a missing repo
 * as "no count yet" → `0` → existing Scorecard render.
 */

import { useState } from "react";
import type { ProjectData } from "../types";
import { collectOverdueCommitmentCounts } from "../utils/portfolioCommitmentsCollector";

export interface UsePortfolioCommitmentsCollectionState {
  /**
   * Per-project overdue-commitment count map (`repo → count`). A repo
   * absent from the map has no cached count; the caller passes `0` for it
   * so the Scorecard renders its existing 0.
   */
  overdueByRepo: Record<string, number>;
}

export function usePortfolioCommitmentsCollection(
  projects: ProjectData[],
  refreshSignal: string | null,
): UsePortfolioCommitmentsCollectionState {
  const [overdueByRepo, setOverdueByRepo] = useState<Record<string, number>>(
    {},
  );

  // Stable list of repos; the project set is hardcoded so `repoKey` alone
  // never changes within a session. `refreshSignal` is the volatile part
  // (the selected-repo): visiting a project Hub caches that project's
  // count, and ProjectsView stays mounted across Hub visits, so without
  // a volatile trigger a freshly-cached count would only surface after a
  // full page reload. Folding it in re-collects on every Hub enter/leave
  // (the leave is what matters — the grid then shows the just-cached
  // count). Still a pure synchronous sessionStorage read, zero network.
  // U+241F (unit separator) can't appear in a GitHub repo slug or in
  // `refreshSignal`, so the composite key is collision-free.
  const repoKey = projects.map((p) => p.repo).sort().join("|");
  const syncKey = `${repoKey}␟${refreshSignal ?? ""}`;

  // RENDER PATH: pure cached collection. The read is synchronous and a
  // pure function of `syncKey`, so this uses React's documented "adjust
  // state during render when a prop changes" pattern (prev-value in state
  // + setState during render) — same pattern as `usePortfolioHealthCollection`.
  // It re-renders before commit with no effect / cascading render, and
  // (unlike a setState-in-effect) satisfies the strict react-hooks lint
  // rules.
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    const repos = repoKey.length > 0 ? repoKey.split("|") : [];
    setOverdueByRepo(collectOverdueCommitmentCounts(repos));
  }

  return { overdueByRepo };
}
