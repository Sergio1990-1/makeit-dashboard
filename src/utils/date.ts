/** Shared date helpers used across deadline / chart components. */

/** Whole-day distance between today and `dueOn` (ISO string). Negative = overdue. */
export function daysUntil(dueOn: string): number {
  return Math.ceil((new Date(dueOn).getTime() - Date.now()) / 86400000);
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
