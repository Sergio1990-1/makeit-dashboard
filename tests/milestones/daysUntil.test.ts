import { describe, it, expect } from "vitest";
import { daysUntil, startOfLocalDay } from "../../src/utils/date";

/**
 * Helper: midnight-UTC ISO string for a given LOCAL calendar day. GitHub's
 * milestone `dueOn` is always a `YYYY-MM-DDT00:00:00Z` value — the date the
 * user picked, serialised at UTC midnight. We mirror that so the off-by-one
 * regression is reproduced exactly the way the API delivers it.
 */
function dueOnForLocalDay(y: number, m: number, d: number): string {
  const utcMidnight = new Date(Date.UTC(y, m, d, 0, 0, 0));
  return utcMidnight.toISOString();
}

describe("startOfLocalDay", () => {
  it("truncates to local midnight, preserving the calendar day", () => {
    const ref = new Date(2026, 5, 3, 17, 45, 12, 500); // local wall-clock
    const start = startOfLocalDay(ref);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(3);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it("does not mutate its argument", () => {
    const ref = new Date(2026, 5, 3, 17, 45, 0);
    const copy = new Date(ref.getTime());
    startOfLocalDay(ref);
    expect(ref.getTime()).toBe(copy.getTime());
  });
});

describe("daysUntil", () => {
  it("returns 0 when due on the local 'today' (M2 off-by-one regression)", () => {
    // reference is late in the local day; due is the SAME local calendar day,
    // delivered as UTC-midnight (exactly how GitHub serialises milestone dueOn).
    const reference = new Date(2026, 5, 3, 23, 30, 0); // 3 Jun, 23:30 local
    const dueOn = dueOnForLocalDay(2026, 5, 3); // 3 Jun, midnight UTC
    expect(daysUntil(dueOn, reference)).toBe(0);
  });

  it("returns 0 for due-today even when the reference is early in the day", () => {
    const reference = new Date(2026, 5, 3, 0, 5, 0); // 3 Jun, 00:05 local
    const dueOn = dueOnForLocalDay(2026, 5, 3);
    expect(daysUntil(dueOn, reference)).toBe(0);
  });

  it("returns negative for an overdue milestone", () => {
    const reference = new Date(2026, 5, 10, 12, 0, 0); // 10 Jun
    const dueOn = dueOnForLocalDay(2026, 5, 3); // 3 Jun → 7 days ago
    expect(daysUntil(dueOn, reference)).toBe(-7);
  });

  it("returns positive for a future milestone", () => {
    const reference = new Date(2026, 5, 3, 12, 0, 0); // 3 Jun
    const dueOn = dueOnForLocalDay(2026, 5, 13); // 13 Jun → in 10 days
    expect(daysUntil(dueOn, reference)).toBe(10);
  });

  it("counts whole local calendar days, ignoring time-of-day within each day", () => {
    // due tomorrow at local midnight; reference late today → exactly 1 day,
    // never 2 (which a ceil over raw ms would produce).
    const reference = new Date(2026, 5, 3, 23, 59, 0);
    const dueOn = dueOnForLocalDay(2026, 5, 4);
    expect(daysUntil(dueOn, reference)).toBe(1);
  });

  it("is symmetric for the previous local day", () => {
    const reference = new Date(2026, 5, 3, 0, 1, 0);
    const dueOn = dueOnForLocalDay(2026, 5, 2);
    expect(daysUntil(dueOn, reference)).toBe(-1);
  });
});
