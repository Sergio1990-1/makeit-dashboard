import { useMemo } from "react";
import type { Milestone } from "../../../types";
import { daysUntil, formatShortDate } from "../../../utils/date";
import { classifyMilestone, type MilestoneStatusKind } from "./classifyMilestone";
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

export type GanttZoom = "day" | "week" | "month";

const ZOOMS: Record<GanttZoom, { dayW: number; label: string }> = {
  day: { dayW: 36, label: "День" },
  week: { dayW: 22, label: "Неделя" },
  month: { dayW: 12, label: "Месяц" },
};

const WINDOW_BACK_MAX = 21;
const WINDOW_BACK_MIN = 3;
const WINDOW_FWD = 60;
const ROW_H = 44;

interface Props {
  milestones: Milestone[];
  zoom: GanttZoom;
  onZoom: (z: GanttZoom) => void;
  now: Date;
}

interface Enriched {
  m: Milestone;
  startD: Date;
  dueD: Date | null;
  days: number | null;
  cls: MilestoneStatusKind;
}

export function MilestonesGantt({ milestones, zoom, onZoom, now }: Props) {
  const data = useMemo(() => {
    const dayW = ZOOMS[zoom].dayW;

    const enriched: Enriched[] = milestones
      .map((m) => {
        const startD = milestoneStart(m, now);
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
    const endWindow = startOfDay(addDays(now, WINDOW_FWD));
    const totalDays = diffDays(endWindow, startWindow);
    const totalW = totalDays * dayW;

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
      days,
      monthRuns,
      dayW,
      totalDays,
      totalW,
      todayLeft,
      weekendCols,
      startWindow,
    };
  }, [milestones, zoom, now]);

  const todaySod = useMemo(() => startOfDay(now), [now]);

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
          <div className="v4-pillgrp">
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
            {data.enriched.map((x, idx) => {
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

          <div className="v4-msgantt-chart">
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

                {data.enriched.map((x, idx) => {
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

                  const duePos = x.dueD
                    ? diffDays(x.dueD, data.startWindow) * data.dayW +
                      data.dayW / 2 -
                      7
                    : null;
                  const showDiamond =
                    duePos !== null && duePos >= -10 && duePos <= data.totalW + 10;
                  const showText = width >= 90;

                  const dueLabel = x.m.dueOn ? formatShortDate(x.m.dueOn) : "";

                  return (
                    <div key={`${x.m.url}-${idx}`} className="v4-msgantt-grid-row">
                      <a
                        className={`v4-msgantt-bar v4-msgantt-bar--${x.cls}${
                          hasFill ? " has-fill" : ""
                        }`}
                        href={x.m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ left: `${left}px`, width: `${width}px` }}
                        title={`${x.m.title} · ${x.m.closedIssues}/${total} (${pct}%)${
                          dueLabel ? " · до " + dueLabel : ""
                        }`}
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
                      </a>
                      {showDiamond && duePos !== null && (
                        <div
                          className={`v4-msgantt-due v4-msgantt-due--${x.cls}`}
                          style={{ left: `${duePos}px` }}
                          title={dueLabel ? `Дедлайн: ${dueLabel}` : "Дедлайн"}
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
    </div>
  );
}

export const GANTT_ROW_H = ROW_H;
