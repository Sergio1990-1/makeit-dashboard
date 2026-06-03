/** Shared date helpers used across deadline / chart components. */

/**
 * Truncate a `Date` to local midnight (00:00 in the browser's timezone),
 * dropping the time-of-day. Use this when comparing *calendar* days so the
 * result never depends on the wall-clock hour or on UTC↔local offset.
 *
 * Distinct from `toLocalDay` (which returns a `YYYY-MM-DD` string) — this
 * returns a `Date` so the difference can be divided by `86400000`.
 */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole-day distance between a reference time and `dueOn` (ISO string),
 * measured in LOCAL calendar days. Negative = overdue, 0 = due today,
 * positive = upcoming.
 *
 * `dueOn` from GitHub is midnight-UTC (`YYYY-MM-DDT00:00:00Z`) while the
 * reference is an arbitrary wall-clock time, so a raw millisecond diff would
 * report a milestone due *today* as "1 дн" in eastern timezones (verified for
 * UTC+6). Comparing `startOfLocalDay` of both sides removes that off-by-one.
 *
 * Pass `reference` (e.g. the `lastUpdated` data anchor) to keep classification
 * consistent with positions computed against the same anchor — without it,
 * Date.now() drifts every render.
 */
export function daysUntil(dueOn: string, reference?: Date): number {
  const ref = reference ?? new Date();
  const due = startOfLocalDay(new Date(dueOn));
  return Math.round((due.getTime() - startOfLocalDay(ref).getTime()) / 86400000);
}

/** Localised "DD MMM" (Russian short month) — used in deadline badges. */
export function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** YYYY-MM-DD in the browser's local timezone. */
export function toLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last seven days as YYYY-MM-DD, oldest first, ending with today. */
export function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toLocalDay(d));
  }
  return days;
}

/** Russian "Wed, 5 Apr"-style label for chart axes. */
export function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("ru-RU", { month: "short" });
  return `${weekday}, ${day} ${month}`;
}
