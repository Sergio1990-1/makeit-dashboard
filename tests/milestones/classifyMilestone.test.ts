import { describe, it, expect } from "vitest";
import type { Milestone } from "../../src/types";
import { classifyMilestone } from "../../src/components/v4/milestones/classifyMilestone";

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    title: "M",
    description: "",
    dueOn: "2026-06-10T00:00:00Z",
    url: "https://example.com/m/1",
    state: "OPEN",
    openIssues: 1,
    closedIssues: 0,
    repo: "Sewing-ERP",
    issues: [],
    createdAt: null,
    closedAt: null,
    ...overrides,
  };
}

describe("classifyMilestone — done detection (M5)", () => {
  it("marks a milestone done only when its state is CLOSED", () => {
    const m = makeMilestone({ state: "CLOSED", openIssues: 0, closedIssues: 5 });
    expect(classifyMilestone(m, 3)).toBe("done");
  });

  it("does NOT force an OPEN milestone to done when all its issues are closed", () => {
    // Regression: an open milestone with 0 open issues must keep its normal
    // deadline classification so it stays in the deadline plan.
    const m = makeMilestone({ state: "OPEN", openIssues: 0, closedIssues: 5 });
    expect(classifyMilestone(m, 2)).not.toBe("done");
    expect(classifyMilestone(m, 2)).toBe("warn"); // ≤7 → week tier
  });

  it("keeps an open milestone with no issues at all on its deadline track", () => {
    const m = makeMilestone({ state: "OPEN", openIssues: 0, closedIssues: 0 });
    expect(classifyMilestone(m, 5)).not.toBe("done");
  });
});

describe("classifyMilestone — deadline tiers (M3/M4 canonical thresholds)", () => {
  const open = (over: Partial<Milestone> = {}) =>
    makeMilestone({ state: "OPEN", openIssues: 1, closedIssues: 0, ...over });

  it("noeta when days is null", () => {
    expect(classifyMilestone(open(), null)).toBe("noeta");
  });

  it("overdue when days < 0", () => {
    expect(classifyMilestone(open(), -1)).toBe("overdue");
  });

  it("week tier (warn) at the ≤7 boundary", () => {
    expect(classifyMilestone(open(), 0)).toBe("warn");
    expect(classifyMilestone(open(), 7)).toBe("warn");
  });

  it("month tier (soon) between >7 and ≤30", () => {
    expect(classifyMilestone(open(), 8)).toBe("soon");
    expect(classifyMilestone(open(), 30)).toBe("soon");
  });

  it("later tier (norm) when days > 30", () => {
    expect(classifyMilestone(open(), 31)).toBe("norm");
    expect(classifyMilestone(open(), 365)).toBe("norm");
  });
});
