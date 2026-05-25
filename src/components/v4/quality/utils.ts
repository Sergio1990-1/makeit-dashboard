import type { QualitySnapshot } from "../../../types";

export type Health = "ok" | "warn" | "danger" | "unknown";

/** Convert ISO week ("2026-W17") or ISO date string into a human-readable
 * date range. Falls back to the input if it can't be parsed.
 * Defensive: server may omit `period` on partial responses; return a dash
 * rather than crashing the whole retro detail card. */
export function formatPeriodRange(period: string | null | undefined): string {
  if (!period) return "—";
  // ISO week format: "YYYY-Www"
  const wkMatch = period.match(/^(\d{4})-W(\d{1,2})$/);
  if (wkMatch) {
    const year = Number(wkMatch[1]);
    const week = Number(wkMatch[2]);
    const start = isoWeekStart(year, week);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${shortDate(start)}–${shortDate(end)}`;
  }
  // Try as date
  const d = new Date(period);
  if (!isNaN(d.getTime())) return shortDate(d);
  return period;
}

/** ISO 8601 week → Monday of that week (UTC). */
function isoWeekStart(year: number, week: number): Date {
  // Jan 4 is always in week 1. The Monday of week 1 is at most 3 days before Jan 4.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Sunday → 7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

const RU_MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function shortDate(d: Date): string {
  return `${d.getUTCDate()} ${RU_MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function pct(value: number | null, decimals = 1): string {
  if (value === null || !isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function duration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}с`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}м`;
  return `${(seconds / 3600).toFixed(1)}ч`;
}

export function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days < 0) return "—";
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн`;
  if (days < 30) return `${Math.floor(days / 7)} нед`;
  return `${Math.floor(days / 30)} мес`;
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Color rule: higher_is_better=true → ≥good ok, ≥bad warn, else danger. */
export function healthOf(
  value: number | null,
  good: number,
  bad: number,
  higherIsBetter = true,
): Health {
  if (value === null || !isFinite(value)) return "unknown";
  if (higherIsBetter) {
    if (value >= good) return "ok";
    if (value >= bad) return "warn";
    return "danger";
  }
  if (value <= good) return "ok";
  if (value <= bad) return "warn";
  return "danger";
}

export function healthColor(h: Health): string {
  if (h === "ok") return "var(--v4-success-700)";
  if (h === "warn") return "var(--v4-warn-700)";
  if (h === "danger") return "var(--v4-danger-700)";
  return "var(--v4-ink-500)";
}

/** Compose an SVG polyline path scaled to the given viewBox. */
export function sparklinePath(
  values: (number | null)[],
  width: number,
  height: number,
): string {
  const present = values
    .map((v, i) => (v === null || !isFinite(v) ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);
  if (present.length === 0) return "";
  const min = Math.min(...present.map((p) => p.v));
  const max = Math.max(...present.map((p) => p.v));
  const range = max - min || 1;
  const xStep = values.length > 1 ? width / (values.length - 1) : 0;
  return present
    .map((p, idx) => {
      const x = p.i * xStep;
      const y = height - ((p.v - min) / range) * height;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Series of values across snapshots, ordered chronologically. */
export function snapshotSeries(
  snapshots: QualitySnapshot[],
  key: keyof QualitySnapshot,
): (number | null)[] {
  return snapshots.map((s) => {
    const v = s[key];
    if (typeof v === "number") return v;
    return null;
  });
}

/** Compare current to mean of previous N snapshots → delta as fraction
 *  (e.g. -0.05 = 5% worse for higher-is-better, 5% better for lower-is-better).
 *  Returns null if not enough data, or if the latest snapshot lacks the metric
 *  (otherwise we'd show a misleading delta next to a "—" current value). */
export function deltaVsPrev(
  series: (number | null)[],
  prevWindow = 3,
): { abs: number; cur: number } | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  if (latest === null || !isFinite(latest)) return null;
  const prior = series
    .slice(0, -1)
    .filter((v): v is number => v !== null && isFinite(v));
  if (prior.length === 0) return null;
  const prevSlice = prior.slice(-prevWindow);
  const prev = prevSlice.reduce((s, x) => s + x, 0) / prevSlice.length;
  return { abs: latest - prev, cur: latest };
}

export function relativeAgo(ts: string | null): string {
  if (!ts) return "—";
  const t = new Date(ts).getTime();
  if (isNaN(t)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}с назад`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  const d = Math.floor(h / 24);
  return `${d}д назад`;
}
