import { useEffect, useState } from "react";
import { TokenForm } from "./components/TokenForm";
import { Summary } from "./components/Summary";
import { ProjectCard } from "./components/ProjectCard";
import { BlockedItems } from "./components/BlockedItems";
import { StackedChart } from "./components/StackedChart";

import { MilestoneCard } from "./components/MilestoneCard";
import { UrgentDeadlines } from "./components/UrgentDeadlines";
import { StaleAlert } from "./components/StaleAlert";
import { ChatPanel } from "./components/ChatPanel";
import { ChatButton } from "./components/ChatButton";
import { FinanceEditor } from "./components/FinanceEditor";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UptimeBar } from "./components/UptimeBar";
import { ClosedChart } from "./components/ClosedChart";
import { AuditTab } from "./components/AuditTab";
import { PipelineControlPanel } from "./components/PipelineControlPanel";
import { useDashboard } from "./hooks/useDashboard";
import { useMonitors } from "./hooks/useMonitors";
import { getToken, clearToken, getAuth, clearAuth, clearClaudeKey, MONITOR_MATCH } from "./utils/config";
import { PasswordGate } from "./components/PasswordGate";
import type { TabId, Monitor } from "./types";
import "./App.css";

function AppInner() {
  const {
    projects,
    summary,
    blockedIssues,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useDashboard();

  const { monitors, loading: monitorsLoading, error: monitorsError, refresh: refreshMonitors } = useMonitors();

  const [tab, setTab] = useState<TabId>("dashboard");
  const [chatOpen, setChatOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);

  function getMonitorForRepo(repo: string): Monitor | undefined {
    const keywords = MONITOR_MATCH[repo];
    if (!keywords || monitors.length === 0) return undefined;
    return monitors.find((m) =>
      keywords.some(
        (kw) =>
          m.name.toLowerCase().includes(kw.toLowerCase()) ||
          m.url.toLowerCase().includes(kw.toLowerCase())
      )
    );
  }

  useEffect(() => {
    if (getToken()) refresh(false); // use cache on initial load
    refreshMonitors();
  }, [refresh, refreshMonitors]);

  const hasToken = !!getToken();

  const allMilestones = projects.flatMap((p) => p.milestones);
  // Milestone считается завершённым если GitHub закрыл его (CLOSED) ИЛИ все issues закрыты
  const isMilestoneDone = (m: { state: string; openIssues: number; closedIssues: number }) =>
    m.state === "CLOSED" || (m.openIssues === 0 && m.closedIssues > 0);
  const openMilestones = allMilestones.filter((m) => !isMilestoneDone(m));
  const doneMilestones = allMilestones.filter((m) => isMilestoneDone(m));

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-logo">M</div>
          <div className="header-title-group">
            <h1>MakeIT</h1>
            {lastUpdated && (
              <span className="last-updated">
                {lastUpdated.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {hasToken && projects.length > 0 && (
          <nav className="header-tabs">
            {([
              { id: "dashboard" as TabId, label: "Дашборд" },
              { id: "projects" as TabId, label: `Проекты (${projects.length})` },
              { id: "milestones" as TabId, label: `Milestones (${openMilestones.length})` },
              { id: "done" as TabId, label: `Завершённые (${doneMilestones.length})` },
              { id: "uptime" as TabId, label: "Мониторинг" },
              { id: "audit" as TabId, label: "Аудит" },
              { id: "pipeline" as TabId, label: "Pipeline" },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`tab ${tab === t.id ? "tab-active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="header-right">
          {!hasToken && <TokenForm onTokenSet={() => refresh(true)} />}
          {hasToken && (
            <>
              <button
                onClick={() => refresh(true)}
                disabled={loading}
                className="header-icon-btn"
                title="Обновить"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "spin" : ""}>
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                  <path d="M21 3v6h-6" />
                </svg>
              </button>
              <button
                onClick={() => { clearAuth(); clearToken(); clearClaudeKey(); window.location.reload(); }}
                className="header-icon-btn header-icon-btn--subtle"
                title="Выйти"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!hasToken && (
        <div className="empty-state">
          <p>Укажите GitHub Token для начала работы</p>
        </div>
      )}

      {hasToken && projects.length > 0 && (
        <div className={`bento-grid ${tab === "dashboard" ? "dashboard-grid" : ""}`}>
          {tab === "dashboard" && (
            <>
              <ErrorBoundary fallback="Ошибка в метриках">
                <Summary metrics={summary} onFinanceClick={() => setFinanceOpen(true)} />
              </ErrorBoundary>

              <ErrorBoundary fallback="Ошибка в графике">
                <ClosedChart projects={projects} />
              </ErrorBoundary>

              <ErrorBoundary fallback="Ошибка в дедлайнах">
                <UrgentDeadlines milestones={allMilestones} />
              </ErrorBoundary>

              <div className="bento-panel span-8 panel-projects" style={{ gridRow: "span 2", display: 'flex', flexDirection: 'column' }}>
                <div className="bento-panel-title">
                  Активные проекты
                  <span onClick={() => setTab("projects")} style={{ color: "var(--color-primary)", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: "normal" }}>
                    Все проекты →
                  </span>
                </div>
                <section className="projects-grid">
                  {[...projects]
                    .sort((a, b) => {
                      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
                      const recentA = a.issues.filter(i => i.closedAt && new Date(i.closedAt).getTime() > cutoff).length;
                      const recentB = b.issues.filter(i => i.closedAt && new Date(i.closedAt).getTime() > cutoff).length;
                      return recentB - recentA;
                    })
                    .slice(0, 4)
                    .map((p) => (
                      <ProjectCard key={p.repo} project={p} monitor={getMonitorForRepo(p.repo)} />
                    ))}
                </section>
              </div>

              <ErrorBoundary fallback="Ошибка в мониторинге">
                <StaleAlert projects={projects} />
              </ErrorBoundary>

              <ErrorBoundary fallback="Ошибка в blocked items">
                <BlockedItems issues={blockedIssues} />
              </ErrorBoundary>

              <ErrorBoundary fallback="Ошибка в диаграмме">
                <StackedChart projects={projects} />
              </ErrorBoundary>
            </>
          )}

          {tab === "projects" && (
            <>
              <div className="bento-panel span-12 panel-projects">
                <div className="bento-panel-title">
                  Все проекты
                </div>
                <section className="projects-grid">
                  {projects
                    .map((p) => (
                      <ProjectCard key={p.repo} project={p} monitor={getMonitorForRepo(p.repo)} />
                    ))}
                </section>
              </div>
            </>
          )}

          {tab === "audit" && (
            <AuditTab dashboardProjects={projects} />
          )}

          {tab === "pipeline" && (
            <PipelineControlPanel projects={projects} />
          )}

          {tab === "milestones" && (
            <div className="milestones-grouped">
              {openMilestones.length === 0 && (
                <div className="empty-state">Нет открытых milestones</div>
              )}
              {Object.entries(
                openMilestones
                  .sort((a, b) => {
                    if (a.dueOn && b.dueOn) return new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime();
                    return a.dueOn ? -1 : b.dueOn ? 1 : 0;
                  })
                  .reduce<Record<string, typeof openMilestones>>((acc, m) => {
                    (acc[m.repo] ??= []).push(m);
                    return acc;
                  }, {})
              ).map(([repo, milestones]) => (
                <div key={repo} className="milestone-group">
                  <h3 className="milestone-group-title">{repo} <span className="milestone-group-count">({milestones.length})</span></h3>
                  <div className="milestones-grid">
                    {milestones.map((m, i) => (
                      <MilestoneCard key={`${m.repo}-${m.title}-${i}`} milestone={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "done" && (
            <div className="bento-panel span-12">
              <div className="bento-panel-title">
                Завершённые milestones
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-success)", fontSize: "var(--text-base)" }}>
                  {doneMilestones.length}
                </span>
              </div>
              {doneMilestones.length === 0 && (
                <div className="empty-state">Пока нет завершённых milestones</div>
              )}
              <div className="milestones-grouped" style={{ padding: 0 }}>
                {Object.entries(
                  doneMilestones.reduce<Record<string, typeof doneMilestones>>((acc, m) => {
                    (acc[m.repo] ??= []).push(m);
                    return acc;
                  }, {})
                ).map(([repo, milestones]) => (
                  <div key={repo} className="milestone-group">
                    <h3 className="milestone-group-title">{repo} <span className="milestone-group-count">({milestones.length})</span></h3>
                    <div className="milestones-grid">
                      {milestones.map((m, i) => (
                        <MilestoneCard key={`${m.repo}-${m.title}-${i}`} milestone={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "uptime" && (
            <div className="bento-panel span-12">
              <div className="bento-panel-title">Мониторинг</div>
              <ErrorBoundary fallback="Ошибка в мониторинге">
                <UptimeBar monitors={monitors} loading={monitorsLoading} error={monitorsError} onRefresh={refreshMonitors} />
              </ErrorBoundary>
            </div>
          )}
        </div>
      )}

      {hasToken && !loading && projects.length === 0 && !error && (
        <div className="empty-state">
          <p>Нажмите «Обновить» для загрузки данных</p>
        </div>
      )}

      <ChatButton onClick={() => setChatOpen(true)} isOpen={chatOpen} />
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        projects={projects}
        summary={summary}
        blockedIssues={blockedIssues}
        onDataChanged={() => refresh(true)}
      />

      {financeOpen && (
        <FinanceEditor
          projects={projects}
          onSave={() => { setFinanceOpen(false); refresh(); }}
          onClose={() => setFinanceOpen(false)}
        />
      )}
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(getAuth());

  if (!authed) {
    return <PasswordGate onAuth={() => setAuthed(true)} />;
  }

  return <AppInner />;
}

export default App;
