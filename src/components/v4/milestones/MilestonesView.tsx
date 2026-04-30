import { useEffect, useMemo, useRef, useState } from "react";
import type { Milestone } from "../../../types";
import { daysUntil } from "../../../utils/date";
import { MilestoneCardV4 } from "./MilestoneCardV4";
import { classifyMilestone } from "./classifyMilestone";

interface Props {
  milestones: Milestone[];
  /** Anchor for daysUntil — recomputed on data refresh */
  lastUpdated: Date | null;
}

type SubTab = "open" | "done";
type Grouping = "repo" | "deadline";
type SortKey = "deadline" | "progress" | "name" | "repo";

interface ToolbarState {
  sub: SubTab;
  grouping: Grouping;
  sort: SortKey;
  asc: boolean;
  query: string;
}

const STORAGE_KEY = "makeit.milestonesView.v1";

const SORT_LABELS: Record<SortKey, string> = {
  deadline: "Дедлайн",
  progress: "Прогресс",
  name: "Имя",
  repo: "Репо",
};

const VALID_SUBS: readonly SubTab[] = ["open", "done"];
const VALID_GROUPINGS: readonly Grouping[] = ["repo", "deadline"];
const VALID_SORTS: readonly SortKey[] = ["deadline", "progress", "name", "repo"];

function loadState(): ToolbarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ToolbarState>;
      // Validate against allow-lists — protects against stale localStorage
      // values from older/future schema versions.
      return {
        sub: VALID_SUBS.includes(p.sub as SubTab) ? (p.sub as SubTab) : "open",
        grouping: VALID_GROUPINGS.includes(p.grouping as Grouping)
          ? (p.grouping as Grouping)
          : "deadline",
        sort: VALID_SORTS.includes(p.sort as SortKey) ? (p.sort as SortKey) : "deadline",
        asc: typeof p.asc === "boolean" ? p.asc : true,
        query: "",
      };
    }
  } catch {
    /* ignore */
  }
  return { sub: "open", grouping: "deadline", sort: "deadline", asc: true, query: "" };
}

function saveState(s: ToolbarState) {
  try {
    const { query: _q, ...persist } = s;
    void _q;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  } catch {
    /* ignore */
  }
}

interface EnrichedMilestone {
  m: Milestone;
  days: number | null;
  cls: ReturnType<typeof classifyMilestone>;
  progressPct: number;
}

function deadlineBucket(days: number | null): {
  key: string;
  label: string;
  order: number;
} {
  if (days === null) return { key: "noeta", label: "Без дедлайна", order: 99 };
  if (days < 0) return { key: "overdue", label: "Просрочено", order: 0 };
  if (days <= 7) return { key: "week", label: "Эта неделя", order: 1 };
  if (days <= 30) return { key: "month", label: "Этот месяц", order: 2 };
  return { key: "later", label: "Дальше", order: 3 };
}

export function MilestonesView({ milestones, lastUpdated }: Props) {
  const [state, setState] = useState<ToolbarState>(() => loadState());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Close sort menu on outside / Escape
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

  // Enrich: precompute days/cls/progress once per refresh
  const enriched: EnrichedMilestone[] = useMemo(() => {
    return milestones.map((m) => {
      const days = m.dueOn ? daysUntil(m.dueOn) : null;
      const total = m.openIssues + m.closedIssues;
      const progressPct = total > 0 ? Math.round((m.closedIssues / total) * 100) : 0;
      return { m, days, cls: classifyMilestone(m, days), progressPct };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, lastUpdated?.getTime()]);

  const open = useMemo(() => enriched.filter((e) => e.cls !== "done"), [enriched]);
  const done = useMemo(() => enriched.filter((e) => e.cls === "done"), [enriched]);

  const baseList = state.sub === "open" ? open : done;

  // Filter by query
  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (e) =>
        e.m.title.toLowerCase().includes(q) ||
        e.m.repo.toLowerCase().includes(q) ||
        (e.m.description?.toLowerCase().includes(q) ?? false)
    );
  }, [baseList, state.query]);

  // Sort
  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      let cmp = 0;
      switch (state.sort) {
        case "deadline":
          // null deadlines last; otherwise compare days
          if (a.days === null && b.days === null) cmp = 0;
          else if (a.days === null) cmp = 1;
          else if (b.days === null) cmp = -1;
          else cmp = a.days - b.days;
          break;
        case "progress":
          cmp = a.progressPct - b.progressPct;
          break;
        case "name":
          cmp = a.m.title.localeCompare(b.m.title, "ru");
          break;
        case "repo":
          cmp = a.m.repo.localeCompare(b.m.repo, "ru") || a.m.title.localeCompare(b.m.title, "ru");
          break;
      }
      return state.asc ? cmp : -cmp;
    });
    return out;
  }, [filtered, state.sort, state.asc]);

  // Aggregate stats
  const agg = useMemo(() => {
    const totalIssues = baseList.reduce((s, e) => s + e.m.openIssues + e.m.closedIssues, 0);
    const closedIssues = baseList.reduce((s, e) => s + e.m.closedIssues, 0);
    const overdue = baseList.filter((e) => e.cls === "overdue").length;
    const thisWeek = baseList.filter((e) => e.cls === "warn" || (e.days !== null && e.days >= 0 && e.days <= 7)).length;
    const noEta = baseList.filter((e) => e.cls === "noeta").length;
    return {
      count: baseList.length,
      totalIssues,
      closedIssues,
      progress: totalIssues > 0 ? Math.round((closedIssues / totalIssues) * 100) : 0,
      overdue,
      thisWeek,
      noEta,
    };
  }, [baseList]);

  // Group output
  const groups: { key: string; title: string; items: EnrichedMilestone[] }[] = useMemo(() => {
    // Done sub-tab: deadline-bucketing makes no sense (a closed milestone
    // can't be "Просрочено"). Always render as a single "Завершённые" group.
    if (state.sub === "done") {
      return [{ key: "done", title: "Завершённые", items: sorted }];
    }
    if (state.grouping === "repo") {
      const map = new Map<string, EnrichedMilestone[]>();
      for (const e of sorted) {
        const arr = map.get(e.m.repo) ?? [];
        arr.push(e);
        map.set(e.m.repo, arr);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "ru"))
        .map(([repo, items]) => ({ key: repo, title: repo, items }));
    }
    // by deadline
    const map = new Map<string, { label: string; order: number; items: EnrichedMilestone[] }>();
    for (const e of sorted) {
      const b = deadlineBucket(e.days);
      const cell = map.get(b.key);
      if (cell) {
        cell.items.push(e);
      } else {
        map.set(b.key, { label: b.label, order: b.order, items: [e] });
      }
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key, v]) => ({ key, title: v.label, items: v.items }));
  }, [sorted, state.grouping, state.sub]);

  return (
    <div className="v4-content">
      {/* Page head */}
      <div className="v4-ph">
        <div>
          <h1>Milestones</h1>
          <div className="v4-sub">
            {open.length + done.length} в портфеле · {agg.count} в выборке
          </div>
        </div>
        <div className="v4-ph-right">
          <div className="v4-pillgrp">
            <button
              type="button"
              className={state.sub === "open" ? "is-active" : ""}
              onClick={() => setState((s) => ({ ...s, sub: "open" }))}
            >
              Открытые · {open.length}
            </button>
            <button
              type="button"
              className={state.sub === "done" ? "is-active" : ""}
              onClick={() => setState((s) => ({ ...s, sub: "done" }))}
            >
              Завершённые · {done.length}
            </button>
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      {/* Toolbar: aggregate + tools */}
      <div className="v4-projects-toolbar">
        <div className="v4-projects-agg">
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{agg.count}</div>
            <div className="v4-projects-agg-l">milestones</div>
          </div>
          <div className="v4-projects-agg-cell" title="Всего issues across milestones">
            <div className="v4-projects-agg-n num">
              {agg.closedIssues}/{agg.totalIssues}
            </div>
            <div className="v4-projects-agg-l">issues done</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{agg.progress}%</div>
            <div className="v4-projects-agg-l">прогресс</div>
          </div>
          {state.sub === "open" && (
            <>
              <div className="v4-projects-agg-cell">
                <div
                  className="v4-projects-agg-n num"
                  style={{ color: agg.overdue > 0 ? "var(--v4-danger-700)" : undefined }}
                >
                  {agg.overdue}
                </div>
                <div className="v4-projects-agg-l">просрочено</div>
              </div>
              <div className="v4-projects-agg-cell">
                <div
                  className="v4-projects-agg-n num"
                  style={{ color: agg.thisWeek > 0 ? "var(--v4-warn-700)" : undefined }}
                >
                  {agg.thisWeek}
                </div>
                <div className="v4-projects-agg-l">≤ 7д</div>
              </div>
              {agg.noEta > 0 && (
                <div className="v4-projects-agg-cell">
                  <div className="v4-projects-agg-n num">{agg.noEta}</div>
                  <div className="v4-projects-agg-l">без даты</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="v4-projects-tools">
          <div className="v4-pillgrp">
            <button
              type="button"
              className={state.grouping === "deadline" ? "is-active" : ""}
              onClick={() => setState((s) => ({ ...s, grouping: "deadline" }))}
            >
              По дедлайну
            </button>
            <button
              type="button"
              className={state.grouping === "repo" ? "is-active" : ""}
              onClick={() => setState((s) => ({ ...s, grouping: "repo" }))}
            >
              По репо
            </button>
          </div>

          <div className="v4-search v4-projects-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={state.query}
              onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
              placeholder="Поиск по имени, репо, описанию…"
              aria-label="Поиск milestones"
            />
            {state.query && (
              <button
                type="button"
                className="v4-projects-search-clear"
                onClick={() => setState((s) => ({ ...s, query: "" }))}
                aria-label="Очистить поиск"
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty state — keyed off post-search count so search-with-no-results
          shows the proper feedback message instead of a blank card area. */}
      {filtered.length === 0 && (
        <div className="v4-panel">
          <div className="v4-empty">
            {state.query
              ? `По запросу «${state.query}» ничего не найдено`
              : state.sub === "open"
              ? "Нет открытых milestones"
              : "Пока нет завершённых milestones"}
          </div>
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 && (
        <div className="v4-ms-groups">
          {groups.map((g) => (
            <section key={g.key} className="v4-ms-group">
              <h2 className={`v4-ms-group-title v4-ms-group-title--${g.key}`}>
                {g.title}{" "}
                <span className="v4-ms-group-count">({g.items.length})</span>
              </h2>
              <div className="v4-ms-grid-full">
                {g.items.map((e) => (
                  <MilestoneCardV4 key={e.m.url} milestone={e.m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
