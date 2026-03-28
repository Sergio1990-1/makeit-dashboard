import type { ProjectData, Priority, Monitor, MonitorStatus } from "../types";
import { calcRiskScore } from "../utils/riskScore";
import { CommitHeatmap } from "./CommitHeatmap";

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

const PRIORITY_COLORS: Record<Priority, string> = {
  P1: "#e03e36",
  P2: "#db6d28",
  P3: "#c9a227",
  P4: "#3fb950",
};

const PHASE_LABELS: Record<string, string> = {
  "pre-dev": "предразработка",
  development: "разработка",
  support: "поддержка",
};

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function ProjectCard({ project, monitor }: Props) {
  const hasFinances = project.budget > 0;
  const paymentProgress = hasFinances ? Math.round((project.paid / project.budget) * 100) : 0;
  const isStale = project.daysSinceActivity !== null && project.daysSinceActivity >= 2 && project.openCount > 0;
  const risk = calcRiskScore(project, monitor);

  return (
    <div className={`project-card ${isStale ? "project-stale" : ""}`}>
      <div className="project-row-top">
        <div className="project-left">
          <h3 className="project-name">{project.repo}</h3>
          <span className={`phase-badge phase-${project.phase}`}>
            {PHASE_LABELS[project.phase]}
          </span>
        </div>
        <div className="project-right-info">
          {monitor && (
            <span className={`monitor-badge monitor-badge--${monitor.status}`}>
              <span className={`monitor-status-dot monitor-status-dot--${monitor.status}`} />
              {STATUS_LABEL[monitor.status]}
            </span>
          )}
          <span className={`risk-badge risk-badge--${risk.level}`} title={`Риск: ${risk.score}/100`}>
            {risk.label} {risk.score}
          </span>
          <span className="project-client">клиент: {project.client}</span>
          {project.daysSinceActivity !== null && project.daysSinceActivity > 0 && (
            <span className={`activity-badge ${isStale ? "stale" : ""}`}>
              {project.daysSinceActivity}д без движения
            </span>
          )}
        </div>
      </div>

      <div className="project-row-priorities">
        <span className="total-count">Total: {project.openCount}</span>
        {(["P1", "P2", "P3"] as Priority[]).map((p) => (
          <span key={p} className="priority-dot-item">
            <span className="priority-dot" style={{ background: PRIORITY_COLORS[p] }} />
            {p}: {project.priorityCounts[p]}
          </span>
        ))}
        {(() => {
          const labeled = project.priorityCounts.P1 + project.priorityCounts.P2 + project.priorityCounts.P3 + project.priorityCounts.P4;
          const noLabel = project.openCount - labeled;
          return noLabel > 0 ? (
            <span className="priority-dot-item no-priority">
              <span className="priority-dot" style={{ background: "#8b949e" }} />
              ?: {noLabel}
            </span>
          ) : null;
        })()}
        <span className="done-count">Done: {project.doneCount}</span>
      </div>

      {project.doneCount > 0 && (
        <div className="project-progress-row">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${project.progress}%` }} />
          </div>
          <span className="project-progress-pct">{project.progress}%</span>
        </div>
      )}

      {hasFinances && (
        <div className="project-finance">
          <div className="finance-amounts">
            <span className="finance-paid">{formatUSD(project.paid)}</span>
            <span className="finance-sep"> / </span>
            <span className="finance-budget">{formatUSD(project.budget)}</span>
            {project.remaining > 0 && (
              <span className="finance-remaining">остаток {formatUSD(project.remaining)}</span>
            )}
          </div>
          <div className="progress-bar-container finance-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${paymentProgress}%`,
                background: paymentProgress >= 100 ? "#3fb950" : "#58a6ff",
              }}
            />
          </div>
        </div>
      )}

      {project.openCount > 0 && (
        <div className="project-velocity">
          <span className="velocity-label">
            Скорость: {project.velocity7d > 0 ? `${project.velocity7d.toFixed(1)}/день` : "нет данных"}
          </span>
          {project.cycleTimeDays !== null && (
            <span className="cycle-time" title="Медиана времени закрытия issue (последние 28 дней)">
              ⏱ цикл: {project.cycleTimeDays < 1
                ? `${Math.round(project.cycleTimeDays * 24)}ч`
                : `${Math.round(project.cycleTimeDays)}д`}
            </span>
          )}
          {project.etaDate && (
            <span className={`velocity-eta ${project.etaDays && project.etaDays > 60 ? "eta-danger" : project.etaDays && project.etaDays > 30 ? "eta-warning" : "eta-ok"}`}>
              Прогноз: {new Date(project.etaDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              {project.etaDays && <span className="eta-days"> (~{project.etaDays}д)</span>}
            </span>
          )}
        </div>
      )}

      <CommitHeatmap activity={project.commitActivity} />

      {project.description && (
        <p className="project-focus">{project.description}</p>
      )}
    </div>
  );
}
