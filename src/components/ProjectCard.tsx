import { useState } from "react";
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
  P1: "var(--color-p1)",
  P2: "var(--color-p2)",
  P3: "var(--color-p3)",
  P4: "var(--color-p4)",
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
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const hasFinances = project.budget > 0;
  const paymentProgress = hasFinances ? Math.round((project.paid / project.budget) * 100) : 0;
  const isStale = project.daysSinceActivity !== null && project.daysSinceActivity >= 2 && project.openCount > 0;
  const risk = calcRiskScore(project, monitor);

  return (
    <div className={`pc pc--phase-${project.phase} ${isStale ? "pc--stale" : ""} ${risk.level !== "low" ? `pc--risk-${risk.level}` : ""}`}>
      {/* Row 1: Header */}
      <div className="pc-header">
        <div className="pc-name-row">
          <h3 className="pc-name">{project.repo}</h3>
          <span className={`pc-phase pc-phase--${project.phase}`}>
            {PHASE_LABELS[project.phase]}
          </span>
        </div>
        <div className="pc-badges">
          {monitor && (
            <span className={`pc-monitor pc-monitor--${monitor.status}`}>
              <span className={`pc-monitor-dot pc-monitor-dot--${monitor.status}`} />
              {STATUS_LABEL[monitor.status]}
            </span>
          )}
          <span className={`pc-risk pc-risk--${risk.level}`}>
            Риск: {risk.label.toLowerCase()}
          </span>
        </div>
      </div>

      {/* Row 2: Issues & Progress Group - STAYS ALIGNED */}
      <div className="pc-slot pc-slot--issues">
        <div className="pc-priorities">
          <span className="pc-total">{project.openCount} <span className="pc-total-label">открытых</span></span>
          <div className="pc-pri-group">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((p) => (
              <span key={p} className="pc-pri">
                <span className="pc-pri-dot" style={{ background: PRIORITY_COLORS[p] }} />
                {project.priorityCounts[p]}
              </span>
            ))}
            {(() => {
              const labeled = project.priorityCounts.P1 + project.priorityCounts.P2 + project.priorityCounts.P3 + project.priorityCounts.P4;
              // Count open board issues (not GitHub total) for accurate "no priority" count
              const boardOpen = project.issues.filter((i) => i.status !== "Done").length;
              const noLabel = boardOpen - labeled;
              return noLabel > 0 ? (
                <span className="pc-pri pc-pri--none">? {noLabel}</span>
              ) : null;
            })()}
          </div>
        </div>
        {project.doneCount > 0 ? (
          <div className="pc-progress">
            <div className="pc-bar">
              <div className="pc-bar-fill" style={{ width: `${project.progress}%` }} />
            </div>
            <span className="pc-pct">{project.progress}%</span>
          </div>
        ) : <div className="pc-progress-placeholder" />}
      </div>

      {/* Row 3: Finance Group - STAYS ALIGNED */}
      <div className="pc-slot pc-slot--finance-group">
        {hasFinances ? (
          <div className="pc-finance">
            <div className="pc-finance-row">
              <span className="pc-finance-group">
                <span className="pc-finance-label">Бюджет</span>
                <span className="pc-finance-paid">{formatUSD(project.paid)}</span>
                <span className="pc-finance-sep">/</span>
                <span className="pc-finance-total">{formatUSD(project.budget)}</span>
              </span>
              {project.remaining > 0 && (
                <span className="pc-finance-group">
                  <span className="pc-finance-label">Остаток</span>
                  <span className="pc-finance-remaining">{formatUSD(project.remaining)}</span>
                </span>
              )}
            </div>
            <div className="pc-finance-bar">
              <div
                className="pc-finance-fill"
                style={{
                  width: `${paymentProgress}%`,
                  background: paymentProgress >= 100 ? "var(--color-success)" : "var(--color-primary)",
                }}
              />
            </div>
          </div>
        ) : <div className="pc-finance-placeholder" />}
      </div>

      {/* Row 4: Stats - STAYS ALIGNED */}
      <div className="pc-slot pc-slot--stats-group">
        {(project.openCount > 0 && (project.velocity7d > 0 || project.cycleTimeDays !== null || project.etaDate)) ? (
          <div className="pc-stats" style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
            {project.velocity7d > 0 && (
              <div className="pc-stat" title="Скорость закрытия задач">
                <span className="pc-stat-label">⚡️</span>
                <span className="pc-stat-value">{project.velocity7d.toFixed(1)}<span className="pc-stat-days">/д</span></span>
              </div>
            )}
            {project.cycleTimeDays !== null && (
              <div className="pc-stat" title="Среднее время цикла">
                <span className="pc-stat-label">⏱️</span>
                <span className="pc-stat-value">
                  {project.cycleTimeDays < 1
                    ? `${Math.round(project.cycleTimeDays * 24)}ч`
                    : `${Math.round(project.cycleTimeDays)}д`}
                </span>
              </div>
            )}
            {project.etaDate && (() => {
              const etaClass = project.etaDays && project.etaDays > 60 ? "danger" : project.etaDays && project.etaDays > 30 ? "warn" : "eta";
              return (
                <div className="pc-stat pc-stat--eta" title="Прогноз завершения">
                  <span className="pc-stat-label">🎯</span>
                  <span className={`pc-stat-value pc-stat-value--${etaClass}`}>
                    {new Date(project.etaDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    {project.etaDays && <span className={`pc-stat-days ${project.etaDays > 0 ? "val-danger" : "val-success"}`}> ({project.etaDays > 0 ? "+" : ""}{project.etaDays}д)</span>}
                  </span>
                </div>
              );
            })()}
          </div>
        ) : <div className="pc-stats-placeholder" />}
      </div>

      {/* Row 5: Risk Factors */}
      <div className="pc-slot pc-slot--risks">
        {risk.level !== "low" && risk.factors.length > 0 ? (
          <div className="pc-risk-factors">
            {risk.factors.map((f, i) => (
              <span key={i} className={`risk-factor risk-factor--${risk.level}`}>
                {f.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Row 7: Footer */}
      <div className="pc-slot pc-slot--last">
        <button
          className="pc-heatmap-toggle"
          onClick={() => setHeatmapOpen(!heatmapOpen)}
        >
          <span className={`pc-heatmap-arrow ${heatmapOpen ? "open" : ""}`}>&#9654;</span>
          <span>Коммиты</span>
          <span className="pc-heatmap-count">{project.commitActivity.thisWeek} за 7д</span>
        </button>
        {heatmapOpen && <CommitHeatmap activity={project.commitActivity} />}
      </div>
    </div>
  );
}
