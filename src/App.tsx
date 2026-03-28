import { useEffect, useState } from "react";
import { TokenForm } from "./components/TokenForm";
import { Summary } from "./components/Summary";
import { ProjectCard } from "./components/ProjectCard";
import { BlockedItems } from "./components/BlockedItems";
import { StackedChart } from "./components/StackedChart";
import { Filters } from "./components/Filters";
import { MilestoneCard } from "./components/MilestoneCard";
import { UrgentDeadlines } from "./components/UrgentDeadlines";
import { StaleAlert } from "./components/StaleAlert";
import { ChatPanel } from "./components/ChatPanel";
import { ChatButton } from "./components/ChatButton";
import { FinanceEditor } from "./components/FinanceEditor";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UptimeBar } from "./components/UptimeBar";
import { useDashboard } from "./hooks/useDashboard";
import { useMonitors } from "./hooks/useMonitors";
import { getToken, MONITOR_MATCH } from "./utils/config";
import type { TabId, Monitor } from "./types";
import "./App.css";

function App() {
  const {
    projects,
    filteredIssues,
    summary,
    blockedIssues,
    loading,
    error,
    lastUpdated,
    filters,
    setFilters,
    refresh,
  } = useDashboard();

  const { monitors } = useMonitors();

  const [tab, setTab] = useState<TabId>("projects");
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
  }, [refresh]);

  const hasToken = !!getToken();

  const allMilestones = projects.flatMap((p) => p.milestones);
  const openMilestones = allMilestones.filter((m) => m.state === "OPEN");
  const doneMilestones = allMilestones.filter((m) => m.state === "CLOSED");

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>MakeIT Dashboard</h1>
          {lastUpdated && (
            <span className="last-updated">
              Обновлено: {lastUpdated.toLocaleTimeString("ru-RU")}
            </span>
          )}
        </div>
        <div className="header-right">
          <TokenForm onTokenSet={() => refresh(true)} />
          {hasToken && (
            <button onClick={() => refresh(true)} disabled={loading} className="btn btn-primary">
              {loading ? "Загрузка..." : "Обновить"}
            </button>
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
        <>
          <ErrorBoundary fallback="Ошибка в метриках">
            <Summary metrics={summary} onFinanceClick={() => setFinanceOpen(true)} />
          </ErrorBoundary>

          <ErrorBoundary fallback="Ошибка в дедлайнах">
            <UrgentDeadlines milestones={allMilestones} />
            <StaleAlert projects={projects} />
          </ErrorBoundary>

          <div className="tabs">
            {([
              { id: "projects" as TabId, label: `Проекты (${projects.length})` },
              { id: "milestones" as TabId, label: `Milestones (${openMilestones.length})` },
              { id: "done" as TabId, label: `Завершённые (${doneMilestones.length})` },
              { id: "uptime" as TabId, label: "Мониторинг" },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`tab ${tab === t.id ? "tab-active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "projects" && (
            <>
              <Filters filters={filters} onChange={setFilters} projects={projects} />

              <section className="projects-grid">
                {projects.map((p) => {
                  const issues = filteredIssues(p);
                  if (filters.priority || filters.status) {
                    if (issues.length === 0) return null;
                  }
                  return <ProjectCard key={p.repo} project={{ ...p, issues }} monitor={getMonitorForRepo(p.repo)} />;
                })}
              </section>

              <ErrorBoundary fallback="Ошибка в диаграмме">
                <StackedChart projects={projects} />
              </ErrorBoundary>

              <ErrorBoundary fallback="Ошибка в blocked items">
                <BlockedItems issues={blockedIssues} />
              </ErrorBoundary>
            </>
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

          {tab === "uptime" && (
            <ErrorBoundary fallback="Ошибка в мониторинге">
              <UptimeBar />
            </ErrorBoundary>
          )}

          {tab === "done" && (
            <div className="milestones-grouped">
              {doneMilestones.length === 0 && (
                <div className="empty-state">Пока нет завершённых milestones</div>
              )}
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
          )}
        </>
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

export default App;
