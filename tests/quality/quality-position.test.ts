import { describe, it, expect } from "vitest";
import { isoMonday, annotationPositionPct } from "../../src/utils/quality-position";

describe("isoMonday", () => {
  it("snaps Wednesday to Monday of same week", () => {
    expect(isoMonday(new Date("2026-05-13"))).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });
  it("snaps Sunday to Monday of same week (not next)", () => {
    expect(isoMonday(new Date("2026-05-17"))).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });
  it("snaps Monday to itself", () => {
    expect(isoMonday(new Date("2026-05-11"))).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });
});

describe("annotationPositionPct", () => {
  const today = new Date("2026-05-25T00:00:00Z"); // Monday
  it("30d mode snaps to bar center", () => {
    // Annotation on 2026-05-15 (10 days before today, day index 19 in 30-day series ending today)
    const pct = annotationPositionPct(new Date("2026-05-15T08:00:00Z"), "30d", today, 30);
    // (19 + 0.5) / 30 = 65%
    expect(pct).toBeCloseTo(65);
  });
  it("12w mode positions proportionally within week", () => {
    // Annotation on Wed 2026-05-13. Week 12 of 12 starts on Mon 2026-05-25.
    // 2026-05-13 is in week starting 2026-05-11 — that's week index 10 (0-based) of 12.
    // days from window start (2026-03-09) to 2026-05-13 = 65 days
    // pct = 65 / (12*7) = 65/84 = 77.4%
    const pct = annotationPositionPct(new Date("2026-05-13T00:00:00Z"), "12w", today, 12);
    expect(pct).toBeCloseTo(77.38, 1);
  });
  it("returns null for date outside window", () => {
    expect(annotationPositionPct(new Date("2025-01-01"), "30d", today, 30)).toBeNull();
    expect(annotationPositionPct(new Date("2030-01-01"), "30d", today, 30)).toBeNull();
  });
});
