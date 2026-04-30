import type { ProjectData, Monitor, MonitorStatus } from "../../types";
import { calcRiskScore } from "../../utils/riskScore";
import { GITHUB_OWNER } from "../../utils/config";

interface Props {
  project: ProjectData;
  monitor?: Monitor;
}

const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "alive",
  down: "down",
  paused: "paused",
  pending: "pending",
};

const PHASE_CHIP: Record<string, { cls: string; icon: string; label: string }> = {
  development: { cls: "v4-chip--dev", icon: "▶", label: "dev" },
  support: { cls: "v4-chip--support", icon: "⏸", label: "support" },
  "pre-dev": { cls: "v4-chip--predev", icon: "◻", label: "pre-dev" },
};

function compactUSD(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k.toFixed(k % 1 === 0 ? 0 : 1).replace(".", ",")}k`;
  }
  return `$${n}`;
}

function formatNumber1d(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

function buildRepoUrl(repo: string): string {
  // `repo` may already be `owner/name` or just `name`. Encode each segment
  // separately so any unusual chars don't break the URL.
  if (repo.includes("/")) {
    const [owner, name] = repo.split("/", 2);
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }
  return `https://github.com/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(repo)}`;
}

function formatEta(etaDays: number | null, etaDate: string | null): { label: string; sub?: string; danger?: boolean } {
  if (etaDays === null) return { label: "—" };
  if (etaDays > 365) return { label: "∞", sub: "нет ETA" };
  const target = etaDate ? new Date(etaDate) : new Date(Date.now() + etaDays * 86400000);
  const label = target.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (etaDays < 0) return { label, sub: `(+${Math.abs(etaDays)}д)`, danger: true };
  return { label };
}

export function DashboardProjectCard({ project, monitor }: Props) {
  const risk = calcRiskScore(project, monitor);
  // Mockup uses 2 visible levels: med/high. Map: critical→high, high→high, medium→med, low→none.
  const riskClass =
    risk.level === "critical" || risk.level === "high"
      ? "is-risk-high"
      : risk.level === "medium"
      ? "is-risk-med"
      : "";

  const phase = PHASE_CHIP[project.phase] ?? PHASE_CHIP["pre-dev"];

  const total = project.totalCount;
  const done = project.doneCount;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fillColor =
    pct >= 75
      ? "var(--v4-success-500)"
      : pct >= 40
      ? "var(--v4-accent-500)"
      : "var(--v4-warn-500)";

  const hasFinances = project.budget > 0;
  const paid = project.paid;
  const remaining = Math.max(0, project.budget - paid);
  const fullyPaid = hasFinances && paid >= project.budget;

  const eta = formatEta(project.etaDays, project.etaDate);

  return (
    <div className={`v4-pcard ${riskClass}`}>
      <div className="v4-pcard-row">
        <a className="v4-pcard-name" href={buildRepoUrl(project.repo)} target="_blank" rel="noopener noreferrer">
          {project.repo}
        </a>
        <div className="v4-pcard-badges">
          {monitor && monitor.status !== "paused" && (
            <span className={`v4-chip v4-chip--${monitor.status === "up" ? "alive" : monitor.status === "down" ? "down" : "paused"}`}>
              <span className="v4-chip-dot" />
              {STATUS_LABEL[monitor.status]}
            </span>
          )}
          <span className={`v4-chip ${phase.cls}`}>
            {phase.icon} {phase.label}
          </span>
        </div>
      </div>

      <div className="v4-pcard-open-row">
        <div className="v4-pcard-open-num num">
          {project.openCount}
          <span>открытых</span>
        </div>
        <div className="v4-pcard-pri-group">
          {project.priorityCounts.P1 > 0 && (
            <span className="v4-pcard-pri">
              <span className="v4-pdot v4-pdot--p1" />
              {project.priorityCounts.P1}
            </span>
          )}
          {project.priorityCounts.P2 > 0 && (
            <span className="v4-pcard-pri">
              <span className="v4-pdot v4-pdot--p2" />
              {project.priorityCounts.P2}
            </span>
          )}
          {project.priorityCounts.P3 > 0 && (
            <span className="v4-pcard-pri">
              <span className="v4-pdot v4-pdot--p3" />
              {project.priorityCounts.P3}
            </span>
          )}
          {project.priorityCounts.P4 > 0 && (
            <span className="v4-pcard-pri">
              <span className="v4-pdot v4-pdot--p4" />
              {project.priorityCounts.P4}
            </span>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="v4-pcard-progress">
          <div className="v4-ptrack">
            <div className="v4-pfill" style={{ width: `${pct}%`, background: fillColor }} />
          </div>
          <span className="v4-ppct num">
            {done}/{total} ({pct}%)
          </span>
        </div>
      )}

      {hasFinances && (
        <div className="v4-pcard-finance">
          <span className="v4-pcard-finance-l">
            <b>{compactUSD(paid)}</b> / {compactUSD(project.budget)}
          </span>
          <span className={`v4-pcard-finance-r ${fullyPaid ? "" : "v4-pcard-finance-r--warn"}`}>
            {fullyPaid ? "оплачен ✓" : `остаток ${compactUSD(remaining)}`}
          </span>
        </div>
      )}

      <div className="v4-pcard-stats">
        <span className="v4-pcard-stat" title="Velocity (issues/день за 7 дней)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <b>{formatNumber1d(project.velocity7d)}</b>/д
        </span>
        {project.cycleTimeDays !== null && (
          <span className="v4-pcard-stat" title="Медиана цикла закрытия (28 дней)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <b>{formatNumber1d(project.cycleTimeDays)}</b>д
          </span>
        )}
        {project.etaDays !== null && (
          <span
            className={`v4-pcard-stat ${eta.danger ? "v4-pcard-stat--danger" : ""}`}
            title="Прогноз даты завершения"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="5" />
            </svg>
            <b>{eta.label}</b>
            {eta.sub && <> {eta.sub}</>}
          </span>
        )}
      </div>
    </div>
  );
}
