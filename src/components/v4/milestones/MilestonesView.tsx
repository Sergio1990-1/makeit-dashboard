import { useEffect, useMemo, useState } from "react";
import type { Milestone } from "../../../types";
import { daysUntil } from "../../../utils/date";
import { MilestoneCardV4 } from "./MilestoneCardV4";
import { MilestonesHero } from "./MilestonesHero";
import {
  MilestonesGantt,
  type GanttGrouping,
  type GanttZoom,
} from "./MilestonesGantt";
import { MilestonesClosedSection } from "./MilestonesClosedSection";
import { MilestonesStatusBar } from "./MilestonesStatusBar";
import { classifyMilestone } from "./classifyMilestone";
import { deadlineBucket } from "./utils";

interface Props {
  milestones: Milestone[];
  /** Anchor for daysUntil — recomputed on data refresh */
  lastUpdated: Date | null;
}

type Density = "comfortable" | "compact";
type Grouping = "deadline" | "repo";

interface ToolbarState {
  density: Density;
  grouping: Grouping;
  ganttGrouping: GanttGrouping;
  zoom: GanttZoom;
  query: string;
}

const STORAGE_KEY = "makeit.milestonesView.v2";

const VALID_DENSITY: readonly Density[] = ["comfortable", "compact"];
const VALID_GROUPING: readonly Grouping[] = ["deadline", "repo"];
const VALID_GANTT_GROUPING: readonly GanttGrouping[] = ["none", "repo"];
const VALID_ZOOM: readonly GanttZoom[] = ["day", "week", "month"];

function loadState(): ToolbarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ToolbarState>;
      return {
        density: VALID_DENSITY.includes(p.density as Density)
          ? (p.density as Density)
          : "compact",
        grouping: VALID_GROUPING.includes(p.grouping as Grouping)
          ? (p.grouping as Grouping)
          : "deadline",
        ganttGrouping: VALID_GANTT_GROUPING.includes(
          p.ganttGrouping as GanttGrouping
        )
          ? (p.ganttGrouping as GanttGrouping)
          : "repo",
        zoom: VALID_ZOOM.includes(p.zoom as GanttZoom)
          ? (p.zoom as GanttZoom)
          : "week",
        query: "",
      };
    }
  } catch {
    /* ignore */
  }
  return {
    density: "compact",
    grouping: "deadline",
    ganttGrouping: "repo",
    zoom: "week",
    query: "",
  };
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

interface Enriched {
  m: Milestone;
  days: number | null;
  cls: ReturnType<typeof classifyMilestone>;
}

export function MilestonesView({ milestones, lastUpdated }: Props) {
  const [state, setState] = useState<ToolbarState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Anchor "now" to lastUpdated so daysUntil/Gantt today line stay consistent
  // with the data refresh (otherwise minor drift between refreshes shows).
  const now = useMemo(() => lastUpdated ?? new Date(), [lastUpdated]);

  const enriched: Enriched[] = useMemo(() => {
    return milestones.map((m) => {
      const days = m.dueOn ? daysUntil(m.dueOn, now) : null;
      return { m, days, cls: classifyMilestone(m, days) };
    });
  }, [milestones, now]);

  const open = useMemo(() => enriched.filter((e) => e.cls !== "done"), [enriched]);
  const done = useMemo(() => enriched.filter((e) => e.cls === "done"), [enriched]);
  const openMs = useMemo(() => open.map((x) => x.m), [open]);
  const doneMs = useMemo(() => done.map((x) => x.m), [done]);

  // Filter (applies to cards / status panel; gantt+closed are full sets)
  const filteredOpen = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    if (!q) return open;
    return open.filter(
      (e) =>
        e.m.title.toLowerCase().includes(q) ||
        e.m.repo.toLowerCase().includes(q) ||
        (e.m.description?.toLowerCase().includes(q) ?? false)
    );
  }, [open, state.query]);

  // Group output for cards
  const groups = useMemo(() => {
    if (state.grouping === "repo") {
      const map = new Map<string, Enriched[]>();
      for (const e of filteredOpen) {
        const arr = map.get(e.m.repo) ?? [];
        arr.push(e);
        map.set(e.m.repo, arr);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "ru"))
        .map(([repo, items]) => ({
          // "repo" key falls through to the default `.v4-msgroup-dot`
          // background (var(--v4-ink-400)) — handoff: repo grouping
          // intentionally has no per-bucket colour.
          key: "repo",
          title: repo,
          items: items.sort((a, b) => {
            if (a.days === null && b.days === null) return 0;
            if (a.days === null) return 1;
            if (b.days === null) return -1;
            return a.days - b.days;
          }),
        }));
    }

    const map = new Map<
      string,
      { label: string; order: number; items: Enriched[] }
    >();
    for (const e of filteredOpen) {
      const b = deadlineBucket(e.days);
      const cell = map.get(b.key);
      if (cell) cell.items.push(e);
      else map.set(b.key, { label: b.label, order: b.order, items: [e] });
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key, v]) => ({
        key,
        title: v.label,
        items: v.items.sort((a, b) => {
          if (a.days === null && b.days === null) return 0;
          if (a.days === null) return 1;
          if (b.days === null) return -1;
          return a.days - b.days;
        }),
      }));
  }, [filteredOpen, state.grouping]);

  const subText = (() => {
    const stamp = lastUpdated
      ? lastUpdated.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    const base = `${open.length} открытых · ${done.length} завершённых`;
    return stamp ? `${base} · обновлено ${stamp}` : base;
  })();

  return (
    <div className="v4-content">
      {/* Page head */}
      <div className="v4-ph">
        <div>
          <h1>Milestones</h1>
          <div className="v4-sub">{subText}</div>
        </div>
      </div>

      {/* Hero — three tiles */}
      <MilestonesHero milestones={openMs} now={now} />

      {/* Gantt */}
      <MilestonesGantt
        milestones={openMs}
        zoom={state.zoom}
        onZoom={(z) => setState((s) => ({ ...s, zoom: z }))}
        grouping={state.ganttGrouping}
        onGrouping={(g) => setState((s) => ({ ...s, ganttGrouping: g }))}
        now={now}
      />

      {/* Closed section (collapsible) */}
      <MilestonesClosedSection milestones={doneMs} />

      {/* Status distribution */}
      <div className="v4-msstatus-wrap">
        <MilestonesStatusBar milestones={openMs} now={now} />
      </div>

      {/* Toolbar */}
      <div className="v4-mstoolbar">
        <div className="v4-mstoolbar-left">
          <div className="v4-search v4-mstoolbar-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={state.query}
              onChange={(e) =>
                setState((s) => ({ ...s, query: e.target.value }))
              }
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
        </div>
        <div className="v4-mstoolbar-tools">
          <div className="v4-pillgrp">
            <button
              type="button"
              className={state.grouping === "deadline" ? "is-active" : ""}
              onClick={() =>
                setState((s) => ({ ...s, grouping: "deadline" }))
              }
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
          <div className="v4-pillgrp">
            <button
              type="button"
              className={state.density === "comfortable" ? "is-active" : ""}
              onClick={() =>
                setState((s) => ({ ...s, density: "comfortable" }))
              }
              title="Обычная плотность"
            >
              Обычная
            </button>
            <button
              type="button"
              className={state.density === "compact" ? "is-active" : ""}
              onClick={() => setState((s) => ({ ...s, density: "compact" }))}
              title="Компактная плотность"
            >
              Компакт
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      {filteredOpen.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-empty">
            {state.query
              ? `По запросу «${state.query}» ничего не найдено`
              : "Нет открытых milestones"}
          </div>
        </div>
      ) : (
        <div className="v4-msgroups">
          {groups.map((g) => {
            const totalIssues = g.items.reduce(
              (s, x) => s + x.m.openIssues + x.m.closedIssues,
              0
            );
            const closedIssues = g.items.reduce(
              (s, x) => s + x.m.closedIssues,
              0
            );
            const pct =
              totalIssues > 0
                ? Math.round((closedIssues / totalIssues) * 100)
                : 0;
            return (
              <section
                key={`${g.key}-${g.title}`}
                className="v4-msgroup"
              >
                <header className={`v4-msgroup-head v4-msgroup-head--${g.key}`}>
                  <div className="v4-msgroup-title">
                    <span className="v4-msgroup-dot" />
                    {g.title}{" "}
                    <span className="v4-msgroup-count">({g.items.length})</span>
                  </div>
                  <div className="v4-msgroup-rollup num">
                    <span>
                      {closedIssues}/{totalIssues}
                    </span>
                    <div className="v4-msgroup-rollup-bar">
                      <div
                        className="v4-msgroup-rollup-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span>{pct}%</span>
                  </div>
                </header>
                <div
                  className={`v4-msgrid${
                    state.density === "compact" ? " v4-msgrid--compact" : ""
                  }`}
                >
                  {g.items.map((e) => (
                    <MilestoneCardV4
                      key={e.m.url}
                      milestone={e.m}
                      density={state.density}
                      now={now}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
