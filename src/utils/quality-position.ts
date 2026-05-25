/**
 * Pure position math for the Codex Quality tab annotation overlay.
 *
 * Two modes:
 *   - "30d": daily buckets, annotations snap to bar center.
 *   - "12w": ISO-week buckets, annotations positioned proportionally
 *           within the (bucketCount * 7)-day window.
 *
 * NOTE: `PeriodMode` is intentionally defined locally here. When
 * `src/types/quality.ts` lands (separate task), this local type can be
 * replaced with `import type { PeriodMode } from "../types/quality"`.
 */
export type PeriodMode = "30d" | "12w";

/**
 * Snap any date to the Monday of its ISO week (in UTC).
 * Sunday belongs to the *previous* ISO week (so 2026-05-17 Sun → 2026-05-11 Mon).
 */
export function isoMonday(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

const DAY_MS = 86_400_000;

/**
 * Compute the X-axis position (in %) for an annotation marker on the
 * quality chart, or `null` if the date falls outside the visible window.
 *
 *   - 30d mode: snap to bar center → ((dayIdx + 0.5) / bucketCount) * 100
 *   - 12w mode: proportional inside the ISO-week window of bucketCount*7 days
 *
 * @param occurredAt   When the annotated event happened.
 * @param mode         Period mode.
 * @param today        Reference date — the right edge of the window.
 * @param bucketCount  Number of buckets visible (e.g. 30 days or 12 weeks).
 */
export function annotationPositionPct(
  occurredAt: Date,
  mode: PeriodMode,
  today: Date,
  bucketCount: number,
): number | null {
  const occ = new Date(occurredAt);
  occ.setUTCHours(0, 0, 0, 0);

  if (mode === "30d") {
    const start = new Date(today);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (bucketCount - 1));
    const daysFromStart = Math.round((occ.getTime() - start.getTime()) / DAY_MS);
    if (daysFromStart < 0 || daysFromStart >= bucketCount) return null;
    return ((daysFromStart + 0.5) / bucketCount) * 100;
  } else {
    const todayMon = isoMonday(today);
    const start = new Date(todayMon);
    start.setUTCDate(start.getUTCDate() - (bucketCount - 1) * 7);
    const totalDays = bucketCount * 7;
    const daysFromStart = (occ.getTime() - start.getTime()) / DAY_MS;
    if (daysFromStart < 0 || daysFromStart >= totalDays) return null;
    return (daysFromStart / totalDays) * 100;
  }
}
