import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectData, Monitor, Phase } from "../../types";
import { ProjectHubPage } from "./hub/ProjectHubPage";
import {
  ProjectScorecard,
  type ScorecardKpis,
} from "./portfolio/ProjectScorecard";
import { PortfolioNextActions } from "./portfolio/PortfolioNextActions";
import { PortfolioRenewals } from "./portfolio/PortfolioRenewals";
import { PortfolioPromiseTracker } from "./portfolio/PortfolioPromiseTracker";
import { PortfolioDigestPanel } from "./portfolio/PortfolioDigestPanel";
import { calcRiskScore } from "../../utils/riskScore";
import { usePortfolioNbaCollection } from "../../hooks/usePortfolioNbaCollection";
import { usePortfolioHealthCollection } from "../../hooks/usePortfolioHealthCollection";
import { usePortfolioCommitmentsCollection } from "../../hooks/usePortfolioCommitmentsCollection";
import { collectCachedPerProjectNba } from "../../utils/portfolioNbaCollector";
import { useToast } from "./toastContext";

interface Props {
  projects: ProjectData[];
  getMonitor: (repo: string) => Monitor | undefined;
  onFinanceClick: () => void;
  /** Selected repo for the embedded ProjectHubPage. Lifted to the parent
   *  so the topbar breadcrumb can include the project name. */
  selectedRepo: string | null;
  onSelectRepo: (repo: string | null) => void;
}

type PhaseFilter = "all" | Phase | "stale";

type SortKey =
  | "activity"
  | "open"
  | "risk"
  | "progress"
  | "name";

interface ToolbarState {
  phase: PhaseFilter;
  sort: SortKey;
  asc: boolean;
  query: string;
  groupByPhase: boolean;
}

const STORAGE_KEY = "makeit.projectsView.v1";

const PHASE_LABELS: Record<PhaseFilter, string> = {
  all: "Все",
  "pre-dev": "До разработки",
  development: "Разработка",
  support: "Поддержка",
  stale: "Застой",
};

const SORT_LABELS: Record<SortKey, string> = {
  activity: "Активность",
  open: "Открытые",
  risk: "Риск-скор",
  progress: "Прогресс",
  name: "Имя",
};

const PHASE_GROUP_TITLE: Record<Phase, string> = {
  development: "В разработке",
  "pre-dev": "До разработки",
  support: "Поддержка",
};

function loadState(): ToolbarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ToolbarState>;
      return {
        phase: parsed.phase ?? "all",
        sort: parsed.sort ?? "activity",
        asc: parsed.asc ?? false,
        query: "",
        groupByPhase: parsed.groupByPhase ?? false,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    phase: "all",
    sort: "activity",
    asc: false,
    query: "",
    groupByPhase: false,
  };
}

function saveState(s: ToolbarState): void {
  try {
    // Strip the transient `query` field — never persist search input.
    const { query: _query, ...persist } = s;
    void _query;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  } catch {
    /* ignore */
  }
}

function isStaleProject(p: ProjectData): boolean {
  return (
    p.daysSinceActivity !== null &&
    p.daysSinceActivity >= 7 &&
    p.openCount > 0
  );
}

// Portfolio default tier for the Scorecard. The dashboard has no per-repo
// tier in its data model (classification lives in the Health engine, loaded
// async per-project — fetching it for every card would be an N+1 the
// Scorecard explicitly forbids). Tier 2 ("active, lower-stakes") is the
// neutral middle; `useDriftNorm` inside the card still resolves any
// per-repo override from its own store, so drift colouring stays correct.
const SCORECARD_TIER = 2 as const;

// KPIs the Scorecard shows. `open` mirrors the existing card; in-progress /
// blocked are derived from the already-loaded `issues` list (no extra
// fetch — pure reduce). `overdueCommitments` stays 0 here as the baseline
// fallback: the per-project overdue count is not in this view's data model
// (deriving it needs each repo's BRIEF + commitments.yaml). The call site
// overrides it with the real count for any project whose Hub was visited
// this session — a pure render-path read of the cache `useProjectHub`
// persists for free (`usePortfolioCommitmentsCollection`, same #456
// pattern as `grade`), 0 only for not-yet-visited projects (strictly
// better than the previous always-0-for-all, NOT a per-project fetch).
function scorecardKpis(p: ProjectData): ScorecardKpis {
  let inProgress = 0;
  let blocked = 0;
  for (const i of p.issues) {
    if (i.status === "Done") continue;
    if (i.status === "In Progress") inProgress += 1;
    if (i.isBlocked) blocked += 1;
  }
  return {
    open: p.openCount,
    inProgress,
    blocked,
    overdueCommitments: 0,
  };
}

function compareBy(
  a: ProjectData,
  b: ProjectData,
  sort: SortKey,
  getMonitor: (repo: string) => Monitor | undefined
): number {
  switch (sort) {
    case "activity": {
      // Smaller daysSinceActivity = MORE recent. We want most recent first
      // when desc=false handled by caller; here return numeric "freshness".
      const aD = a.daysSinceActivity ?? 9999;
      const bD = b.daysSinceActivity ?? 9999;
      return aD - bD;
    }
    case "open":
      return a.openCount - b.openCount;
    case "risk":
      return calcRiskScore(a, getMonitor(a.repo)).score -
        calcRiskScore(b, getMonitor(b.repo)).score;
    case "progress": {
      const ap = a.totalCount > 0 ? a.doneCount / a.totalCount : 0;
      const bp = b.totalCount > 0 ? b.doneCount / b.totalCount : 0;
      return ap - bp;
    }
    case "name":
      return a.repo.localeCompare(b.repo, "ru");
  }
}

export function ProjectsView({
  projects,
  getMonitor,
  onFinanceClick,
  selectedRepo,
  onSelectRepo,
}: Props) {
  const [state, setState] = useState<ToolbarState>(() => loadState());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const selectedProject = useMemo(
    () => (selectedRepo ? projects.find((p) => p.repo === selectedRepo) : undefined),
    [projects, selectedRepo],
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  // ─── URL persistence (Epic-008 Task-01, #156) ──────────────────────
  // Sync `selectedRepo` ↔ `?repo=` query so a refresh on the Health page
  // restores the drill-down and Browser back/forward navigates between the
  // list and the open project. History API directly — react-router would
  // be overkill for one parameter.
  //
  // `lastSyncedRepoRef` records the URL value last written/read so the
  // pushState effect can skip re-syncs that came from mount or popstate
  // (otherwise we would push a duplicate entry and break the back button).
  // `didMountPushRef` suppresses the very first run of the pushState effect:
  // on initial render its closure sees `selectedRepo = null` while the
  // mount effect (which runs before it per React's effect ordering) may
  // have already pointed the ref at `?repo=X` from the URL. Without the
  // skip we would push an empty URL once, then push `?repo=X` again on
  // the rerender — adding a spurious history entry on every direct link.
  const lastSyncedRepoRef = useRef<string | null>(null);
  const didMountPushRef = useRef(false);
  // Mirror `projects` in a ref so the popstate listener can validate
  // against the latest list without resubscribing on every refresh.
  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // On mount: hydrate state from URL. Validate against the known project
  // list — a stale `?repo=foo` from a deleted project should fall back to
  // the list view rather than render an empty Health page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("repo");
    if (fromUrl && projects.some((p) => p.repo === fromUrl)) {
      lastSyncedRepoRef.current = fromUrl;
      onSelectRepo(fromUrl);
    } else {
      lastSyncedRepoRef.current = null;
      // If the URL contains an unknown `?repo=`, strip it so back/forward
      // history entries stay consistent with what the UI shows.
      if (fromUrl) {
        const url = new URL(window.location.href);
        url.searchParams.delete("repo");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    }
    // Run only once on mount; we don't want to reset selection if the
    // projects list later reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Epic-009 Task-05 / PRD-008 FR-12 — legacy bookmark toast ─────
  // Old bookmarks pointed at `?tab=projects&repo=X` and used to render
  // ProjectHealthPage directly. Hub now defaults to Overview when `subtab`
  // is absent (FR-12). One-time toast tells the user where Health went.
  //
  // Snapshot the URL once during initial render — the hydration effect
  // above strips `?repo=X` from URL when `projects` is still loading
  // (treating it as stale), so reading window.location inside the toast
  // effect would miss the legacy URL on slow first loads. Waits for
  // `projects` to populate before deciding the bookmark is valid;
  // `didShowToastRef` keeps "fire once" semantics across re-renders.
  const initialLegacyUrlRef = useRef<{ repo: string | null; hasSubtab: boolean }>(
    (() => {
      if (typeof window === "undefined") return { repo: null, hasSubtab: false };
      const p = new URLSearchParams(window.location.search);
      return { repo: p.get("repo"), hasSubtab: p.has("subtab") };
    })(),
  );
  const didShowToastRef = useRef(false);
  useEffect(() => {
    if (didShowToastRef.current) return;
    const { repo: bookmarkedRepo, hasSubtab } = initialLegacyUrlRef.current;
    if (!bookmarkedRepo || hasSubtab) return;
    // Wait until the projects list has loaded so we can validate the repo
    // exists; otherwise an empty `projects` would silently drop the toast.
    if (projects.length === 0) return;
    if (!projects.some((p) => p.repo === bookmarkedRepo)) return;

    didShowToastRef.current = true;
    const FLAG = "makeit_hub_legacy_toast_shown";
    try {
      if (localStorage.getItem(FLAG) === "1") return;
      localStorage.setItem(FLAG, "1");
    } catch {
      // localStorage unavailable (private mode, quota, etc) — still show
      // the toast this once but don't bail out.
    }
    toast.push({
      kind: "info",
      title: "Health теперь во вкладке",
      description:
        "Переключитесь сверху, чтобы вернуться к привычному виду",
      duration: 6000,
    });
  }, [projects, toast]);

  // Push URL whenever the selection changes (skipping re-syncs from the
  // mount/popstate paths). The first run is always a no-op — see the
  // `didMountPushRef` comment above.
  useEffect(() => {
    if (!didMountPushRef.current) {
      didMountPushRef.current = true;
      return;
    }
    if (lastSyncedRepoRef.current === selectedRepo) return;
    lastSyncedRepoRef.current = selectedRepo;
    const url = new URL(window.location.href);
    if (selectedRepo) {
      url.searchParams.set("repo", selectedRepo);
    } else {
      url.searchParams.delete("repo");
    }
    window.history.pushState({ repo: selectedRepo }, "", url.pathname + url.search);
  }, [selectedRepo]);

  // Browser back/forward: read the URL fresh and push the change up.
  // Reading `location.search` directly (not the event's state) keeps us
  // correct even when another piece of code wrote the entry without a
  // state object.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("repo");
      const valid =
        next && projectsRef.current.some((p) => p.repo === next) ? next : null;
      lastSyncedRepoRef.current = valid;
      onSelectRepo(valid);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onSelectRepo]);

  // Close sort menu on outside click / Escape
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!sortMenuRef.current?.contains(e.target as Node)) setSortMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortMenuOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

  // Filter
  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return projects.filter((p) => {
      if (state.phase === "stale") {
        if (!isStaleProject(p)) return false;
      } else if (state.phase !== "all") {
        if (p.phase !== state.phase) return false;
      }
      if (q && !p.repo.toLowerCase().includes(q) && !p.client.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [projects, state.phase, state.query]);

  // Sort. `getMonitor` is included because compareBy reads it for risk-key
  // sorting; with App.tsx wrapping it in useCallback the reference is stable
  // until monitors actually change.
  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      const cmp = compareBy(a, b, state.sort, getMonitor);
      return state.asc ? cmp : -cmp;
    });
    return out;
  }, [filtered, state.sort, state.asc, getMonitor]);

  // Aggregate stats over filtered
  const agg = useMemo(() => {
    let open = 0,
      p1 = 0,
      stale = 0,
      doneTotal = 0,
      total = 0,
      budget = 0,
      paid = 0;
    for (const p of filtered) {
      open += p.openCount;
      p1 += p.priorityCounts.P1;
      if (isStaleProject(p)) stale += 1;
      doneTotal += p.doneCount;
      total += p.totalCount;
      budget += p.budget;
      paid += p.paid;
    }
    return {
      count: filtered.length,
      open,
      p1,
      stale,
      doneTotal,
      total,
      budget,
      paid,
      progress: total > 0 ? Math.round((doneTotal / total) * 100) : 0,
    };
  }, [filtered]);

  // Group output (optional)
  const groups: { title: string; items: ProjectData[] }[] = useMemo(() => {
    if (!state.groupByPhase) {
      return [{ title: "", items: sorted }];
    }
    const order: Phase[] = ["development", "pre-dev", "support"];
    return order
      .map((ph) => ({
        title: PHASE_GROUP_TITLE[ph],
        items: sorted.filter((p) => p.phase === ph),
      }))
      .filter((g) => g.items.length > 0);
  }, [sorted, state.groupByPhase]);

  // Single repo-selection entry point shared by every Scorecard AND the
  // four portfolio widgets. It is exactly what the old ProjectCardV4 Health
  // button called — `onSelectRepo(repo)` — so Epic-009 Hub-routing and the
  // `?repo=` pushState effect behave identically (one history entry per
  // selection, no double push: passing this as the widgets' `onOpenProject`
  // bypasses their self-contained URL-navigation fallback).
  const openProject = useCallback(
    (repo: string) => {
      onSelectRepo(repo);
    },
    [onSelectRepo],
  );

  // Portfolio NBA collection (#453). The render path is a pure read of the
  // per-project engine caches (populated for free as hubs are opened) — no
  // N+1 Claude calls block this list. `refreshLive` runs the on-demand
  // per-project recompute only when the user clicks «Регенерировать».
  const { perProjectActions, refreshLive } =
    usePortfolioNbaCollection(projects);
  const handleNbaRegenerate = useCallback(async () => {
    await refreshLive();
    // refreshLive resolved → the per-project engine caches are now fresh;
    // re-read them so the portfolio aggregate (and sidebar badge cache)
    // recomputes from the just-written per-project results.
    return collectCachedPerProjectNba(projects.map((p) => p.repo));
  }, [refreshLive, projects]);

  // Portfolio health grades (#456). Pure render-path read of the per-repo
  // health caches `useProjectHealth` persists for free when a Hub is
  // opened — no network, no N+1. Repos not visited this session are absent
  // from the map → the Scorecard keeps its muted "—" (strictly better than
  // the previous always-"—", not a per-project portfolio fetch).
  // `selectedRepo` is the volatile re-collect trigger: this component
  // stays mounted across Hub visits, so without it a grade cached during
  // a visit would only surface after a full reload (project set is
  // hardcoded → a repo-set-only key never changes in-session).
  const { grades: healthGrades } = usePortfolioHealthCollection(
    projects,
    selectedRepo,
  );

  // Portfolio overdue-commitment counts (#462). Same proven render-path
  // cache-reader as the health grades above: a pure synchronous read of
  // the per-repo count `useProjectHub` persists for free when a Hub is
  // opened — no network, no N+1. Repos not visited this session are
  // absent → the Scorecard's "⏰ просроч." KPI keeps its 0 (strictly
  // better than the previous always-0-for-all, not a per-project fetch).
  // `selectedRepo` is the same volatile re-collect trigger as the grades
  // hook so a count cached during a Hub visit surfaces in-session on
  // Hub-leave without a full reload.
  const { overdueByRepo } = usePortfolioCommitmentsCollection(
    projects,
    selectedRepo,
  );

  if (selectedRepo) {
    return (
      <ProjectHubPage
        repo={selectedRepo}
        project={selectedProject}
        onBackToList={() => onSelectRepo(null)}
      />
    );
  }

  return (
    <div className="v4-content">
      {/* Page head */}
      <div className="v4-ph">
        <div>
          <h1>Все проекты</h1>
          <div className="v4-sub">
            {projects.length} в портфеле · {agg.count} в выборке
          </div>
        </div>
        <div className="v4-ph-right">
          <div className="v4-pillgrp">
            {(Object.keys(PHASE_LABELS) as PhaseFilter[]).map((p) => (
              <button
                key={p}
                type="button"
                className={state.phase === p ? "is-active" : ""}
                onClick={() => setState((s) => ({ ...s, phase: p }))}
              >
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>
          <button type="button" className="v4-btn" onClick={onFinanceClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Финансы
          </button>
        </div>
      </div>

      <div style={{ height: 10 }} />

      {/* Portfolio Surface — cross-project widgets (Epic-010 Task-06).
          2×2 grid @≥1024, stacked <768. Each widget gets the same
          `openProject` handler the Scorecards use, so a deep-link from a
          widget drives the identical `selectedRepo` → Hub-routing path
          (no self-contained URL-navigation fallback fires). */}
      <div className="v4-portfolio-widgets">
        <PortfolioNextActions
          perProjectActions={perProjectActions}
          onOpenProject={openProject}
          onBeforeRegenerate={handleNbaRegenerate}
        />
        <PortfolioRenewals onOpenProject={openProject} />
        <PortfolioPromiseTracker onOpenProject={openProject} />
        <PortfolioDigestPanel />
      </div>

      <div style={{ height: 10 }} />

      {/* Aggregate strip + sort/search toolbar */}
      <div className="v4-projects-toolbar">
        <div className="v4-projects-agg">
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{agg.count}</div>
            <div className="v4-projects-agg-l">проектов</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{agg.open}</div>
            <div className="v4-projects-agg-l">открытых</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num" style={{ color: agg.p1 > 0 ? "var(--mk-priority-p1)" : undefined }}>
              {agg.p1}
            </div>
            <div className="v4-projects-agg-l">P1</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num" style={{ color: agg.stale > 0 ? "var(--mk-warn-strong)" : undefined }}>
              {agg.stale}
            </div>
            <div className="v4-projects-agg-l">застой</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{agg.progress}%</div>
            <div className="v4-projects-agg-l">прогресс</div>
          </div>
        </div>

        <div className="v4-projects-tools">
          <div className="v4-search v4-projects-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={state.query}
              onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
              placeholder="Поиск по имени или клиенту…"
              aria-label="Поиск проектов"
            />
            {state.query && (
              <button
                type="button"
                className="v4-projects-search-clear"
                onClick={() => setState((s) => ({ ...s, query: "" }))}
                aria-label="Очистить поиск"
                title="Очистить"
              >
                ×
              </button>
            )}
          </div>

          <div className="v4-projects-sort" ref={sortMenuRef}>
            <button
              type="button"
              className="v4-btn"
              onClick={() => setSortMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M6 12h12M10 18h4" />
              </svg>
              {SORT_LABELS[state.sort]} {state.asc ? "↑" : "↓"}
            </button>
            {sortMenuOpen && (
              <div className="v4-projects-sort-menu" role="menu">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={state.sort === k}
                    className={state.sort === k ? "is-active" : ""}
                    onClick={() => {
                      setState((s) => ({ ...s, sort: k }));
                      setSortMenuOpen(false);
                    }}
                  >
                    {SORT_LABELS[k]}
                  </button>
                ))}
                <div className="v4-projects-sort-sep" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={state.asc}
                  className={state.asc ? "is-active" : ""}
                  onClick={() => setState((s) => ({ ...s, asc: !s.asc }))}
                >
                  {state.asc ? "↑ По возрастанию" : "↓ По убыванию"}
                </button>
                <div className="v4-projects-sort-sep" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={state.groupByPhase}
                  className={state.groupByPhase ? "is-active" : ""}
                  onClick={() =>
                    setState((s) => ({ ...s, groupByPhase: !s.groupByPhase }))
                  }
                >
                  {state.groupByPhase ? "✓" : "□"} Группировать по фазе
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {agg.count === 0 && (
        <div className="v4-panel">
          <div className="v4-empty">
            {state.query
              ? `По запросу «${state.query}» ничего не найдено`
              : "Нет проектов в текущем фильтре"}
          </div>
        </div>
      )}

      {/* Scorecard grid — replaces ProjectCardV4 + Health button.
          The whole Scorecard is the click target; it calls `openProject`
          (= `onSelectRepo`) so clicking routes to the Hub exactly as the
          old Health button did. 3-col @≥1024 / 2-col @≥768 / 1-col <768
          (see the "Portfolio Surface" section in v4.css). */}
      {agg.count > 0 && (
        <div className="v4-projects-groups">
          {groups.map((g, i) => (
            <section key={i} className="v4-projects-group">
              {g.title && (
                <h2 className="v4-projects-group-title">
                  {g.title}{" "}
                  <span className="v4-projects-group-count">({g.items.length})</span>
                </h2>
              )}
              <div className="v4-scorecard-grid">
                {g.items.map((p) => (
                  <ProjectScorecard
                    key={p.repo}
                    repo={p.repo}
                    tier={SCORECARD_TIER}
                    phase={p.phase}
                    client={p.client}
                    grade={healthGrades[p.repo] ?? null}
                    kpis={{
                      ...scorecardKpis(p),
                      overdueCommitments: overdueByRepo[p.repo] ?? 0,
                    }}
                    drift={{
                      // True days-since-last-commit — DriftDots labels
                      // this literally "commit: Nд назад" and grades it
                      // against the `commit_cadence_days` norm, so it
                      // must be commit recency, NOT `daysSinceActivity`
                      // (which is max(lastCommit, any issue updatedAt)
                      // and would hide real commit drift behind a fresh
                      // issue edit). `null` only when the repo has no
                      // commit at all.
                      daysSinceCommit: p.lastCommitDate
                        ? Math.floor(
                            (Date.now() -
                              new Date(p.lastCommitDate).getTime()) /
                              86_400_000,
                          )
                        : null,
                    }}
                    daysSinceActivity={p.daysSinceActivity}
                    onSelectRepo={openProject}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
