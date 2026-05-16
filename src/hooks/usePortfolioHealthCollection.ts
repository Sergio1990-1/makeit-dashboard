/**
 * usePortfolioHealthCollection — owns the per-project health-grade map the
 * portfolio grid feeds into each `ProjectScorecard` (#456).
 *
 * Render path (zero cost): on mount, when the project list changes, and
 * on every Hub enter/leave (via `refreshSignal`) it synchronously reads
 * the health hook's already-computed per-repo sessionStorage caches
 * (`collectCachedHealthGrades`). No network, no fetch — those caches are
 * populated for free as the user opens project hubs (`useProjectHealth`
 * persists the full `HealthReport`). Re-collecting on Hub-leave is what
 * surfaces a just-visited project's grade without a full page reload
 * (the project set is hardcoded, so a repo-set-only key never would).
 *
 * There is no "regenerate" path here (unlike `usePortfolioNbaCollection`):
 * portfolio health is read-only — the only way a grade appears is the user
 * visiting that project's Hub, which the health hook caches itself. A
 * project not yet visited this session simply has no grade (the Scorecard
 * keeps its muted "—"); this is strictly better than the previous
 * always-"—" and explicitly NOT a per-project portfolio fetch.
 *
 * `grades` is `{}` until the first (synchronous) collection and after it
 * for an all-unvisited portfolio — callers treat a missing repo as
 * "no grade yet" → `null` prop → existing "—" render.
 */

import { useState } from "react";
import type { ProjectData } from "../types";
import type { HealthGrade } from "../components/v4/portfolio/ProjectScorecard";
import { collectCachedHealthGrades } from "../utils/portfolioHealthCollector";

export interface UsePortfolioHealthCollectionState {
  /**
   * Per-project health grade map (`repo → A|B|C|D|F`). A repo absent from
   * the map has no fresh cached report; the caller passes `null` for it so
   * the Scorecard renders its existing muted "—".
   */
  grades: Record<string, HealthGrade>;
}

export function usePortfolioHealthCollection(
  projects: ProjectData[],
  refreshSignal: string | null,
): UsePortfolioHealthCollectionState {
  const [grades, setGrades] = useState<Record<string, HealthGrade>>({});

  // Stable list of repos; the project set is hardcoded so `repoKey` alone
  // never changes within a session. `refreshSignal` is the volatile part
  // (the selected-repo): visiting a project Hub caches that project's
  // report, and ProjectsView stays mounted across Hub visits, so without
  // a volatile trigger a freshly-cached grade would only surface after a
  // full page reload. Folding it in re-collects on every Hub enter/leave
  // (the leave is what matters — the grid then shows the just-cached
  // grade). Still a pure synchronous sessionStorage read, zero network.
  // U+241F (unit separator) can't appear in a GitHub repo slug or in
  // `refreshSignal`, so the composite key is collision-free.
  const repoKey = projects.map((p) => p.repo).sort().join("|");
  const syncKey = `${repoKey}␟${refreshSignal ?? ""}`;

  // RENDER PATH: pure cached collection. The read is synchronous and a
  // pure function of `syncKey`, so this uses React's documented "adjust
  // state during render when a prop changes" pattern (prev-value in state
  // + setState during render) — same pattern as `usePortfolioNbaCollection`.
  // It re-renders before commit with no effect / cascading render, and
  // (unlike a setState-in-effect) satisfies the strict react-hooks lint
  // rules.
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    const repos = repoKey.length > 0 ? repoKey.split("|") : [];
    setGrades(collectCachedHealthGrades(repos));
  }

  return { grades };
}
