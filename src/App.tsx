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
import { QualityTab } from "./components/quality/QualityTab";
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
import { usePortfolioHealth } from "./hooks/usePortfolioHealth";
import { usePortfolioOrphans } from "./hooks/usePortfolioOrphans";
import { usePortfolioNbaBadge } from "./hooks/usePortfolioNbaBadge";
import { fetchPipelineStatus, fetchPipelineLimits } from "./utils/pipeline";
import type { PipelineAbortReason, PipelineLimits } from "./utils/pipeline";
import { getToken, clearToken, getAuth, clearAuth, clearClaudeKey, MONITOR_MATCH, PROJECTS } from "./utils/config";
import { PasswordGate } from "./components/PasswordGate";
import { SettingsBootstrap } from "./components/v4/SettingsBootstrap";
import { SettingsPanel } from "./components/v4/SettingsPanel";
import { BrandedLoader, type LoaderStage } from "./components/v4/BrandedLoader";
import { MakeItLoader } from "./components/v4/MakeItLoader";
import { useSettings } from "./hooks/useSettings";
import { runOneTimeMigration } from "./utils/settings-migration";
import {
  EXTERNAL_AUTH_LOST_EVENT,
  type ExternalAuthLostDetail,
  type ExternalAuthService,
} from "./utils/external-auth-events";
import type { TabId, Monitor } from "./types";
import "./App.css";
import "./styles/v4.css";
import "./styles/v4-health.css";
import "./styles/v4-bizproc.css";

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
  "codex-quality": "Качество кода",
  debate: "Debate",
};

interface AppInnerProps {
  /** Fires once after the first refresh attempt resolves (success OR failure)
   * so the cold-start overlay above can hide. Subsequent refreshes don't fire. */
  onFirstFetchDone?: () => void;
}

function AppInner({ onFirstFetchDone }: AppInnerProps = {}) {
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

  // Notify parent when the first fetch attempt resolves (whichever way) so
  // the cold-start splash can lift. We use a ref to keep this exactly-once.
  //
  // The "no token" branch matters because `refresh(false)` below is gated on
  // `getToken()` — without a token there is no fetch to wait for, so neither
  // `lastUpdated` nor `error` will ever flip. That happens for brand-new users
  // and (since 98f0c4f) in degraded mode when Pipeline is offline AND the
  // `github_token` was already migrated off localStorage by Task-05: the
  // settings cache stays empty, `getToken()` returns null, and the BrandedLoader
  // overlay above us would otherwise stay fixed at z-index 50 forever.
  const firstFetchSignaledRef = useRef(false);
  useEffect(() => {
    if (firstFetchSignaledRef.current) return;
    if (lastUpdated !== null || error !== null || !getToken()) {
      firstFetchSignaledRef.current = true;
      onFirstFetchDone?.();
    }
  }, [lastUpdated, error, onFirstFetchDone]);

  const { monitors, loading: monitorsLoading, error: monitorsError, refresh: refreshMonitors } = useMonitors();

  // Portfolio scans are mounted at the App level (rather than inside
  // DashboardView) so the Topbar "Обновить" button can trigger a rescan
  // alongside useDashboard.refresh. Both hooks are self-cached with a 30
  // min TTL — mounting them up here is free on initial load and ensures a
  // single source of truth for the dashboard panels.
  const portfolio = usePortfolioHealth();
  const orphans = usePortfolioOrphans();

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
    "pipeline", "transcripts", "research", "specs", "quality", "codex-quality", "debate",
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
  // Plain state setter. The View Transitions API wrapper that used to live
  // here cross-faded a snapshot of the OLD tab against the NEW tab over
  // 280ms — but the new tab's snapshot was captured on the very first
  // frame, when entrance keyframes (.v4-mshero-tile, .v4-kpi, .v4-pcard
  // etc.) still had `opacity: 0`. The cross-fade then animated the same
  // properties (opacity, transform) the entrance was animating, doubling
  // the easing and producing the visible flicker users complained about.
  // Without the wrapper, content's own entrance animations play cleanly.
  const setTab = setTabRaw;
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
  // SettingsPanel (Epic-004 Task-04). Modal state lives at App.tsx so the
  // FR-8 toast action and Topbar gear icon can both open it without a
  // round-trip through context.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Selected repo for the Project Health sub-page on the Projects tab. Lifted
  // here so the topbar breadcrumb can include the project name and let the
  // user navigate back via "Проекты".
  const [healthRepo, setHealthRepo] = useState<string | null>(null);
  // Switching tabs should always land on the tab's main view — clear the
  // drill-down before changing tabs so the user never returns to a stale
  // sub-page on tab re-entry. Also strip `?repo=` from the URL when LEAVING
  // the Projects tab: ProjectsView owns that query param while it is mounted,
  // but once we navigate away it becomes orphaned and would mislead the next
  // refresh. We must NOT strip on the way IN to Projects (issue #212), since
  // a shared/bookmarked deep-link like `/?repo=Beer_bot` opened while the
  // persisted active tab is e.g. Dashboard would otherwise lose `?repo=`
  // before ProjectsView mounts and runs its URL-hydration effect.
  const navigateTab = useCallback(
    (next: TabId) => {
      setHealthRepo(null);
      if (typeof window !== "undefined" && next !== "projects") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("repo")) {
          url.searchParams.delete("repo");
          window.history.replaceState(null, "", url.pathname + url.search);
        }
      }
      setTab(next);
    },
    [setTab],
  );

  // Open the Project Health drilldown for a specific repo from outside the
  // Projects tab (currently invoked by AIInsightsPanel). Bypasses
  // `navigateTab` because that one explicitly clears `healthRepo`.
  const openHealthForRepo = useCallback(
    (repo: string) => {
      setHealthRepo(repo);
      setTab("projects");
    },
    [setTab],
  );

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

  // FR-8 (Epic-004 Task-04): when an upstream API (GitHub / Claude /
  // BetterStack) returns 401, fetch wrappers in utils/* dispatch
  // `external-api:auth-lost`. Surface a one-shot toast with an action that
  // opens SettingsPanel so the user can rotate the bad secret.
  //
  // Debounced via a ref so a burst of failed requests (a polling loop hitting
  // 401 repeatedly) does not stack toasts — we re-arm only after the user
  // acknowledges or 30s elapses.
  const lastAuthLostAtRef = useRef<Map<ExternalAuthService, number>>(new Map());
  useEffect(() => {
    const SERVICE_LABELS: Record<ExternalAuthService, string> = {
      github: "GitHub PAT",
      claude: "Claude API key",
      betterstack: "BetterStack token",
    };
    const onAuthLost = (e: Event) => {
      const detail = (e as CustomEvent<ExternalAuthLostDetail>).detail;
      const service = detail?.service;
      if (!service) return;
      const now = Date.now();
      const lastAt = lastAuthLostAtRef.current.get(service) ?? 0;
      // 30s debounce per service — long enough to ride out a polling burst,
      // short enough to re-prompt if the user dismisses without acting.
      if (now - lastAt < 30_000) return;
      lastAuthLostAtRef.current.set(service, now);
      const label = SERVICE_LABELS[service] ?? service;
      toast.push({
        kind: "error",
        title: `Токен ${label} истёк`,
        description: "Откройте Настройки и обновите значение секрета.",
        // Sticky until the user dismisses or opens Settings — auth issues
        // shouldn't auto-vanish.
        duration: 0,
        action: {
          label: "Открыть Настройки",
          onClick: () => setSettingsOpen(true),
        },
      });
    };
    window.addEventListener(EXTERNAL_AUTH_LOST_EVENT, onAuthLost);
    return () => window.removeEventListener(EXTERNAL_AUTH_LOST_EVENT, onAuthLost);
  }, [toast]);

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

  // Phase-0.7 (TD-architect, 2026-04-30): App-level lightweight pipeline state.
  // Drives the sidebar Pipeline pulse + the rate-limit warning shown on the
  // Pipeline tab.  This is a SEPARATE polling loop from ``usePipeline`` (which
  // PipelineView mounts for detailed UI) — App needs only ``running`` and
  // ``limits``, and a coarser cadence is fine (12s when idle, 5s when running)
  // because the only consumers here are the sidebar dot + a banner that
  // renders even when the user is on a different tab.
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineAbort, setPipelineAbort] =
    useState<PipelineAbortReason | null>(null);
  const [pipelineLimits, setPipelineLimits] = useState<PipelineLimits | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const [status, limits] = await Promise.all([
          fetchPipelineStatus().catch(() => null),
          fetchPipelineLimits(),
        ]);
        if (cancelled) return;
        if (status) {
          setPipelineRunning(Boolean(status.running));
          const reason = status.last_abort_reason;
          if (reason && "category" in reason) {
            setPipelineAbort(reason as PipelineAbortReason);
          } else {
            setPipelineAbort(null);
          }
        }
        setPipelineLimits(limits);
      } finally {
        if (!cancelled) {
          // Faster cadence when running so the sidebar pulse drops promptly.
          const next = pipelineRunning ? 5000 : 12000;
          timer = setTimeout(() => void poll(), next);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // pipelineRunning intentionally NOT in deps — it's read only to pick the
    // next delay, and including it would restart the polling loop on every
    // toggle and create overlapping timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live activity pulses on the sidebar. Auto-clears for the active tab.
  // Declared above the no-token early return so hook order is stable.
  const pulses = useMemo(() => {
    const out: Partial<Record<TabId, "accent" | "success" | "warn" | "danger">> = {};
    const downCount = monitors.filter((m) => m.status === "down").length;
    if (downCount > 0) out.uptime = "danger";
    if (blockedIssues.length >= 5) out.dashboard = "warn";
    // Phase-0.7: green pulse on Pipeline while a batch is running.  Distinct
    // colour from the warn/danger pulses on other tabs so operators can tell
    // "active work" from "needs attention" at a glance.
    if (pipelineRunning) out.pipeline = "success";
    // Phase-0.7: warn pulse on Pipeline when the previous /pipeline/start
    // aborted on a recoverable rate-limit (graphql) and the reset time has
    // not passed yet — invites the operator to wait rather than retry.
    else if (
      pipelineAbort &&
      pipelineAbort.category === "graphql_rate_limit" &&
      pipelineAbort.retry_after_ts !== null &&
      pipelineAbort.retry_after_ts * 1000 > Date.now()
    ) {
      out.pipeline = "warn";
    }
    if (tab in out) delete out[tab];
    return out;
  }, [monitors, blockedIssues.length, tab, pipelineRunning, pipelineAbort]);

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

  // Auto-retry once if we land in the empty-no-error state after the initial
  // fetch (e.g. cache backend returned nothing). Without this, the inline
  // brick-build loader below would imply data is incoming when nothing is
  // actually being requested. Gated by a ref so a persistently empty state
  // can't loop.
  const autoRetryRef = useRef(false);
  useEffect(() => {
    if (autoRetryRef.current) return;
    if (
      projects.length === 0 &&
      !loading &&
      !error &&
      lastUpdated !== null &&
      getToken()
    ) {
      autoRetryRef.current = true;
      void refresh(true);
    }
  }, [projects.length, loading, error, lastUpdated, refresh]);

  // Epic-004 Task-05: one-time port of legacy `localStorage` secrets to the
  // server-side settings store. Runs once per page session AFTER the gate has
  // already confirmed `useSettings().ready === true` (AppInner only mounts in
  // that state), so it's safe to hit `/settings` here. The module itself is
  // idempotent — the `settings_migration_v1_done` flag short-circuits repeats.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await runOneTimeMigration();
        if (!active) return;
        if (import.meta.env.DEV) {
          console.info("[settings-migration]", result);
        }
        if (result.failed.length > 0) {
          toast.push({
            kind: "error",
            title: "Не все секреты мигрированы",
            description: `${result.failed.length} ключей не удалось перенести. Попробуйте перезагрузить страницу или открыть Настройки.`,
          });
        }
      } catch (e) {
        // The migration module already swallows internal errors and returns a
        // result; this catch is purely defensive against truly unexpected throws.
        if (import.meta.env.DEV) {
          console.error("[settings-migration] unexpected:", e);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  // Topbar "Обновить" must invalidate every long-lived dashboard cache, not
  // just useDashboard's. Depend on the individual `.refresh` callbacks (each
  // is `useCallback`'d inside its hook with stable identity) rather than the
  // whole hook return objects — the latter would churn handleRefresh's
  // identity on every state tick (loading flip, lastUpdated update),
  // defeating Topbar/CommandPalette memoization.
  const portfolioRefresh = portfolio.refresh;
  const orphansRefresh = orphans.refresh;

  // Critical health-fails across the portfolio — drives the red badge on the
  // «Дашборд» nav item. Reads from the same single-source-of-truth portfolio
  // hook so we don't double-mount the heavy scan in Sidebar.
  const criticalFails = useMemo(
    () =>
      portfolio.reports.reduce(
        (acc, r) =>
          acc +
          r.findings.filter(
            (f) => f.status === "fail" && f.severity === "critical",
          ).length,
        0,
      ),
    [portfolio.reports],
  );
  const handleRefresh = useCallback(() => {
    refresh(true);
    refreshMonitors();
    portfolioRefresh();
    orphansRefresh();
  }, [refresh, refreshMonitors, portfolioRefresh, orphansRefresh]);

  // Passive portfolio-NBA count for the «Проекты» sidebar pill. Reads only
  // the cache PortfolioNextActions wrote — never triggers a Claude compute.
  const nbaBadge = usePortfolioNbaBadge(tab);

  const hasToken = !!getToken();

  const allMilestones = projects.flatMap((p) => p.milestones);

  // Token-form gate: classic experience until token is set.
  //
  // `onTokenSet` must trigger every dashboard data source — not just
  // `useDashboard.refresh`. The portfolio hooks (`usePortfolioHealth`,
  // `usePortfolioOrphans`) are mounted above the gate so their initial
  // mount-effect runs once with no token, lands in the
  // `TOKEN_MISSING_ERROR` branch of `usePortfolioScan`, and never auto-
  // reruns when the token appears (they don't subscribe to token changes
  // and their mount effect already fired). Reusing `handleRefresh` here
  // mirrors what the Topbar "Обновить" button does, so the panels
  // populate immediately after a fresh setup instead of staying empty
  // until the user clicks Refresh — fixes #214 (regression from PR #173).
  if (!hasToken) {
    return (
      <div className="v4-app" style={{ gridTemplateColumns: "1fr" }}>
        <main className="v4-main">
          <div className="v4-content" style={{ paddingTop: 60 }}>
            <h1 style={{ fontSize: 28, marginBottom: 8 }}>MakeIT Dashboard</h1>
            <p style={{ color: "var(--mk-ink-500)", marginBottom: 24 }}>
              Укажите GitHub Token для начала работы.
            </p>
            <TokenForm onTokenSet={handleRefresh} />
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

  const crumbs =
    tab === "projects" && healthRepo
      ? ["Все проекты", TAB_CRUMBS.projects, healthRepo]
      : ["Все проекты", TAB_CRUMBS[tab] ?? tab];

  // When on the health sub-page, clicking the "Проекты" crumb (index 1)
  // returns to the projects list. Other intermediate crumbs are inert.
  const handleCrumbClick = (i: number) => {
    if (tab === "projects" && healthRepo && i === 1) {
      setHealthRepo(null);
    }
  };

  // Audit alerts placeholder — could read from useAudit later. We expose a
  // dot when there are critical findings; for now keep as undefined to avoid
  // showing a stale badge.
  const auditAlerts: number | undefined = undefined;

  return (
    <div className="v4-app">
      <Sidebar
        activeTab={tab}
        onTabChange={navigateTab}
        projectsCount={projects.length}
        milestonesCount={allMilestones.length}
        monitorsCount={monitors.length}
        auditAlerts={auditAlerts}
        criticalFails={criticalFails}
        nbaBadge={nbaBadge}
        pulses={pulses}
        isOpen={sideOpen}
        onClose={() => setSideOpen(false)}
      />
      <main className="v4-main">
        <Topbar
          crumbs={crumbs}
          onCrumbClick={tab === "projects" && healthRepo ? handleCrumbClick : undefined}
          showLive={true}
          lastUpdated={lastUpdated}
          onRefresh={handleRefresh}
          refreshing={loading}
          onLogout={handleLogout}
          onSettings={() => setSettingsOpen(true)}
          onBurger={() => setSideOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
        />

        {error && <div className="v4-error">{error}</div>}

        {/* Loading / empty state — only for tabs that depend on GitHub project data.
            Tabs like Pipeline, Audit, Quality, Debate, Specs, Research, Transcripts,
            Monitoring have their own state and shouldn't be obscured by this banner. */}
        {/* Cold-start splash is rendered once at App level (ColdStartShell)
            so the loader doesn't re-mount when SettingsGate hands off to
            AppInner. Subsequent loading states inside tabs render their
            own indicators. */}

        {projects.length === 0 && (tab === "dashboard" || tab === "projects" || tab === "milestones") && !error && (
          // Inline brick-build loader for the empty-no-error state. Pairs
          // with the auto-retry effect above so the visual matches reality
          // (something is being fetched).
          <div className="v4-inline-loader">
            <MakeItLoader size={48} />
            <div className="v4-inline-loader-caption">Подтягиваем данные с GitHub</div>
          </div>
        )}

        {projects.length > 0 && tab === "dashboard" && (
          <ErrorBoundary fallback="Ошибка в дашборде">
            <DashboardView
              projects={projects}
              summary={summary}
              blockedIssues={blockedIssues}
              getMonitor={getMonitorForRepo}
              lastUpdated={lastUpdated}
              onSeeAllProjects={() => navigateTab("projects")}
              onFinanceClick={() => setFinanceOpen(true)}
              onOpenHealth={openHealthForRepo}
              portfolio={portfolio}
              orphans={orphans}
            />
          </ErrorBoundary>
        )}

        {projects.length > 0 && tab === "projects" && (
          <ErrorBoundary fallback="Ошибка вкладки Проекты">
            <ProjectsView
              projects={projects}
              getMonitor={getMonitorForRepo}
              onFinanceClick={() => setFinanceOpen(true)}
              selectedRepo={healthRepo}
              onSelectRepo={setHealthRepo}
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
              <PipelineView
                projects={projects}
                lastUpdated={lastUpdated}
                githubLimits={pipelineLimits?.github ?? null}
                lastAbort={pipelineAbort}
              />
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
        <div style={{ display: tab === "codex-quality" ? undefined : "none" }}>
          {visitedTabs.has("codex-quality") && (
            <ErrorBoundary fallback="Ошибка вкладки «Качество кода»">
              <QualityTab />
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
          onJumpTab={(t) => { setPaletteOpen(false); navigateTab(t); }}
          onRefresh={() => { setPaletteOpen(false); handleRefresh(); }}
          onLogout={() => { setPaletteOpen(false); handleLogout(); }}
          onOpenFinance={() => { setPaletteOpen(false); setFinanceOpen(true); }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onBootstrapCleared={() => {
            // Hard reload so SettingsGate re-mounts useSettings(), sees no
            // bootstrap token, and renders SettingsBootstrap again.
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function ColdStartShell() {
  const settings = useSettings();
  // Hides the splash once the first dashboard fetch resolves. Until then,
  // the BrandedLoader overlay covers AppInner while it warms up underneath.
  const [firstFetchDone, setFirstFetchDone] = useState(false);

  if (settings.error === "auth") {
    return <SettingsBootstrap onSuccess={settings.retry} />;
  }
  // "unavailable" → degraded mode: Pipeline settings failed to load (API offline
  // or transient network error), but all other tabs (Dashboard, Monitoring, etc.)
  // still work via localStorage fallbacks. The Pipeline tab handles its own
  // offline state via usePipeline(). We don't block the whole app here.

  const isReady = settings.ready || settings.error === "unavailable";
  const stage: LoaderStage = isReady ? "data" : "settings";
  const showSplash = !isReady || !firstFetchDone;

  return (
    <>
      {/* Mount AppInner as soon as settings are ready (or in degraded mode) so
          the dashboard warms up under the splash. Explicit keys ensure React
          keeps the BrandedLoader instance stable across the settings → data
          transition — only the stage label changes, the brick-build animation
          does not restart. */}
      {isReady ? (
        <AppInner key="app" onFirstFetchDone={() => setFirstFetchDone(true)} />
      ) : null}
      {showSplash ? <BrandedLoader key="splash" stage={stage} /> : null}
    </>
  );
}

function App() {
  const [authed, setAuthed] = useState(getAuth());

  if (!authed) {
    return <PasswordGate onAuth={() => setAuthed(true)} />;
  }

  return (
    <ToastHost>
      <ColdStartShell />
    </ToastHost>
  );
}

export default App;
