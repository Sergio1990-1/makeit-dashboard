import type {
  AuditProjectStatus,
  AuditRunStatus,
  AuditVerificationSummary,
} from "../../../types";

export type Severity = "critical" | "high" | "medium" | "low";
export type AuditHealth = "ok" | "warn" | "danger" | "unknown";

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--mk-danger)",
  high: "var(--mk-warn)",
  medium: "var(--mk-brand-500)",
  low: "var(--mk-ink-400)",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Критические",
  high: "Высокие",
  medium: "Средние",
  low: "Низкие",
};

/** True if the audit hasn't been run for >14 days. */
export const STALE_DAYS = 14;
export function isAuditStale(timestamp: string | null | undefined, nowMs: number): boolean {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (isNaN(t)) return false;
  return nowMs - t > STALE_DAYS * 24 * 60 * 60 * 1000;
}

/** Verification verdict counts derived from a verification summary. */
export function verifiedConfirmed(v: AuditVerificationSummary | null): number {
  if (!v) return 0;
  return v.confirmed;
}

/** Project-level health: critical → danger, high → warn, else ok. */
export function projectHealth(p: AuditProjectStatus): AuditHealth {
  const lr = p.last_run;
  if (!lr) return "unknown";
  if (lr.severity_counts.critical > 0) return "danger";
  if (lr.severity_counts.high > 0) return "warn";
  return "ok";
}

/** Worst-of-all health across the portfolio. */
export function poolHealth(projects: AuditProjectStatus[]): AuditHealth {
  if (projects.length === 0) return "unknown";
  const audited = projects.filter((p) => p.last_run);
  if (audited.length === 0) return "unknown";
  if (audited.some((p) => (p.last_run?.severity_counts.critical ?? 0) > 0)) return "danger";
  if (audited.some((p) => (p.last_run?.severity_counts.high ?? 0) > 0)) return "warn";
  return "ok";
}

export function totalFindingsBySeverity(
  projects: AuditProjectStatus[],
): Record<Severity, number> {
  const acc: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const p of projects) {
    if (!p.last_run) continue;
    acc.critical += p.last_run.severity_counts.critical;
    acc.high += p.last_run.severity_counts.high;
    acc.medium += p.last_run.severity_counts.medium;
    acc.low += p.last_run.severity_counts.low;
  }
  return acc;
}

export function totalCost(projects: AuditProjectStatus[]): number {
  return projects.reduce((s, p) => s + (p.last_run?.cost_usd ?? 0), 0);
}

export function avgDurationSec(projects: AuditProjectStatus[]): number | null {
  const audited = projects.filter((p) => p.last_run);
  if (audited.length === 0) return null;
  const sum = audited.reduce((s, p) => s + (p.last_run?.duration_seconds ?? 0), 0);
  return sum / audited.length;
}

export function fmtCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

export function fmtDuration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}м`;
  return `${(seconds / 3600).toFixed(1)}ч`;
}

export function fmtAge(iso: string | null | undefined, nowMs: number): string {
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
  if (d < 7) return `${d}д назад`;
  if (d < 30) return `${Math.floor(d / 7)} нед назад`;
  return `${Math.floor(d / 30)} мес назад`;
}

export type RunningState = AuditRunStatus["state"];

export function isRunningState(s: RunningState | undefined): boolean {
  return s === "running";
}

/** Filter set used by the project filter pills. */
export type AuditFilter = "all" | "critical" | "needsVerify" | "verified" | "notAudited" | "stale";

export const AUDIT_FILTERS: Array<{ key: AuditFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "critical", label: "Критические" },
  { key: "needsVerify", label: "Нужна верификация" },
  { key: "stale", label: "Устаревшие" },
  { key: "notAudited", label: "Без аудита" },
  { key: "verified", label: "Верифицированы" },
];

export function applyFilter(
  projects: AuditProjectStatus[],
  filter: AuditFilter,
  nowMs: number,
): AuditProjectStatus[] {
  if (filter === "all") return projects;
  if (filter === "critical") return projects.filter((p) => (p.last_run?.severity_counts.critical ?? 0) > 0);
  if (filter === "needsVerify") return projects.filter((p) => p.last_run && !p.last_run.verification);
  if (filter === "verified") return projects.filter((p) => p.last_run?.verification);
  if (filter === "notAudited") return projects.filter((p) => !p.last_run);
  if (filter === "stale") return projects.filter((p) => isAuditStale(p.last_run?.timestamp, nowMs));
  return projects;
}

/** Sort: critical-first, then high count, then alphabetical. */
export function sortProjects(projects: AuditProjectStatus[]): AuditProjectStatus[] {
  const arr = [...projects];
  arr.sort((a, b) => {
    const ac = a.last_run?.severity_counts.critical ?? 0;
    const bc = b.last_run?.severity_counts.critical ?? 0;
    if (ac !== bc) return bc - ac;
    const ah = a.last_run?.severity_counts.high ?? 0;
    const bh = b.last_run?.severity_counts.high ?? 0;
    if (ah !== bh) return bh - ah;
    return a.name.localeCompare(b.name, "ru");
  });
  return arr;
}

export function applySearch(
  projects: AuditProjectStatus[],
  q: string,
): AuditProjectStatus[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return projects;
  return projects.filter((p) =>
    p.name.toLowerCase().includes(needle) ||
    p.repo.toLowerCase().includes(needle),
  );
}
