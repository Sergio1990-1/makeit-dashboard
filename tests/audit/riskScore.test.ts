import { describe, it, expect } from "vitest";
import { calcRiskScore } from "../../src/utils/riskScore";
import type { ProjectData } from "../../src/types";

// Minimal ProjectData factory. Defaults describe a *perfectly healthy,
// fully-instrumented* repo: no P1s, recent activity, fast cycle time, zero
// bugs. Individual tests override only the fields under test so we pin the
// effect of one risk component at a time.
function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    repo: "owner/repo",
    client: "MakeIT",
    phase: "active" as ProjectData["phase"],
    issues: [],
    priorityCounts: { P1: 0, P2: 0, P3: 0 } as ProjectData["priorityCounts"],
    progress: 50,
    lastCommitDate: "2026-06-01",
    description: "",
    openCount: 10,
    doneCount: 10,
    totalCount: 20,
    milestones: [],
    budget: 0,
    paid: 0,
    remaining: 0,
    daysSinceActivity: 1,
    lastActivityDate: "2026-06-02",
    velocity7d: 1,
    velocity14d: 1,
    etaDays: 5,
    etaDate: "2026-06-08",
    cycleTimeDays: 3,
    commitActivity: { total: 0, weeks: [] } as unknown as ProjectData["commitActivity"],
    ...overrides,
  };
}

describe("calcRiskScore — A6: missing activity must NOT score as best-case", () => {
  it("daysSinceActivity=null is penalised, not treated as 0 (fresh)", () => {
    const noData = calcRiskScore(makeProject({ daysSinceActivity: null }));
    const fresh = calcRiskScore(makeProject({ daysSinceActivity: 1 }));
    // No-data must score strictly worse than a genuinely-fresh repo.
    expect(noData.score).toBeGreaterThan(fresh.score);
    // The penalty should be visible to the user as a factor mentioning data.
    expect(noData.factors.some((f) => /данны/i.test(f.text))).toBe(true);
  });

  it("cycleTimeDays=null is penalised, not silently skipped", () => {
    const noData = calcRiskScore(makeProject({ cycleTimeDays: null }));
    const fast = calcRiskScore(makeProject({ cycleTimeDays: 3 }));
    expect(noData.score).toBeGreaterThan(fast.score);
  });

  it("a totally-dataless repo does not tie a healthy one at 0", () => {
    const dataless = calcRiskScore(
      makeProject({ daysSinceActivity: null, cycleTimeDays: null }),
    );
    const healthy = calcRiskScore(makeProject());
    expect(healthy.level).toBe("low");
    // Dataless must score above the healthy baseline (missing data is a risk,
    // not the ideal). It need not leave "low" on its own, but must not tie 0.
    expect(dataless.score).toBeGreaterThan(healthy.score);
    expect(dataless.score).toBeGreaterThan(0);
  });
});

describe("calcRiskScore — normal full-data case is preserved", () => {
  it("a perfectly healthy repo still scores ~0 / low", () => {
    const r = calcRiskScore(makeProject());
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
  });

  it("known activity buckets are unchanged (8d stale = 5 pts)", () => {
    const r = calcRiskScore(makeProject({ daysSinceActivity: 8 }));
    const factor = r.factors.find((f) => /без активности/.test(f.text));
    expect(factor?.points).toBe(5);
  });

  it("30+ days stale still adds 20 pts (unchanged)", () => {
    const r = calcRiskScore(makeProject({ daysSinceActivity: 40 }));
    const factor = r.factors.find((f) => /без активности/.test(f.text));
    expect(factor?.points).toBe(20);
  });

  it("slow cycle time (>30d) still adds 10 pts (unchanged)", () => {
    const r = calcRiskScore(makeProject({ cycleTimeDays: 45 }));
    const factor = r.factors.find((f) => /Цикл закрытия/.test(f.text));
    expect(factor?.points).toBe(10);
  });

  it("score stays clamped to 0..100 under maximal risk", () => {
    const r = calcRiskScore(
      makeProject({
        priorityCounts: { P1: 99, P2: 0, P3: 0 } as ProjectData["priorityCounts"],
        daysSinceActivity: null,
        cycleTimeDays: null,
      }),
      { status: "down" } as never,
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
