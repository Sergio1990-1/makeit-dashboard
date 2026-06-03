import { describe, expect, it } from "vitest";
import {
  computeProgress,
  buildActivity,
  commitActivityFromWeeks,
  REPO_INFO_QUERY,
} from "../src/utils/github";
import { toLocalDay } from "../src/utils/date";

// ── D2: progress must not round an incomplete repo up to 100% ──
describe("computeProgress", () => {
  it("returns 0 when there are no issues (totalCount === 0)", () => {
    expect(computeProgress(0, 0)).toBe(0);
  });

  it("returns 100 only when every issue is done", () => {
    expect(computeProgress(200, 200)).toBe(100);
    expect(computeProgress(1, 1)).toBe(100);
  });

  it("caps at 99 for an incomplete repo that would otherwise round to 100", () => {
    // 199/200 = 99.5% → naive Math.round → 100, which is wrong.
    expect(computeProgress(199, 200)).toBe(99);
  });

  it("rounds normally below the cap", () => {
    expect(computeProgress(1, 2)).toBe(50);
    expect(computeProgress(1, 3)).toBe(33);
    expect(computeProgress(0, 5)).toBe(0);
  });
});

// ── G4/U1: commit-activity day keys and boundaries must use LOCAL days ──
describe("commitActivityFromWeeks (local-day keys)", () => {
  it("keys byDate using the browser's local day, not UTC", () => {
    // Sunday 2026-01-04 00:00 UTC as the week anchor.
    const sundayUtc = Math.floor(Date.UTC(2026, 0, 4, 0, 0, 0) / 1000);
    const weeks = [
      // days[0] = Sunday, count 3
      { days: [3, 0, 0, 0, 0, 0, 0], total: 3, week: sundayUtc },
    ];
    const activity = commitActivityFromWeeks(weeks);
    const expectedKey = toLocalDay(new Date(sundayUtc * 1000));
    expect(activity.byDate[expectedKey]).toBe(3);
  });
});

describe("buildActivity (local-day boundaries)", () => {
  it("derives today/thisWeek using the local-day key for the current day", () => {
    const todayKey = toLocalDay(new Date());
    const activity = buildActivity({ [todayKey]: 5 });
    expect(activity.today).toBe(5);
    expect(activity.thisWeek).toBe(5);
    expect(activity.thisMonth).toBe(5);
    expect(activity.total84d).toBe(5);
  });

  it("uses a local-day weekAgo boundary so a commit 6 local-days ago counts in thisWeek", () => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const sixDaysAgoKey = toLocalDay(d);
    const activity = buildActivity({ [sixDaysAgoKey]: 2 });
    expect(activity.thisWeek).toBe(2);
  });
});

// ── G1: frontend milestone caps must match the cache backend ──
describe("REPO_INFO_QUERY milestone caps", () => {
  it("requests first: 100 open milestones and first: 50 closed", () => {
    expect(REPO_INFO_QUERY).toMatch(/openMilestones:\s*milestones\(first:\s*100/);
    expect(REPO_INFO_QUERY).toMatch(/closedMilestones:\s*milestones\(first:\s*50/);
  });
});
