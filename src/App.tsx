import { useEffect, useState } from "react";
import { TokenForm } from "./components/TokenForm";
import { MilestoneCard } from "./components/MilestoneCard";
import { ChatPanel } from "./components/ChatPanel";
import { ChatButton } from "./components/ChatButton";
import { FinanceEditor } from "./components/FinanceEditor";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UptimeBar } from "./components/UptimeBar";
import { AuditCombinedTab } from "./components/AuditCombinedTab";
import { PipelineControlPanel } from "./components/PipelineControlPanel";
import { TranscriptsTab } from "./components/TranscriptsTab";
import { ResearchTab } from "./components/ResearchTab";
import { SpecsTab } from "./components/SpecsTab";
import { QualityTab } from "./components/QualityTab";
import { DebateTab } from "./components/DebateTab";
import { Sidebar } from "./components/v4/Sidebar";
import { Topbar } from "./components/v4/Topbar";
import { DashboardView } from "./components/v4/DashboardView";
import { ProjectsView } from "./components/v4/ProjectsView";
import { useDashboard } from "./hooks/useDashboard";
import { useMonitors } from "./hooks/useMonitors";
import { getToken, clearToken, getAuth, clearAuth, clearClaudeKey, MONITOR_MATCH, PROJECTS } from "./utils/config";
import { PasswordGate } from "./components/PasswordGate";
import type { TabId, Monitor } from "./types";
import "./App.css";
import "./styles/v4.css";

const TAB_CRUMBS: Record<TabId, string> = {
  dashboard: "Дашборд",
  projects: "Проекты",
  milestones: "Milestones",
  uptime: "Мониторинг",
  pipeline: "Pipeline",
  transcripts: "Транскрипты",
  audit: "Аудит",
  research: "Research",
  specs: "Specs",
  quality: "Quality",
  debate: "Debate",
};

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

  const VALID_TABS: TabId[] = [
    "dashboard", "projects", "milestones", "uptime", "audit",
    "pipeline", "transcripts", "research", "specs", "quality", "debate",
  ];
  const ACTIVE_TAB_KEY = "makeit.activeTab";
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_TAB_KEY);
      if (stored && (VALID_TABS as string[]).includes(stored)) {
        return stored as TabId;
      }
    } catch {
      // ignore storage errors
    }
    return "dashboard";
  });
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // ignore storage errors
    }
  }, [tab]);

  const [msTab, setMsTab] = useState<"open" | "done">("open");
  const [chatOpen, setChatOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);

  // Track visited tabs so stateful components mount lazily but stay alive
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(["dashboard", tab]));
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      return new Set(prev).add(tab);
    });
  }, [tab]);

  useEffect(() => {
    document.body.classList.add("v4");
    return () => { document.body.classList.remove("v4"); };
  }, []);

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

  // Token-form gate: classic experience until token is set
  if (!hasToken) {
    return (
      <div className="v4-app" style={{ gridTemplateColumns: "1fr" }}>
        <main className="v4-main">
          <div className="v4-content" style={{ paddingTop: 60 }}>
            <h1 style={{ fontSize: 28, marginBottom: 8 }}>MakeIT Dashboard</h1>
            <p style={{ color: "var(--v4-ink-500)", marginBottom: 24 }}>
              Укажите GitHub Token для начала работы.
            </p>
            <TokenForm onTokenSet={() => refresh(true)} />
          </div>
        </main>
      </div>
    );
  }

  const handleLogout = () => {
    clearAuth();
    clearToken();
    clearClaudeKey();
    window.location.reload();
  };

  const crumbs = ["Все проекты", TAB_CRUMBS[tab] ?? tab];

  // Audit alerts placeholder — could read from useAudit later. We expose a
  // dot when there are critical findings; for now keep as undefined to avoid
  // showing a stale badge.
  const auditAlerts: number | undefined = undefined;

  return (
    <div className="v4-app">
      <Sidebar
        activeTab={tab}
        onTabChange={setTab}
        projectsCount={projects.length}
        milestonesCount={allMilestones.length}
        monitorsCount={monitors.length}
        auditAlerts={auditAlerts}
        isOpen={sideOpen}
        onClose={() => setSideOpen(false)}
      />
      <main className="v4-main">
        <Topbar
          crumbs={crumbs}
          showLive={true}
          lastUpdated={lastUpdated}
          onRefresh={() => {
            refresh(true);
            refreshMonitors();
          }}
          refreshing={loading}
          onLogout={handleLogout}
          onBurger={() => setSideOpen(true)}
        />

        {error && <div className="v4-error">{error}</div>}

        {projects.length === 0 && loading && (
          <div className="v4-loading">Загрузка данных…</div>
        )}

        {projects.length === 0 && !loading && !error && (
          <div className="v4-loading">Нажмите «Обновить» для загрузки данных</div>
        )}

        {projects.length > 0 && tab === "dashboard" && (
          <ErrorBoundary fallback="Ошибка в дашборде">
            <DashboardView
              projects={projects}
              summary={summary}
              blockedIssues={blockedIssues}
              getMonitor={getMonitorForRepo}
              lastUpdated={lastUpdated}
              onSeeAllProjects={() => setTab("projects")}
              onFinanceClick={() => setFinanceOpen(true)}
            />
          </ErrorBoundary>
        )}

        {projects.length > 0 && tab === "projects" && (
          <ErrorBoundary fallback="Ошибка вкладки Проекты">
            <ProjectsView
              projects={projects}
              getMonitor={getMonitorForRepo}
              onFinanceClick={() => setFinanceOpen(true)}
              onJumpToTab={(t) => setTab(t)}
            />
          </ErrorBoundary>
        )}

        {projects.length > 0 && tab === "milestones" && (() => {
          const list = msTab === "open" ? openMilestones : doneMilestones;
          const sorted = msTab === "open"
            ? [...list].sort((a, b) => {
                if (a.dueOn && b.dueOn) return new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime();
                return a.dueOn ? -1 : b.dueOn ? 1 : 0;
              })
            : list;
          const grouped = Object.entries(
            sorted.reduce<Record<string, typeof list>>((acc, m) => {
              (acc[m.repo] ??= []).push(m);
              return acc;
            }, {})
          );
          return (
            <div className="v4-legacy-frame">
              <div className="bento-grid">
                <div className="bento-panel span-12">
                  <div className="milestones-sub-tabs">
                    <button
                      className={`milestones-sub-tab ${msTab === "open" ? "milestones-sub-tab-active" : ""}`}
                      onClick={() => setMsTab("open")}
                    >
                      Открытые <span className="milestones-sub-tab-count">{openMilestones.length}</span>
                    </button>
                    <button
                      className={`milestones-sub-tab ${msTab === "done" ? "milestones-sub-tab-active" : ""}`}
                      onClick={() => setMsTab("done")}
                    >
                      Завершённые <span className="milestones-sub-tab-count">{doneMilestones.length}</span>
                    </button>
                  </div>
                  {list.length === 0 && (
                    <div className="empty-state">
                      {msTab === "open" ? "Нет открытых milestones" : "Пока нет завершённых milestones"}
                    </div>
                  )}
                  <div className="milestones-grouped" style={{ padding: 0 }}>
                    {grouped.map(([repo, milestones]) => (
                      <div key={repo} className="milestone-group">
                        <h3 className="milestone-group-title">
                          {repo} <span className="milestone-group-count">({milestones.length})</span>
                        </h3>
                        <div className="milestones-grid">
                          {milestones.map((m) => (
                            <MilestoneCard key={m.url} milestone={m} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {projects.length > 0 && tab === "uptime" && (
          <div className="v4-legacy-frame">
            <div className="bento-grid">
              <div className="bento-panel span-12">
                <div className="bento-panel-title">Мониторинг</div>
                <ErrorBoundary fallback="Ошибка в мониторинге">
                  <UptimeBar
                    monitors={monitors}
                    loading={monitorsLoading}
                    error={monitorsError}
                    onRefresh={refreshMonitors}
                  />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}

        {/* Stateful tabs — mount lazily on first visit, keep alive via display:none */}
        <div className="v4-legacy-frame" style={{ display: tab === "audit" ? undefined : "none" }}>
          {visitedTabs.has("audit") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Аудит">
                <AuditCombinedTab dashboardProjects={projects} />
              </ErrorBoundary>
            </div>
          )}
        </div>
        <div className="v4-legacy-frame" style={{ display: tab === "pipeline" ? undefined : "none" }}>
          {visitedTabs.has("pipeline") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Pipeline">
                <PipelineControlPanel projects={projects} />
              </ErrorBoundary>
            </div>
          )}
        </div>
        <div className="v4-legacy-frame" style={{ display: tab === "transcripts" ? undefined : "none" }}>
          {visitedTabs.has("transcripts") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Транскрипты">
                <TranscriptsTab projects={PROJECTS} />
              </ErrorBoundary>
            </div>
          )}
        </div>
        <div className="v4-legacy-frame" style={{ display: tab === "research" ? undefined : "none" }}>
          {visitedTabs.has("research") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Research">
                <ResearchTab repos={projects.map((p) => p.repo)} />
              </ErrorBoundary>
            </div>
          )}
        </div>
        <div className="v4-legacy-frame" style={{ display: tab === "specs" ? undefined : "none" }}>
          {visitedTabs.has("specs") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Specs">
                <SpecsTab />
              </ErrorBoundary>
            </div>
          )}
        </div>
        <div className="v4-legacy-frame" style={{ display: tab === "quality" ? undefined : "none" }}>
          {visitedTabs.has("quality") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Quality">
                <QualityTab />
              </ErrorBoundary>
            </div>
          )}
        </div>
        <div className="v4-legacy-frame" style={{ display: tab === "debate" ? undefined : "none" }}>
          {visitedTabs.has("debate") && (
            <div className="bento-grid">
              <ErrorBoundary fallback="Ошибка вкладки Debate">
                <DebateTab />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </main>

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
