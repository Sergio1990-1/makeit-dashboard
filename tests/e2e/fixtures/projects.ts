import type { ProjectData, Phase } from "../../../src/types";

/**
 * Deterministic ProjectData fixtures for the E2E journey (#417).
 *
 * Typed against the real `ProjectData` so `tsc -p tsconfig.e2e.json` fails
 * loudly if the app's data contract changes — that is the safety mechanism
 * that keeps a hand-rolled fixture from silently drifting and rendering a
 * blank Portfolio. Values are plausible but synthetic; the journey only
 * needs the Scorecard grid to render and be clickable.
 */

const DAY = 86_400_000;

function makeProject(repo: string, phase: Phase, i: number): ProjectData {
  const open = 3 + (i % 5);
  const done = 10 + i;
  return {
    repo,
    client: `Client ${i + 1}`,
    phase,
    issues: [],
    priorityCounts: { P1: i % 2, P2: 1, P3: 2, P4: 0 },
    progress: Math.min(100, 40 + i * 4),
    lastCommitDate: new Date(Date.now() - (1 + (i % 6)) * DAY).toISOString(),
    description: `Synthetic e2e fixture project ${repo}`,
    openCount: open,
    doneCount: done,
    totalCount: open + done,
    milestones: [],
    budget: 1000 * (i + 1),
    paid: 500 * (i + 1),
    remaining: 500 * (i + 1),
    daysSinceActivity: 1 + (i % 6),
    lastActivityDate: new Date(Date.now() - (1 + (i % 6)) * DAY).toISOString(),
    velocity7d: 0.5,
    velocity14d: 0.4,
    etaDays: 14 + i,
    etaDate: new Date(Date.now() + (14 + i) * DAY).toISOString(),
    cycleTimeDays: 3,
    commitActivity: { byDate: {}, today: 0, thisWeek: 2, thisMonth: 8, total84d: 30 },
  };
}

const PHASES: Phase[] = ["development", "support", "pre-dev"];

/**
 * 12 projects → the 3-col Scorecard grid overflows the 800px test viewport,
 * so the Portfolio is genuinely scrollable (required to verify scroll
 * preservation on browser-back).
 */
export const PROJECTS_FIXTURE: ProjectData[] = Array.from({ length: 12 }, (_, i) =>
  makeProject(`e2e-repo-${i + 1}`, PHASES[i % PHASES.length], i),
);

/** First card the journey clicks into. */
export const FIRST_REPO = PROJECTS_FIXTURE[0].repo;

/**
 * NBA cache envelope shape the engine writes and `readPortfolioNbaCount`
 * validates: `{ week: "YYYY-Www", result: { actions: [...] } }`. The sidebar
 * badge shows `actions.length` when > 0.
 */
export const NBA_ENVELOPE = {
  week: "2026-W20",
  result: {
    actions: [
      { id: "a1", title: "Action 1" },
      { id: "a2", title: "Action 2" },
      { id: "a3", title: "Action 3" },
    ],
    budgetFallback: false,
  },
};

export const NBA_BADGE_COUNT = NBA_ENVELOPE.result.actions.length;
