import type { Monitor, MonitorStatus } from "../../../types";
import { MONITOR_MATCH } from "../../../utils/config";

export type MonitorHealth = "ok" | "warn" | "danger" | "unknown";

export const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "Онлайн",
  down: "Не отвечает",
  paused: "На паузе",
  pending: "Проверяется",
};

export const STATUS_RANK: Record<MonitorStatus, number> = {
  // Lower rank = appears first in sort. Down first for incident triage.
  down: 0,
  pending: 1,
  paused: 2,
  up: 3,
};

/** Health classification of a monitor for color treatment. */
export function monitorHealth(m: Monitor): MonitorHealth {
  if (m.status === "down") return "danger";
  if (m.status === "pending") return "warn";
  if (m.status === "paused") return "unknown";
  if (m.uptimePct !== null && m.uptimePct < 99) return "warn";
  return "ok";
}

/** Aggregate health across the monitor pool. */
export function poolHealth(monitors: Monitor[]): MonitorHealth {
  if (monitors.length === 0) return "unknown";
  if (monitors.some((m) => m.status === "down")) return "danger";
  if (monitors.some((m) => m.status === "pending")) return "warn";
  if (monitors.some((m) => m.uptimePct !== null && m.uptimePct < 99)) return "warn";
  // All monitors paused -> no signal; align with monitorHealth("paused") = "unknown".
  if (monitors.every((m) => m.status === "paused")) return "unknown";
  return "ok";
}

export function uptimeColor(pct: number | null): string {
  if (pct === null) return "var(--mk-ink-400)";
  if (pct >= 99.9) return "var(--mk-success-strong)";
  if (pct >= 99) return "var(--mk-success)";
  if (pct >= 95) return "var(--mk-warn-strong)";
  return "var(--mk-danger-strong)";
}

/**
 * Does `haystack` contain `keyword`?
 *
 * For purely-numeric keywords (ports like "8000") we require a real boundary
 * on both sides so that ":8000" does NOT match inside ":18000" / ":80001".
 * Non-numeric keywords ("sewing", "biznews") keep plain substring matching.
 */
function keywordMatches(haystack: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (/^\d+$/.test(kw)) {
    // Boundary-safe: digit must not be glued to other digits on either side.
    const re = new RegExp(`(?:^|[^0-9])${kw}(?:[^0-9]|$)`);
    return re.test(haystack);
  }
  return haystack.includes(kw);
}

/** Reverse-lookup project repo for a monitor via MONITOR_MATCH keywords. */
export function getProjectName(monitor: Monitor): string | null {
  const name = monitor.name.toLowerCase();
  const url = monitor.url.toLowerCase();
  for (const [project, keywords] of Object.entries(MONITOR_MATCH)) {
    if (keywords.some((kw) => keywordMatches(name, kw) || keywordMatches(url, kw))) {
      return project;
    }
  }
  return null;
}

/**
 * Format an uptime percentage for display.
 *
 * FLOORS to 2 decimals so a value like 99.999 renders "99.99" instead of
 * rounding up to "100.00" and hiding real downtime. Only an exact 100 (or a
 * value that floors to 100) yields "100.00". Null / non-finite → em-dash,
 * matching the previous `?? "—"` render behaviour.
 */
export function formatUptime(pct: number | null): string {
  if (pct === null || !isFinite(pct)) return "—";
  return (Math.floor(pct * 100) / 100).toFixed(2);
}

export function fmtAge(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) return `${diffSec}с назад`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  const d = Math.floor(h / 24);
  return `${d}д назад`;
}

/** A monitor is "stale" when its last check is suspiciously old (>5 min). */
export function isStale(iso: string | null, nowMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return nowMs - t > 5 * 60 * 1000;
}
