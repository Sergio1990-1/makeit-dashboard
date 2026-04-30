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
  return "ok";
}

export function uptimeColor(pct: number | null): string {
  if (pct === null) return "var(--v4-ink-400)";
  if (pct >= 99.9) return "var(--v4-success-700)";
  if (pct >= 99) return "var(--v4-success-500)";
  if (pct >= 95) return "var(--v4-warn-700)";
  return "var(--v4-danger-700)";
}

/** Reverse-lookup project repo for a monitor via MONITOR_MATCH keywords. */
export function getProjectName(monitor: Monitor): string | null {
  const name = monitor.name.toLowerCase();
  const url = monitor.url.toLowerCase();
  for (const [project, keywords] of Object.entries(MONITOR_MATCH)) {
    if (keywords.some((kw) => name.includes(kw.toLowerCase()) || url.includes(kw.toLowerCase()))) {
      return project;
    }
  }
  return null;
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
