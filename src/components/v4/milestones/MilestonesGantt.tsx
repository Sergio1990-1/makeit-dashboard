import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Milestone } from "../../../types";
import { daysUntil, formatShortDate } from "../../../utils/date";
import { getEffectiveStart } from "../../../utils/milestoneEdit";
import { classifyMilestone, type MilestoneStatusKind } from "./classifyMilestone";
import { MilestoneEditConfirm, type PendingChange } from "./MilestoneEditConfirm";
import {
  addDays,
  clsPriority,
  diffDays,
  milestoneStart,
  repoGlyphColor,
  ruDow,
  ruMonthShort,
  startOfDay,
  stripEpicPrefix,
} from "./utils";

function toIsoDay(d: Date): string {
  // Local midnight → "YYYY-MM-DD"
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type GanttZoom = "day" | "week" | "month";
export type GanttGrouping = "none" | "repo";

const ZOOMS: Record<GanttZoom, { dayW: number; label: string }> = {
  day: { dayW: 36, label: "День" },
  week: { dayW: 22, label: "Неделя" },
  month: { dayW: 12, label: "Месяц" },
};

const WINDOW_BACK_MAX = 21;
const WINDOW_BACK_MIN = 3;
const WINDOW_FWD_MIN = 60;
const WINDOW_FWD_MAX = 365;
const ROW_H = 44;
const GROUP_H = 30;

interface Props {
  milestones: Milestone[];
  zoom: GanttZoom;
  onZoom: (z: GanttZoom) => void;
  grouping: GanttGrouping;
  onGrouping: (g: GanttGrouping) => void;
  now: Date;
  /** Open the issues popup. Cmd/Ctrl-click still opens the GitHub URL. */
  onSelect?: (m: Milestone) => void;
  /** Bumped each time the local override store changes — used as a memo dep
   *  so milestoneStart picks up new user-set starts on the next render. */
  overrideTick?: number;
  /** Notify parent about a successful drag-edit so it can re-apply overrides. */
  onEdited?: () => void;
}

function isModClick(e: { metaKey: boolean; ctrlKey: boolean; button: number }) {
  return e.metaKey || e.ctrlKey || e.button === 1;
}

interface Enriched {
  m: Milestone;
  startD: Date;
  dueD: Date | null;
  days: number | null;
  cls: MilestoneStatusKind;
}

type Item =
  | { kind: "group"; repo: string; count: number }
  | { kind: "row"; e: Enriched };

export function MilestonesGantt({
  milestones,
  zoom,
  onZoom,
  grouping,
  onGrouping,
  now,
  onSelect,
  overrideTick = 0,
  onEdited,
}: Props) {
  const data = useMemo(() => {
    const dayW = ZOOMS[zoom].dayW;

    const enriched: Enriched[] = milestones
      .map((m) => {
        const effective = getEffectiveStart(m);
        const startD = effective
          ? startOfDay(new Date(effective))
          : milestoneStart(m, now);
        const dueD = m.dueOn ? startOfDay(new Date(m.dueOn)) : null;
        const days = m.dueOn ? daysUntil(m.dueOn, now) : null;
        return { m, startD, dueD, days, cls: classifyMilestone(m, days) };
      })
      .sort(
        (a, b) =>
          clsPriority(a.cls) - clsPriority(b.cls) ||
          a.startD.getTime() - b.startD.getTime()
      );

    const today = startOfDay(now);
    const earliestStart = enriched.reduce<Date>(
      (acc, x) => (x.startD < acc ? x.startD : acc),
      today
    );
    const backFromEarliest = diffDays(today, earliestStart);
    const back = Math.min(
      WINDOW_BACK_MAX,
      Math.max(WINDOW_BACK_MIN, backFromEarliest)
    );
    const startWindow = startOfDay(addDays(now, -back));

    // Extend forward window to include the latest deadline (capped) — milestones
    // with dueOn beyond default 60d would otherwise get clipped to right edge.
    const latestDue = enriched.reduce<number>(
      (acc, x) => (x.dueD && x.dueD.getTime() > acc ? x.dueD.getTime() : acc),
      0
    );
    const fwdFromLatest =
      latestDue > 0
        ? diffDays(startOfDay(new Date(latestDue)), today) + 7
        : WINDOW_FWD_MIN;
    const fwd = Math.min(
      WINDOW_FWD_MAX,
      Math.max(WINDOW_FWD_MIN, fwdFromLatest)
    );
    const endWindow = startOfDay(addDays(now, fwd));
    const totalDays = diffDays(endWindow, startWindow);
    const totalW = totalDays * dayW;

    // Build flat list of items (group headers + rows) for rendering
    const items: Item[] = [];
    if (grouping === "repo") {
      const map = new Map<string, Enriched[]>();
      for (const x of enriched) {
        const arr = map.get(x.m.repo) ?? [];
        arr.push(x);
        map.set(x.m.repo, arr);
      }
      const repos = Array.from(map.keys()).sort((a, b) =>
        a.localeCompare(b, "ru")
      );
      for (const repo of repos) {
        const arr = map.get(repo)!;
        items.push({ kind: "group", repo, count: arr.length });
        for (const e of arr) items.push({ kind: "row", e });
      }
    } else {
      for (const e of enriched) items.push({ kind: "row", e });
    }

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(startWindow, i));
    }

    const monthRuns: { count: number; label: string }[] = [];
    for (const d of days) {
      const last = monthRuns[monthRuns.length - 1];
      const lbl = `${ruMonthShort(d)} ’${String(d.getFullYear()).slice(2)}`;
      if (last && last.label === lbl) last.count++;
      else monthRuns.push({ count: 1, label: lbl });
    }

    const todayLeft = diffDays(startOfDay(now), startWindow) * dayW;

    const weekendCols: { start: number; len: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const dow = days[i].getDay();
      if (dow === 0 || dow === 6) {
        let j = i;
        while (
          j < days.length &&
          (days[j].getDay() === 0 || days[j].getDay() === 6)
        )
          j++;
        weekendCols.push({ start: i, len: j - i });
        i = j;
      } else i++;
    }

    return {
      enriched,
      items,
      days,
      monthRuns,
      dayW,
      totalDays,
      totalW,
      todayLeft,
      weekendCols,
      startWindow,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, zoom, now, grouping, overrideTick]);

  const todaySod = useMemo(() => startOfDay(now), [now]);

  // Drag state for resizing milestone bars
  type DragMode = "left" | "right" | "move";
  const dragRef = useRef<{
    url: string;
    mode: DragMode;
    startPx: number;
    origStartIdx: number;
    origEndIdx: number;
    dayW: number;
  } | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    url: string;
    leftIdx: number;
    rightIdx: number;
  } | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startPx;
      const dDays = Math.round(dx / drag.dayW);
      let leftIdx = drag.origStartIdx;
      let rightIdx = drag.origEndIdx;
      if (drag.mode === "left") {
        leftIdx = Math.min(drag.origEndIdx - 1, drag.origStartIdx + dDays);
      } else if (drag.mode === "right") {
        rightIdx = Math.max(drag.origStartIdx + 1, drag.origEndIdx + dDays);
      } else {
        leftIdx = drag.origStartIdx + dDays;
        rightIdx = drag.origEndIdx + dDays;
      }
      setDragGhost({ url: drag.url, leftIdx, rightIdx });
    };
    const onUp = () => {
      const drag = dragRef.current;
      const ghost = dragGhost;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDragGhost(null);
      if (!drag || !ghost) return;
      const moved =
        ghost.leftIdx !== drag.origStartIdx || ghost.rightIdx !== drag.origEndIdx;
      if (!moved) return;
      const target = data.enriched.find((x) => x.m.url === drag.url);
      if (!target) return;
      const newStartD = addDays(data.startWindow, ghost.leftIdx);
      // Right index is exclusive in our left/width math; due day = rightIdx-1.
      const newDueD = addDays(data.startWindow, ghost.rightIdx - 1);
      const newStart = toIsoDay(newStartD);
      const newDue = drag.mode === "left" ? target.m.dueOn : `${toIsoDay(newDueD)}T00:00:00Z`;
      const oldStart = toIsoDay(target.startD);
      setPendingChange({
        milestone: target.m,
        oldStart,
        oldDue: target.m.dueOn,
        newStart,
        newDue,
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [data, dragGhost]);

  const beginDrag = (
    e: React.MouseEvent,
    url: string,
    mode: DragMode,
    startIdx: number,
    endIdx: number,
    dayW: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      url,
      mode,
      startPx: e.clientX,
      origStartIdx: startIdx,
      origEndIdx: endIdx,
      dayW,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      mode === "move" ? "grabbing" : "ew-resize";
    setDragGhost({ url, leftIdx: startIdx, rightIdx: endIdx });
  };

  // Auto-scroll the chart so "today" sits ~12% from the left edge of the
  // visible viewport. Without this the chart loads at scrollLeft=0, which
  // shows the back-window (mostly empty space) and forces the user to hunt
  // for the relevant near-future portion.
  const chartRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const target = Math.max(0, data.todayLeft - el.clientWidth * 0.12);
    el.scrollLeft = target;
  }, [data.todayLeft, data.totalW, zoom]);

  // On window resize, re-anchor today (clientWidth changes).
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const onResize = () => {
      el.scrollLeft = Math.max(0, data.todayLeft - el.clientWidth * 0.12);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [data.todayLeft]);

  return (
    <div className="v4-msgantt">
      <div className="v4-msgantt-h">
        <div className="v4-msgantt-t">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Дедлайн-план · {milestones.length} milestones
        </div>
        <div className="v4-msgantt-controls">
          <div className="v4-msgantt-legend">
            <span className="v4-msgantt-lg">
              <span
                className="v4-msgantt-dot"
                style={{ background: "var(--v4-danger-500)" }}
              />
              просрочено
            </span>
            <span className="v4-msgantt-lg">
              <span
                className="v4-msgantt-dot"
                style={{ background: "var(--v4-warn-500)" }}
              />
              ≤ 3 дн
            </span>
            <span className="v4-msgantt-lg">
              <span
                className="v4-msgantt-dot"
                style={{ background: "var(--v4-accent-500)" }}
              />
              ≤ 14 дн
            </span>
            <span className="v4-msgantt-lg">
              <span
                className="v4-msgantt-dot"
                style={{ background: "var(--v4-success-500)" }}
              />
              готов
            </span>
            <span className="v4-msgantt-lg">
              <span className="v4-msgantt-mini-bar" />
              fill = % done
            </span>
          </div>
          <div className="v4-pillgrp" role="group" aria-label="Группировка">
            <button
              type="button"
              className={grouping === "none" ? "is-active" : ""}
              onClick={() => onGrouping("none")}
              title="Без группировки (по статусу)"
            >
              Поток
            </button>
            <button
              type="button"
              className={grouping === "repo" ? "is-active" : ""}
              onClick={() => onGrouping("repo")}
              title="Группировать по проекту"
            >
              По проекту
            </button>
          </div>
          <div className="v4-pillgrp" role="group" aria-label="Масштаб">
            {(Object.entries(ZOOMS) as [GanttZoom, { label: string }][]).map(
              ([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className={zoom === k ? "is-active" : ""}
                  onClick={() => onZoom(k)}
                >
                  {v.label}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {data.enriched.length === 0 ? (
        <div className="v4-msgantt-empty">Нет milestones для отображения</div>
      ) : (
        <div className="v4-msgantt-body">
          <div className="v4-msgantt-list">
            <div className="v4-msgantt-list-h">Milestone</div>
            {data.items.map((it, idx) => {
              if (it.kind === "group") {
                return (
                  <div
                    key={`g-${it.repo}`}
                    className="v4-msgantt-list-group"
                    title={it.repo}
                  >
                    <span className="v4-msgantt-list-group-name">
                      {it.repo}
                    </span>
                    <span className="v4-msgantt-list-group-count num">
                      {it.count}
                    </span>
                  </div>
                );
              }
              const x = it.e;
              const total = x.m.openIssues + x.m.closedIssues;
              const pct =
                total > 0 ? Math.round((x.m.closedIssues / total) * 100) : 0;
              return (
                <a
                  key={`${x.m.url}-${idx}`}
                  href={x.m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`v4-msgantt-row v4-msgantt-row--${x.cls}`}
                  title={x.m.title}
                  onClick={(e) => {
                    if (!onSelect || isModClick(e)) return;
                    e.preventDefault();
                    onSelect(x.m);
                  }}
                >
                  <span
                    className="v4-msgantt-row-glyph"
                    style={{ background: repoGlyphColor(x.m.repo) }}
                  />
                  <div className="v4-msgantt-row-info">
                    <div className="v4-msgantt-row-title">
                      {stripEpicPrefix(x.m.title) || x.m.title}
                    </div>
                    <div className="v4-msgantt-row-sub">
                      <span>{x.m.repo}</span>
                      <span className="v4-msgantt-row-dot" />
                      <span>
                        {x.m.closedIssues}/{total}
                      </span>
                    </div>
                  </div>
                  <div className="v4-msgantt-row-pct num">{pct}%</div>
                </a>
              );
            })}
          </div>

          <div className="v4-msgantt-chart" ref={chartRef}>
            <div
              className="v4-msgantt-chart-inner"
              style={{ width: `${data.totalW}px` }}
            >
              <div className="v4-msgantt-axis">
                <div className="v4-msgantt-axis-months">
                  {data.monthRuns.map((mo, i) => (
                    <div
                      key={i}
                      className="v4-msgantt-axis-month"
                      style={{ width: `${mo.count * data.dayW}px` }}
                    >
                      {mo.label}
                    </div>
                  ))}
                </div>
                <div className="v4-msgantt-axis-days">
                  {data.days.map((d, i) => {
                    const isWE = d.getDay() === 0 || d.getDay() === 6;
                    const isToday = diffDays(d, todaySod) === 0;
                    const cls = [
                      "v4-msgantt-axis-day",
                      isWE ? "v4-msgantt-axis-day--weekend" : "",
                      isToday ? "v4-msgantt-axis-day--today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={i}
                        className={cls}
                        style={{ width: `${data.dayW}px` }}
                      >
                        <div className="v4-msgantt-axis-day-num num">
                          {d.getDate()}
                        </div>
                        {data.dayW >= 18 && (
                          <div className="v4-msgantt-axis-day-dow">
                            {ruDow(d)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className="v4-msgantt-grid"
                style={{ backgroundSize: `${data.dayW}px 100%` }}
              >
                {data.weekendCols.map((w, i) => (
                  <div
                    key={i}
                    className="v4-msgantt-weekend"
                    style={{
                      left: `${w.start * data.dayW}px`,
                      width: `${w.len * data.dayW}px`,
                    }}
                  />
                ))}
                <div
                  className="v4-msgantt-today"
                  style={{ left: `${data.todayLeft}px` }}
                />

                {data.items.map((it, idx) => {
                  if (it.kind === "group") {
                    return (
                      <div
                        key={`gs-${it.repo}`}
                        className="v4-msgantt-grid-group"
                      />
                    );
                  }
                  const x = it.e;
                  const total = x.m.openIssues + x.m.closedIssues;
                  const pct =
                    total > 0
                      ? Math.round((x.m.closedIssues / total) * 100)
                      : 0;
                  const startIdx = Math.max(
                    0,
                    diffDays(x.startD, data.startWindow)
                  );
                  const endDate =
                    x.dueD ??
                    addDays(x.startD, Math.max(7, Math.round(total * 1.5)));
                  const endIdx = Math.min(
                    data.totalDays,
                    diffDays(endDate, data.startWindow) + 1
                  );
                  const left = startIdx * data.dayW;
                  const width = Math.max(28, (endIdx - startIdx) * data.dayW);
                  const fillW = (width * pct) / 100;
                  const hasFill = pct > 0;

                  const showText = width >= 90;
                  const dueLabel = x.m.dueOn ? formatShortDate(x.m.dueOn) : "";

                  const ghost =
                    dragGhost && dragGhost.url === x.m.url ? dragGhost : null;
                  const ghostLeft = ghost ? ghost.leftIdx * data.dayW : null;
                  const ghostWidth = ghost
                    ? Math.max(28, (ghost.rightIdx - ghost.leftIdx) * data.dayW)
                    : null;

                  return (
                    <div key={`${x.m.url}-${idx}`} className="v4-msgantt-grid-row">
                      <a
                        className={`v4-msgantt-bar v4-msgantt-bar--${x.cls}${
                          hasFill ? " has-fill" : ""
                        }${ghost ? " is-dragging" : ""}`}
                        href={x.m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={`${x.m.title} · ${x.m.closedIssues}/${total} (${pct}%)${
                          dueLabel ? " · до " + dueLabel : ""
                        }`}
                        onClick={(e) => {
                          if (!onSelect || isModClick(e)) return;
                          e.preventDefault();
                          onSelect(x.m);
                        }}
                        onMouseDown={(e) => {
                          // Body drag = "move" (shift due preserving duration).
                          // Edge handles handled by their own mousedown via stopPropagation.
                          if (e.button !== 0) return;
                          beginDrag(e, x.m.url, "move", startIdx, endIdx, data.dayW);
                        }}
                      >
                        {hasFill && (
                          <div
                            className="v4-msgantt-bar-fill"
                            style={{ width: `${fillW}px` }}
                          />
                        )}
                        {showText && (
                          <div className="v4-msgantt-bar-text">
                            <span className="v4-msgantt-bar-title">
                              {stripEpicPrefix(x.m.title) || x.m.title}
                            </span>
                            <span className="v4-msgantt-bar-pct num">{pct}%</span>
                          </div>
                        )}
                        <span
                          className="v4-msgantt-bar-handle v4-msgantt-bar-handle--l"
                          aria-label="Изменить дату начала"
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            beginDrag(e, x.m.url, "left", startIdx, endIdx, data.dayW);
                          }}
                        />
                        <span
                          className="v4-msgantt-bar-handle v4-msgantt-bar-handle--r"
                          aria-label="Изменить дедлайн"
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            beginDrag(e, x.m.url, "right", startIdx, endIdx, data.dayW);
                          }}
                        />
                      </a>
                      {ghost && ghostLeft !== null && ghostWidth !== null && (
                        <div
                          className="v4-msgantt-bar-ghost"
                          style={{ left: `${ghostLeft}px`, width: `${ghostWidth}px` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingChange && (
        <MilestoneEditConfirm
          change={pendingChange}
          onClose={() => setPendingChange(null)}
          onSaved={() => onEdited?.()}
        />
      )}
    </div>
  );
}

export const GANTT_ROW_H = ROW_H;
export const GANTT_GROUP_H = GROUP_H;
