import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectData, Priority, Monitor, MonitorStatus } from "../../types";
import { calcRiskScore } from "../../utils/riskScore";
import { GITHUB_OWNER } from "../../utils/config";
import { getLastNDays } from "../../utils/dashboardMetrics";
import { BudgetWidget } from "./BudgetWidget";

interface Props {
  project: ProjectData;
  monitor?: Monitor;
  onJumpToTab?: (tab: "pipeline" | "audit") => void;
  onEditFinance?: () => void;
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
  if (repo.includes("/")) {
    const [owner, name] = repo.split("/", 2);
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }
  return `https://github.com/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(repo)}`;
}

function bucket(count: number): string | undefined {
  if (count === 0) return undefined;
  if (count === 1) return "1";
  if (count <= 3) return "2";
  if (count <= 6) return "3";
  return "4";
}

const PRIORITY_DOT_CLASS: Record<Priority, string> = {
  P1: "v4-pdot--p1",
  P2: "v4-pdot--p2",
  P3: "v4-pdot--p3",
  P4: "v4-pdot--p4",
};

export function ProjectCardV4({ project, monitor, onJumpToTab, onEditFinance }: Props) {
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const risk = calcRiskScore(project, monitor);
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
  const progressColor =
    pct >= 75
      ? "var(--v4-success-500)"
      : pct >= 40
      ? "var(--v4-accent-500)"
      : "var(--v4-warn-500)";

  const hasFinances = project.budget > 0;
  // Cap visual width at 100% — paid can exceed budget (edge case) and would
  // otherwise overflow the bar track.
  const paymentPct = hasFinances
    ? Math.min(100, Math.round((project.paid / project.budget) * 100))
    : 0;
  const fullyPaid = hasFinances && project.paid >= project.budget;

  // Count of open board issues without any P1-P4 label
  const labeled =
    project.priorityCounts.P1 +
    project.priorityCounts.P2 +
    project.priorityCounts.P3 +
    project.priorityCounts.P4;
  const boardOpen = project.issues.filter((i) => i.status !== "Done").length;
  const noLabel = Math.max(0, boardOpen - labeled);

  const showStats =
    project.openCount > 0 &&
    (project.velocity7d > 0 ||
      project.cycleTimeDays !== null ||
      !!project.etaDate);

  const showRisks = risk.level !== "low" && risk.factors.length > 0;

  // 28-day heatmap cells. Memoised so getLastNDays() (impure — calls
  // new Date()) only runs on toggle, not on every render. The Projects tab
  // re-mounts on navigation so the date window can't go stale within a tab
  // session.
  const heatCells = useMemo(() => {
    if (!heatmapOpen) return [];
    return getLastNDays(28).map((d) => ({
      d,
      count: project.commitActivity?.byDate?.[d] ?? 0,
    }));
  }, [heatmapOpen, project.commitActivity?.byDate]);

  return (
    <div className={`v4-pcard v4-pcard--full ${riskClass}`}>
      {/* Section: header */}
      <div className="v4-pcard-row">
        <div className="v4-pcard-name-wrap">
          <a
            className="v4-pcard-name"
            href={buildRepoUrl(project.repo)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {project.repo}
          </a>
          {project.client && (
            <span className="v4-pcard-client">{project.client}</span>
          )}
        </div>
        <div className="v4-pcard-badges">
          {monitor && monitor.status !== "paused" && (
            <span
              className={`v4-chip v4-chip--${
                monitor.status === "up"
                  ? "alive"
                  : monitor.status === "down"
                  ? "down"
                  : "paused"
              }`}
            >
              <span className="v4-chip-dot" />
              {STATUS_LABEL[monitor.status]}
            </span>
          )}
          <span className={`v4-chip ${phase.cls}`}>
            {phase.icon} {phase.label}
          </span>
          <span
            className={`v4-pcard-risk-chip v4-pcard-risk-chip--${risk.level}`}
            title={`Score: ${risk.score}/100`}
          >
            риск: {risk.label.toLowerCase()}
          </span>
          <div className="v4-pcard-menu" ref={menuRef}>
            <button
              type="button"
              className="v4-pcard-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Действия с проектом"
              title="Действия"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <div className="v4-pcard-menu-list" role="menu">
                <a
                  href={buildRepoUrl(project.repo)}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  Открыть в GitHub ↗
                </a>
                {onJumpToTab && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onJumpToTab("pipeline");
                      setMenuOpen(false);
                    }}
                  >
                    Открыть Pipeline →
                  </button>
                )}
                {onJumpToTab && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onJumpToTab("audit");
                      setMenuOpen(false);
                    }}
                  >
                    Открыть Аудит →
                  </button>
                )}
                {onEditFinance && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onEditFinance();
                      setMenuOpen(false);
                    }}
                  >
                    Редактировать финансы…
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section: issues + progress */}
      <div className="v4-pcard-section">
        <div className="v4-pcard-open-row">
          <div className="v4-pcard-open-num num">
            {project.openCount}
            <span>открытых</span>
          </div>
          <div className="v4-pcard-pri-group">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((p) =>
              project.priorityCounts[p] > 0 ? (
                <span key={p} className="v4-pcard-pri">
                  <span className={`v4-pdot ${PRIORITY_DOT_CLASS[p]}`} />
                  {project.priorityCounts[p]}
                </span>
              ) : null
            )}
            {noLabel > 0 && (
              <span
                className="v4-pcard-pri v4-pcard-pri--unlabeled"
                title="Без приоритета"
              >
                ? {noLabel}
              </span>
            )}
          </div>
        </div>
        {total > 0 && (
          <div className="v4-pcard-progress">
            <div className="v4-ptrack">
              <div
                className="v4-pfill"
                style={{ width: `${pct}%`, background: progressColor }}
              />
            </div>
            <span className="v4-ppct num">
              {done}/{total} ({pct}%)
            </span>
          </div>
        )}
      </div>

      {/* Section: finance */}
      {hasFinances && (
        <div className="v4-pcard-section">
          <div className="v4-pcard-finance-line">
            <span>
              <b className="num">{compactUSD(project.paid)}</b>
              <span className="v4-pcard-finance-sep"> / </span>
              <span className="num">{compactUSD(project.budget)}</span>
            </span>
            <span
              className={`v4-pcard-finance-r ${
                fullyPaid ? "" : "v4-pcard-finance-r--warn"
              }`}
            >
              {fullyPaid
                ? "оплачен ✓"
                : `остаток ${compactUSD(project.remaining)}`}
            </span>
          </div>
          <div className="v4-ptrack v4-pcard-finance-bar">
            <div
              className="v4-pfill"
              style={{
                width: `${paymentPct}%`,
                background: fullyPaid
                  ? "var(--v4-success-500)"
                  : "var(--v4-accent-500)",
              }}
            />
          </div>
        </div>
      )}

      {/* Section: monthly LLM budget (epic-035 Task-06).
          Self-renders nothing when the pipeline doesn't know the project
          or the cap is not configured (after first response).  Keeps the
          card layout calm during outages. */}
      {project.repo.includes("/") && (
        <div className="v4-pcard-section">
          <BudgetWidget project={project.repo} />
        </div>
      )}

      {/* Section: stats */}
      {showStats && (
        <div className="v4-pcard-section v4-pcard-stats">
          {project.velocity7d > 0 && (() => {
            // Trend: 7d vs 14d. >5% delta is meaningful, otherwise neutral.
            const v7 = project.velocity7d;
            const v14 = project.velocity14d;
            let trend: "up" | "down" | "flat" = "flat";
            if (v14 > 0) {
              const change = (v7 - v14) / v14;
              if (change > 0.05) trend = "up";
              else if (change < -0.05) trend = "down";
            }
            return (
              <span
                className="v4-pcard-stat"
                title={`Velocity 7д vs 14д (${formatNumber1d(v14)}/д)`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <b>{formatNumber1d(v7)}</b>/д
                {trend !== "flat" && (
                  <span
                    className={`v4-trend v4-trend--${trend}`}
                    aria-hidden="true"
                  >
                    {trend === "up" ? "↗" : "↘"}
                  </span>
                )}
              </span>
            );
          })()}
          {project.cycleTimeDays !== null && (
            <span
              className="v4-pcard-stat"
              title="Медиана времени закрытия issue (последние 28 дней)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <b>
                {project.cycleTimeDays < 1
                  ? `${Math.round(project.cycleTimeDays * 24)}ч`
                  : `${formatNumber1d(project.cycleTimeDays)}д`}
              </b>
            </span>
          )}
          {project.etaDate && (() => {
            // ETA semantics: `etaDays` is "days UNTIL completion" (positive
            // = future, see types/index.ts). Treat far-out forecasts as a
            // schedule risk — matches legacy thresholds (>60 = danger,
            // >30 = warn). Soon-completion = neutral/good.
            const d = project.etaDays;
            const danger = d !== null && d > 60;
            const warn = d !== null && d > 30 && d <= 60;
            const target = new Date(project.etaDate).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "short",
            });
            return (
              <span
                className={`v4-pcard-stat ${
                  danger ? "v4-pcard-stat--danger" : warn ? "v4-pcard-stat--warn" : ""
                }`}
                title="Прогноз даты завершения"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="5" />
                </svg>
                <b>{target}</b>
                {d !== null && d !== 0 && (
                  <>
                    {" "}
                    ({d > 0 ? "+" : ""}
                    {d}д)
                  </>
                )}
              </span>
            );
          })()}
          {project.daysSinceActivity !== null &&
            project.daysSinceActivity >= 2 &&
            project.openCount > 0 && (
              <span
                className="v4-pcard-stat v4-pcard-stat--danger"
                title="Дней с последней активности"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                stale <b>{project.daysSinceActivity}д</b>
              </span>
            )}
        </div>
      )}

      {/* Section: risk factors */}
      {showRisks && (
        <div className="v4-pcard-section v4-pcard-risk-factors">
          {risk.factors.map((f, i) => (
            <span
              key={i}
              className={`v4-risk-factor v4-risk-factor--${risk.level}`}
            >
              {f.text}
            </span>
          ))}
        </div>
      )}

      {/* Section: heatmap toggle */}
      <div className="v4-pcard-section v4-pcard-heat">
        <button
          type="button"
          className="v4-pcard-heat-toggle"
          onClick={() => setHeatmapOpen((v) => !v)}
          aria-expanded={heatmapOpen}
        >
          <span className={`v4-pcard-heat-arrow ${heatmapOpen ? "is-open" : ""}`}>
            ▸
          </span>
          <span>Коммиты</span>
          <span className="v4-pcard-heat-meta">
            {project.commitActivity?.thisWeek ?? 0} за 7д ·{" "}
            {project.commitActivity?.thisMonth ?? 0} за 30д
          </span>
        </button>
        {heatmapOpen && (
          <div className="v4-pcard-heat-grid">
            {heatCells.map(({ d, count }) => (
              <div
                key={d}
                className="v4-cc"
                data-v={bucket(count)}
                title={`${d}: ${count} коммит${
                  count === 1 ? "" : count >= 2 && count <= 4 ? "а" : "ов"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
