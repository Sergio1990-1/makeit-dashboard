import { useMemo, useState } from "react";
import type { ProjectData, SummaryMetrics, Issue, Monitor } from "../../types";
import { KpiRow } from "./KpiRow";
import { DashboardProjectCard } from "./DashboardProjectCard";
import { AIInsightsPanel } from "./AIInsightsPanel";
import { ProgressMatrix } from "./ProgressMatrix";
import { BlockedPanel } from "./BlockedPanel";
import { UrgentDeadlinesPanel } from "./UrgentDeadlinesPanel";
import { ClosedChart30d } from "./ClosedChart30d";
import { MilestonesStrip } from "./MilestonesStrip";
import { CommitsHeatmapPanel } from "./CommitsHeatmapPanel";
import { StaleBanner } from "./StaleBanner";
import { OrphanIssuesPanel } from "./OrphanIssuesPanel";
import type { usePortfolioHealth } from "../../hooks/usePortfolioHealth";
import type { usePortfolioOrphans } from "../../hooks/usePortfolioOrphans";
import { useFirstMountClass } from "../../hooks/useFirstMountClass";

interface Props {
  projects: ProjectData[];
  summary: SummaryMetrics;
  blockedIssues: Issue[];
  getMonitor: (repo: string) => Monitor | undefined;
  lastUpdated: Date | null;
  /** Switch to "projects" tab */
  onSeeAllProjects: () => void;
  onFinanceClick?: () => void;
  /**
   * Open the Project Health drilldown for a given repo.
   * Implemented in App.tsx as `setHealthRepo(repo); setTab("projects")`,
   * bypassing `navigateTab` (which would clear `healthRepo`).
   */
  onOpenHealth: (repo: string) => void;
  /**
   * Portfolio scans are mounted in App.tsx so the Topbar "Обновить" button
   * can trigger a rescan alongside useDashboard.refetch. Passing the hook
   * results down avoids a duplicate mount (and a duplicate health scan)
   * when other components also need this data.
   */
  portfolio: ReturnType<typeof usePortfolioHealth>;
  orphans: ReturnType<typeof usePortfolioOrphans>;
}

type PhaseFilter = "all" | "pre-dev" | "development" | "support";

const PHASE_LABELS: Record<PhaseFilter, string> = {
  all: "Все",
  "pre-dev": "Pre-dev",
  development: "Dev",
  support: "Support",
};

export function DashboardView({
  projects,
  summary,
  blockedIssues,
  getMonitor,
  lastUpdated,
  onSeeAllProjects,
  onFinanceClick,
  onOpenHealth,
  portfolio,
  orphans,
}: Props) {
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");

  // Portfolio health drives the AI-insights panel. The hook is mounted in
  // App.tsx so the Topbar refresh button can trigger a rescan alongside
  // useDashboard.refetch — passed down here as a prop.
  const portfolioLastUpdated = useMemo(
    () => (portfolio.lastUpdated ? new Date(portfolio.lastUpdated) : null),
    [portfolio.lastUpdated],
  );

  // Orphan-issues trend has its own hook (separate cache/refresh cadence
  // from health) so a slow health scan doesn't block the chart. Also
  // mounted in App.tsx for the same Topbar-refresh wiring.
  const orphansLastUpdated = useMemo(
    () => (orphans.lastUpdated ? new Date(orphans.lastUpdated) : null),
    [orphans.lastUpdated],
  );

  const filtered = useMemo(
    () =>
      phaseFilter === "all"
        ? projects
        : projects.filter((p) => p.phase === phaseFilter),
    [projects, phaseFilter]
  );

  const allMilestones = useMemo(
    () => projects.flatMap((p) => p.milestones),
    [projects]
  );

  // Top-4 active by recent closed activity (last 3 days). Uses lastUpdated as
  // the time anchor so sorting is stable until the data refreshes — avoids
  // calling Date.now() inside useMemo (react-hooks/purity).
  // 4 cards (2×2) — matches the height anchor for the AI insights panel.
  const topProjects = useMemo(() => {
    const anchor = lastUpdated ? lastUpdated.getTime() : 0;
    const cutoff = anchor > 0 ? anchor - 3 * 24 * 60 * 60 * 1000 : 0;
    return [...filtered]
      .sort((a, b) => {
        const recentA = cutoff
          ? a.issues.filter((i) => i.closedAt && new Date(i.closedAt).getTime() > cutoff).length
          : 0;
        const recentB = cutoff
          ? b.issues.filter((i) => i.closedAt && new Date(i.closedAt).getTime() > cutoff).length
          : 0;
        if (recentB !== recentA) return recentB - recentA;
        return b.openCount - a.openCount;
      })
      .slice(0, 4);
  }, [filtered, lastUpdated]);

  const subText = useMemo(() => {
    const parts = [`${filtered.length} активных проектов`];
    if (lastUpdated) {
      parts.push(`обновлено ${lastUpdated.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`);
    }
    return parts.join(" · ");
  }, [filtered.length, lastUpdated]);

  const noEntranceClass = useFirstMountClass("dashboard");

  return (
    <div className={`v4-content${noEntranceClass ? ` ${noEntranceClass}` : ""}`}>
      <div className="v4-ph">
        <div>
          <h1>MakeIT · сводка по проектам</h1>
          <div className="v4-sub">{subText}</div>
        </div>
        <div className="v4-ph-right">
          <div className="v4-pillgrp">
            {(Object.keys(PHASE_LABELS) as PhaseFilter[]).map((p) => (
              <button
                key={p}
                type="button"
                className={phaseFilter === p ? "is-active" : ""}
                onClick={() => setPhaseFilter(p)}
              >
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>
          <button type="button" className="v4-btn" onClick={onFinanceClick} title="Редактировать финансы">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Финансы
          </button>
          <button type="button" className="v4-btn v4-btn--pri" onClick={onSeeAllProjects}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h18M3 12h18M3 17h18" />
            </svg>
            Все проекты
          </button>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <KpiRow projects={filtered} summary={summary} onFinanceClick={onFinanceClick} />

      {/* Row: top-4 projects (2×2) + AI insights */}
      <div className="v4-grid">
        <div className="v4-panel">
          <div className="v4-panel-h">
            <div className="v4-panel-t">
              Активные проекты <span className="v4-tag">{filtered.length} репо</span>
            </div>
            <button className="v4-linkbtn" onClick={onSeeAllProjects}>
              Все проекты →
            </button>
          </div>
          {topProjects.length === 0 ? (
            <div className="v4-empty">Нет проектов в текущем фильтре</div>
          ) : (
            <div className="v4-proj-grid">
              {topProjects.map((p, i) => (
                <DashboardProjectCard
                  key={p.repo}
                  project={p}
                  monitor={getMonitor(p.repo)}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>

        <AIInsightsPanel
          reports={portfolio.reports}
          loading={portfolio.loading}
          lastUpdated={portfolioLastUpdated}
          onOpenHealth={onOpenHealth}
          error={portfolio.error}
        />
      </div>

      {/* Row: stacked + blocked */}
      <div className="v4-grid">
        <ProgressMatrix projects={filtered} />
        <BlockedPanel issues={blockedIssues} />
      </div>

      {/* Row: deadlines + closed chart */}
      <div className="v4-grid v4-grid--rev">
        <UrgentDeadlinesPanel milestones={allMilestones} lastUpdated={lastUpdated} />
        <ClosedChart30d projects={filtered} />
      </div>

      {/* Row: nearest milestones (2×2 cards) + issues-without-milestone trend */}
      <div className="v4-grid">
        <MilestonesStrip milestones={allMilestones} lastUpdated={lastUpdated} />
        <OrphanIssuesPanel
          items={orphans.items}
          loading={orphans.loading}
          lastUpdated={orphansLastUpdated}
          error={orphans.error}
        />
      </div>

      <CommitsHeatmapPanel projects={filtered} lastUpdated={lastUpdated} />

      <StaleBanner projects={filtered} onOpenList={onSeeAllProjects} />
    </div>
  );
}
