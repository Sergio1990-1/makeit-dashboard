import type { PipelineResult, PipelineStatus } from "../../../utils/pipeline";

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}с`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}м ${s}с`;
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м`;
}

export function compactUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

/** Sum cost over results, ignoring undefined. */
export function sumCost(results: PipelineResult[]): number {
  return results.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
}

/** Sum total_duration_seconds over results, ignoring undefined. */
export function sumDuration(results: PipelineResult[]): number {
  return results.reduce((s, r) => s + (r.total_duration_seconds ?? 0), 0);
}

/**
 * Group results into runs based on a heuristic boundary. The pipeline API does
 * not currently expose a `run_id` per result, so we cluster results that
 * appear together. Strategy: keep the natural order from the API (already in
 * insertion order — newest run last). Walk forward and split when there's a
 * gap of more than `gapMinutes` between consecutive durations + when the
 * status field switches from "in_progress"-style to "done"/"needs_human".
 *
 * In practice the API returns results in a single batch per run, so a much
 * simpler heuristic works: a single "current run" = all results since the
 * latest pipeline start (we track `running` transitions in the parent and
 * reset the result-baseline). This util just groups everything into one run
 * for now; the parent passes the right slice for "current" vs "previous".
 */
export interface ResultGroup {
  label: string;
  results: PipelineResult[];
  totalCost: number;
  totalDuration: number;
}

/** Trivial "all in one group" — kept for API symmetry. */
export function groupResultsAsSingle(results: PipelineResult[], label: string): ResultGroup {
  return {
    label,
    results,
    totalCost: sumCost(results),
    totalDuration: sumDuration(results),
  };
}

export function activeTaskCount(status: PipelineStatus | null): number {
  if (!status) return 0;
  if (typeof status.active_tasks === "number") return status.active_tasks;
  return Object.keys(status.issue_stages ?? {}).length;
}

/**
 * Average closed-per-day for the closed-Pipeline chart.
 *
 * Averages over the SAME window that the chart renders (`days`), so the
 * displayed "ср. в день" honestly describes the bars shown: `avg ≈ total/N`.
 * The previous implementation summed `days.slice(0, 6)/6`, silently dropping
 * the current (partial) day from the average while `total` summed all 7 — so
 * the per-day label lied (#524). Missing day keys count as 0; an empty window
 * yields 0. Result is rounded to the nearest integer to match the badge format.
 */
export function closedChartAvgPerDay(
  countsByDay: Record<string, number>,
  days: string[],
): number {
  if (days.length === 0) return 0;
  const sum = days.reduce((s, d) => s + (countsByDay[d] ?? 0), 0);
  return Math.round(sum / days.length);
}
