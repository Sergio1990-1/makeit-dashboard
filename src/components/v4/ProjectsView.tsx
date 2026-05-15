import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectData, Monitor, Phase } from "../../types";
import { ProjectCardV4 } from "./ProjectCardV4";
import { ProjectHubPage } from "./hub/ProjectHubPage";
import { calcRiskScore } from "../../utils/riskScore";
import { useToast } from "./toastContext";

interface Props {
  projects: ProjectData[];
  getMonitor: (repo: string) => Monitor | undefined;
  onFinanceClick: () => void;
  onJumpToTab?: (tab: "pipeline" | "audit") => void;
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
  "pre-dev": "Pre-dev",
  development: "Dev",
  support: "Support",
  stale: "Stale",
};

const SORT_LABELS: Record<SortKey, string> = {
  activity: "Активность",
  open: "Открытые",
  risk: "Risk score",
  progress: "Прогресс",
  name: "Имя",
};

const PHASE_GROUP_TITLE: Record<Phase, string> = {
  development: "В разработке",
  "pre-dev": "Pre-dev",
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
  onJumpToTab,
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
            <div className="v4-projects-agg-n num" style={{ color: agg.p1 > 0 ? "var(--v4-p1)" : undefined }}>
              {agg.p1}
            </div>
            <div className="v4-projects-agg-l">P1</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num" style={{ color: agg.stale > 0 ? "var(--v4-warn-700)" : undefined }}>
              {agg.stale}
            </div>
            <div className="v4-projects-agg-l">stale</div>
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

      {/* Cards */}
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
              <div className="v4-projects-grid">
                {g.items.map((p) => (
                  <div key={p.repo} className="v4-project-cell">
                    <ProjectCardV4
                      project={p}
                      monitor={getMonitor(p.repo)}
                      onJumpToTab={onJumpToTab}
                      onEditFinance={onFinanceClick}
                    />
                    <button
                      type="button"
                      className="v4-btn v4-project-health-btn"
                      onClick={() => onSelectRepo(p.repo)}
                      aria-label={`Открыть Health для ${p.repo}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                        <path d="M12 22s-8-4.5-8-11.8A5 5 0 0 1 12 5a5 5 0 0 1 8 5.2c0 7.3-8 11.8-8 11.8z" />
                      </svg>
                      Health
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
