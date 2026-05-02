import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TokenForm } from "./components/TokenForm";
import { ChatPanel } from "./components/ChatPanel";
import { ChatButton } from "./components/ChatButton";
import { FinanceEditor } from "./components/FinanceEditor";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MonitoringView } from "./components/v4/monitoring/MonitoringView";
import { AuditView } from "./components/v4/audit/AuditView";
import { PipelineView } from "./components/v4/pipeline/PipelineView";
import { TranscriptsView } from "./components/v4/transcripts/TranscriptsView";
import { ResearchView } from "./components/v4/research/ResearchView";
import { SpecsView } from "./components/v4/specs/SpecsView";
import { QualityView } from "./components/v4/quality/QualityView";
import { DebateView } from "./components/v4/debate/DebateView";
import { Sidebar } from "./components/v4/Sidebar";
import { Topbar } from "./components/v4/Topbar";
import { ToastHost } from "./components/v4/ToastHost";
import { useToast } from "./components/v4/toastContext";
import { CommandPalette } from "./components/v4/CommandPalette";
import { DashboardView } from "./components/v4/DashboardView";
import { ProjectsView } from "./components/v4/ProjectsView";
import { MilestonesView } from "./components/v4/milestones/MilestonesView";
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
  const toast = useToast();
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

  // Toast on refresh result. Skip both the very first effect run AND the
  // first transition from no-data → has-data (initial fetch). We only want
  // to notify on subsequent refreshes, so a real prior `lastUpdated` Date
  // must already be in the ref before the success branch fires.
  const lastUpdatedRef = useRef<Date | null>(null);
  const errorRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (errorRef.current === undefined) {
      errorRef.current = error;
      lastUpdatedRef.current = lastUpdated;
      return;
    }
    if (error && error !== errorRef.current) {
      toast.push({ kind: "error", title: "Не удалось обновить данные", description: error });
    } else if (
      !error &&
      lastUpdated &&
      lastUpdatedRef.current !== null &&
      lastUpdated !== lastUpdatedRef.current &&
      projects.length > 0
    ) {
      toast.push({
        kind: "success",
        title: "Данные обновлены",
        description: `${projects.length} проектов · ${lastUpdated.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
      });
    }
    errorRef.current = error;
    lastUpdatedRef.current = lastUpdated;
  }, [lastUpdated, error, projects.length, toast]);

  const VALID_TABS: TabId[] = [
    "dashboard", "projects", "milestones", "uptime", "audit",
    "pipeline", "transcripts", "research", "specs", "quality", "debate",
  ];
  const ACTIVE_TAB_KEY = "makeit.activeTab";
  const [tab, setTabRaw] = useState<TabId>(() => {
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
  // Wrap state setter with View Transitions API for a smooth cross-fade
  // between tabs. Falls back to plain setState in browsers without support
  // (e.g. Firefox today) — tabs still switch, just without the animation.
  const setTab = useCallback((next: TabId) => {
    type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
    const doc = document as DocVT;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (typeof doc.startViewTransition === "function" && !reduced) {
      doc.startViewTransition(() => setTabRaw(next));
    } else {
      setTabRaw(next);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // ignore storage errors
    }
  }, [tab]);

  const [chatOpen, setChatOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd-K opens command palette (works alongside the existing Topbar shortcut
  // since both register handlers — palette wins because it's an overlay).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track visited tabs so stateful components mount lazily but stay alive.
  // Uses the React-recommended "setState during render" pattern for derived
  // state — see https://react.dev/reference/react/useState#storing-information-from-previous-renders
  // (avoids the cascading re-render of doing this in a useEffect).
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(["dashboard", tab]));
  if (!visitedTabs.has(tab)) {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }

  useEffect(() => {
    document.body.classList.add("v4");
    return () => { document.body.classList.remove("v4"); };
  }, []);

  // Live activity pulses on the sidebar. Auto-clears for the active tab.
  // Declared above the no-token early return so hook order is stable.
  const pulses = useMemo(() => {
    const out: Partial<Record<TabId, "accent" | "success" | "warn" | "danger">> = {};
    const downCount = monitors.filter((m) => m.status === "down").length;
    if (downCount > 0) out.uptime = "danger";
    if (blockedIssues.length >= 5) out.dashboard = "warn";
    if (tab in out) delete out[tab];
    return out;
  }, [monitors, blockedIssues.length, tab]);

  // Memoized so child components (e.g. ProjectsView) can include this in
  // memo dep arrays without re-running on every parent render.
  const getMonitorForRepo = useCallback(
    (repo: string): Monitor | undefined => {
      const keywords = MONITOR_MATCH[repo];
      if (!keywords || monitors.length === 0) return undefined;
      return monitors.find((m) =>
        keywords.some(
          (kw) =>
            m.name.toLowerCase().includes(kw.toLowerCase()) ||
            m.url.toLowerCase().includes(kw.toLowerCase())
        )
      );
    },
    [monitors]
  );

  useEffect(() => {
    if (getToken()) refresh(false); // use cache on initial load
    refreshMonitors();
  }, [refresh, refreshMonitors]);

  const hasToken = !!getToken();

  const allMilestones = projects.flatMap((p) => p.milestones);

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
        pulses={pulses}
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

        {/* Loading / empty state — only for tabs that depend on GitHub project data.
            Tabs like Pipeline, Audit, Quality, Debate, Specs, Research, Transcripts,
            Monitoring have their own state and shouldn't be obscured by this banner. */}
        {projects.length === 0 && (tab === "dashboard" || tab === "projects" || tab === "milestones") && loading && (
          <div className="v4-loading">Загрузка данных…</div>
        )}

        {projects.length === 0 && (tab === "dashboard" || tab === "projects" || tab === "milestones") && !loading && !error && (
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

        {projects.length > 0 && tab === "milestones" && (
          <ErrorBoundary fallback="Ошибка вкладки Milestones">
            <MilestonesView milestones={allMilestones} projects={projects} lastUpdated={lastUpdated} />
          </ErrorBoundary>
        )}

        {tab === "uptime" && (
          <ErrorBoundary fallback="Ошибка вкладки Мониторинг">
            <MonitoringView
              monitors={monitors}
              loading={monitorsLoading}
              error={monitorsError}
              onRefresh={refreshMonitors}
            />
          </ErrorBoundary>
        )}

        {/* Stateful tabs — mount lazily on first visit, keep alive via display:none */}
        <div style={{ display: tab === "audit" ? undefined : "none" }}>
          {visitedTabs.has("audit") && (
            <ErrorBoundary fallback="Ошибка вкладки Аудит">
              <AuditView dashboardProjects={projects} />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: tab === "pipeline" ? undefined : "none" }}>
          {visitedTabs.has("pipeline") && (
            <ErrorBoundary fallback="Ошибка вкладки Pipeline">
              <PipelineView projects={projects} lastUpdated={lastUpdated} />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: tab === "transcripts" ? undefined : "none" }}>
          {visitedTabs.has("transcripts") && (
            <ErrorBoundary fallback="Ошибка вкладки Транскрипты">
              <TranscriptsView projects={PROJECTS} />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: tab === "research" ? undefined : "none" }}>
          {visitedTabs.has("research") && (
            <ErrorBoundary fallback="Ошибка вкладки Research">
              <ResearchView repos={projects.map((p) => p.repo)} />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: tab === "specs" ? undefined : "none" }}>
          {visitedTabs.has("specs") && (
            <ErrorBoundary fallback="Ошибка вкладки Specs">
              <SpecsView />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: tab === "quality" ? undefined : "none" }}>
          {visitedTabs.has("quality") && (
            <ErrorBoundary fallback="Ошибка вкладки Quality">
              <QualityView />
            </ErrorBoundary>
          )}
        </div>
        <div style={{ display: tab === "debate" ? undefined : "none" }}>
          {visitedTabs.has("debate") && (
            <ErrorBoundary fallback="Ошибка вкладки Debate">
              <DebateView />
            </ErrorBoundary>
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

      {paletteOpen && (
        <CommandPalette
          projects={projects}
          milestones={allMilestones}
          activeTab={tab}
          onClose={() => setPaletteOpen(false)}
          onJumpTab={(t) => { setPaletteOpen(false); setTab(t); }}
          onRefresh={() => { setPaletteOpen(false); refresh(true); refreshMonitors(); }}
          onLogout={() => { setPaletteOpen(false); handleLogout(); }}
          onOpenFinance={() => { setPaletteOpen(false); setFinanceOpen(true); }}
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

  return (
    <ToastHost>
      <AppInner />
    </ToastHost>
  );
}

export default App;
