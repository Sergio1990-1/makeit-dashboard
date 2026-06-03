import { describe, it, expect } from "vitest";
import { calcPortfolioVelocity } from "../../src/utils/dashboardMetrics";
import type { Issue, ProjectData } from "../../src/types";

const DAY = 86_400_000;

/** Minimal issue closed `daysAgo` days before now. */
function closedIssue(id: string, daysAgo: number): Issue {
  return {
    id,
    number: null,
    title: id,
    url: "",
    status: "Done",
    priority: null,
    complexity: null,
    labels: [],
    repo: "r",
    milestoneTitle: null,
    isBlocked: false,
    createdAt: new Date(Date.now() - (daysAgo + 30) * DAY).toISOString(),
    updatedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
    closedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
  };
}

/** Wrap a list of issues in a ProjectData shell (only `issues` is read). */
function project(issues: Issue[]): ProjectData {
  return {
    repo: "r",
    client: "c",
    phase: "development",
    issues,
    priorityCounts: { P1: 0, P2: 0, P3: 0, P4: 0 },
    progress: 0,
    lastCommitDate: null,
    description: "",
    openCount: 0,
    doneCount: issues.length,
    totalCount: issues.length,
    milestones: [],
    budget: 0,
    paid: 0,
    remaining: 0,
    daysSinceActivity: null,
    lastActivityDate: null,
  } as ProjectData;
}

describe("calcPortfolioVelocity — delta7dVsPrev (D5: no fabricated +100% from zero base)", () => {
  it("returns null (not 100) when the prior 7-day base is zero but recent activity exists", () => {
    // 3 issues closed in the trailing 7 days, none in the prior 7d window (days 8-14).
    const issues = [closedIssue("a", 1), closedIssue("b", 2), closedIssue("c", 3)];
    const v = calcPortfolioVelocity([project(issues)]);
    expect(v.delta7dVsPrev).toBeNull();
  });

  it("returns 0 (no change) when both the current and prior 7-day windows are empty", () => {
    const v = calcPortfolioVelocity([project([])]);
    expect(v.delta7dVsPrev).toBe(0);
  });

  it("computes a real percentage from a nonzero prior base", () => {
    // prior 7d (days 8-14): 2 closed; current 7d: 4 closed → +100% real growth.
    const issues = [
      closedIssue("p1", 9),
      closedIssue("p2", 10),
      closedIssue("c1", 1),
      closedIssue("c2", 2),
      closedIssue("c3", 3),
      closedIssue("c4", 4),
    ];
    const v = calcPortfolioVelocity([project(issues)]);
    expect(v.delta7dVsPrev).toBe(100);
  });

  it("computes a negative percentage when velocity drops vs the prior week", () => {
    // prior 7d: 4 closed; current 7d: 2 closed → -50%.
    const issues = [
      closedIssue("p1", 8),
      closedIssue("p2", 9),
      closedIssue("p3", 10),
      closedIssue("p4", 11),
      closedIssue("c1", 1),
      closedIssue("c2", 2),
    ];
    const v = calcPortfolioVelocity([project(issues)]);
    expect(v.delta7dVsPrev).toBe(-50);
  });
});
