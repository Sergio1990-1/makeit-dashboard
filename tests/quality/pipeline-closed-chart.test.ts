import { describe, it, expect } from "vitest";
import { closedChartAvgPerDay } from "../../src/components/v4/pipeline/utils";

describe("closedChartAvgPerDay", () => {
  const days = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];

  it("averages over the full 7-day window shown (does not drop today)", () => {
    // total = 7+7+7+7+7+7+7 = 49, avg = 49/7 = 7
    const counts: Record<string, number> = {
      d1: 7,
      d2: 7,
      d3: 7,
      d4: 7,
      d5: 7,
      d6: 7,
      d7: 7,
    };
    expect(closedChartAvgPerDay(counts, days)).toBe(7);
  });

  it("keeps avg consistent with the displayed total (avg*7 ≈ total)", () => {
    // total = 14, over 7 days → avg 2 (rounded)
    const counts: Record<string, number> = {
      d1: 2,
      d2: 2,
      d3: 2,
      d4: 2,
      d5: 2,
      d6: 2,
      d7: 2,
    };
    const total = days.reduce((s, d) => s + counts[d], 0);
    const avg = closedChartAvgPerDay(counts, days);
    expect(avg).toBe(2);
    expect(avg * days.length).toBe(total);
  });

  it("counts today's bar in the average (regression for silent-drop bug)", () => {
    // All activity on the last/current day. Old buggy impl summed days[0..5]/6 = 0.
    // Honest impl over all 7 days: 14/7 = 2.
    const counts: Record<string, number> = {
      d1: 0,
      d2: 0,
      d3: 0,
      d4: 0,
      d5: 0,
      d6: 0,
      d7: 14,
    };
    expect(closedChartAvgPerDay(counts, days)).toBe(2);
  });

  it("rounds to the nearest integer", () => {
    // total = 10 over 7 days = 1.43 → rounds to 1
    const counts: Record<string, number> = {
      d1: 10,
      d2: 0,
      d3: 0,
      d4: 0,
      d5: 0,
      d6: 0,
      d7: 0,
    };
    expect(closedChartAvgPerDay(counts, days)).toBe(1);
  });

  it("returns 0 for an empty window", () => {
    expect(closedChartAvgPerDay({}, [])).toBe(0);
  });

  it("treats missing day keys as 0", () => {
    // d4..d7 absent from the map → counted as 0. total 6 / 7 = 0.857 → 1
    const counts: Record<string, number> = { d1: 2, d2: 2, d3: 2 };
    expect(closedChartAvgPerDay(counts, days)).toBe(1);
  });
});
