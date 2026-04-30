import type { ProjectData, Issue } from "../types";
import { toLocalDay } from "./date";

/** Last N days as YYYY-MM-DD, oldest first, ending with today. */
export function getLastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toLocalDay(d));
  }
  return days;
}

/** Issues closed within the trailing window of `days`, optionally with a back-shift. */
function closedInWindow(issues: Issue[], days: number, shiftBackDays = 0): number {
  const now = Date.now();
  const end = now - shiftBackDays * 86400000;
  const start = end - days * 86400000;
  let n = 0;
  for (const i of issues) {
    if (!i.closedAt) continue;
    const t = new Date(i.closedAt).getTime();
    if (t > start && t <= end) n++;
  }
  return n;
}

export interface PortfolioVelocity {
  perDay7d: number;
  perDay14d: number;
  /** percent change of 7d vs the prior 7d period (positive = improving) */
  delta7dVsPrev: number;
  /** counts per day for the trailing N days, oldest first (used for sparkline) */
  daily28d: number[];
}

export function calcPortfolioVelocity(projects: ProjectData[]): PortfolioVelocity {
  const allIssues = projects.flatMap((p) => p.issues);

  const closed7d = closedInWindow(allIssues, 7);
  const closed14d = closedInWindow(allIssues, 14);
  const closedPrev7d = closedInWindow(allIssues, 7, 7);

  const perDay7d = closed7d / 7;
  const perDay14d = closed14d / 14;

  const delta7dVsPrev =
    closedPrev7d === 0
      ? closed7d > 0 ? 100 : 0
      : Math.round(((closed7d - closedPrev7d) / closedPrev7d) * 100);

  const days = getLastNDays(28);
  const counts: Record<string, number> = {};
  for (const d of days) counts[d] = 0;
  for (const i of allIssues) {
    if (!i.closedAt) continue;
    const day = toLocalDay(new Date(i.closedAt));
    if (day in counts) counts[day]++;
  }
  const daily28d = days.map((d) => counts[d]);

  return { perDay7d, perDay14d, delta7dVsPrev, daily28d };
}

export interface OpenDelta {
  /** Net change in open count over last 7 days (closed in window − created in window) */
  netDelta7d: number;
}

export function calcOpenDelta(projects: ProjectData[]): OpenDelta {
  const allIssues = projects.flatMap((p) => p.issues);
  const now = Date.now();
  const cutoff = now - 7 * 86400000;
  let createdInWindow = 0;
  let closedInWindow = 0;
  for (const i of allIssues) {
    if (new Date(i.createdAt).getTime() > cutoff) createdInWindow++;
    if (i.closedAt && new Date(i.closedAt).getTime() > cutoff) closedInWindow++;
  }
  return { netDelta7d: createdInWindow - closedInWindow };
}

export interface ProgressDelta {
  /** % point change in done/total ratio over last 7 days */
  pointsDelta7d: number;
}

export function calcProgressDelta(projects: ProjectData[]): ProgressDelta {
  const totals = projects.reduce(
    (acc, p) => {
      acc.total += p.totalCount;
      acc.done += p.doneCount;
      return acc;
    },
    { total: 0, done: 0 }
  );
  if (totals.total === 0) return { pointsDelta7d: 0 };
  const cutoff = Date.now() - 7 * 86400000;
  const allIssues = projects.flatMap((p) => p.issues);
  const closedInWindow = allIssues.filter(
    (i) => i.closedAt && new Date(i.closedAt).getTime() > cutoff
  ).length;
  // Approximation: assume total was unchanged; previous done = current done − closedInWindow
  const prevPct = ((totals.done - closedInWindow) / totals.total) * 100;
  const nowPct = (totals.done / totals.total) * 100;
  return { pointsDelta7d: Math.round((nowPct - prevPct) * 10) / 10 };
}

export interface PriorityTotals {
  P1: number;
  P2: number;
  P3: number;
  P4: number;
}

export function sumOpenPriorities(projects: ProjectData[]): PriorityTotals {
  return projects.reduce<PriorityTotals>(
    (acc, p) => {
      acc.P1 += p.priorityCounts.P1;
      acc.P2 += p.priorityCounts.P2;
      acc.P3 += p.priorityCounts.P3;
      acc.P4 += p.priorityCounts.P4;
      return acc;
    },
    { P1: 0, P2: 0, P3: 0, P4: 0 }
  );
}

export interface DailyClosed {
  day: string;
  count: number;
}

export function dailyClosedLastN(projects: ProjectData[], n: number): DailyClosed[] {
  const days = getLastNDays(n);
  const counts: Record<string, number> = {};
  for (const d of days) counts[d] = 0;
  for (const p of projects) {
    for (const i of p.issues) {
      if (!i.closedAt) continue;
      const day = toLocalDay(new Date(i.closedAt));
      if (day in counts) counts[day]++;
    }
  }
  return days.map((day) => ({ day, count: counts[day] }));
}

/** Centered moving average of `window` length over the series. */
export function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j];
    out.push(sum / (hi - lo + 1));
  }
  return out;
}
