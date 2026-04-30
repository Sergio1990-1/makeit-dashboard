import { useMemo } from "react";
import type { Milestone } from "../../../types";
import { daysUntil } from "../../../utils/date";
import { classifyMilestone } from "./classifyMilestone";
import { buildDaily14, buildSparkPath, stripEpicPrefix } from "./utils";

interface Props {
  milestones: Milestone[];
  now: Date;
}

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

export function MilestonesHero({ milestones, now }: Props) {
  const stats = useMemo(() => {
    const enriched = milestones.map((m) => {
      const days = m.dueOn ? daysUntil(m.dueOn) : null;
      return { m, days, cls: classifyMilestone(m, days) };
    });

    const totalIssues = enriched.reduce(
      (s, x) => s + x.m.openIssues + x.m.closedIssues,
      0
    );
    const closedIssues = enriched.reduce((s, x) => s + x.m.closedIssues, 0);
    const pct = totalIssues > 0 ? Math.round((closedIssues / totalIssues) * 100) : 0;
    const overdue = enriched.filter((x) => x.cls === "overdue").length;
    const inProgress = enriched.filter(
      (x) => x.cls !== "done" && x.cls !== "noeta"
    ).length;
    const done = enriched.filter((x) => x.cls === "done").length;

    // Velocity over last 14 days (combined across all milestones' issues)
    const allIssues = milestones.flatMap((m) => m.issues ?? []);
    const daily14 = buildDaily14(allIssues, now);
    const closed7 = daily14.slice(7).reduce((a, b) => a + b, 0);
    const closedPrev7 = daily14.slice(0, 7).reduce((a, b) => a + b, 0);
    const velocityPerDay = closed7 / 7;
    const velocityDelta =
      closedPrev7 > 0
        ? Math.round(((closed7 - closedPrev7) / closedPrev7) * 100)
        : closed7 > 0
        ? 100
        : 0;

    // Next deadline (skip done & noeta, only future or today)
    const upcoming = enriched
      .filter((x) => x.cls !== "done" && x.days !== null && x.days >= 0)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))[0];

    const cnt7 = enriched.filter(
      (x) =>
        x.cls !== "done" && x.days !== null && x.days >= 0 && x.days <= 7
    ).length;
    const cnt30 = enriched.filter(
      (x) =>
        x.cls !== "done" && x.days !== null && x.days > 7 && x.days <= 30
    ).length;
    const cntFar = enriched.filter(
      (x) => x.cls !== "done" && (x.days === null || x.days > 30)
    ).length;

    return {
      totalIssues,
      closedIssues,
      pct,
      overdue,
      inProgress,
      done,
      daily14,
      closed7,
      velocityPerDay,
      velocityDelta,
      upcoming,
      cnt7,
      cnt30,
      cntFar,
    };
  }, [milestones, now]);

  const spark = buildSparkPath(stats.daily14, 220, 36);
  const velocityStr = stats.velocityPerDay.toFixed(1).replace(".", ",");

  return (
    <div className="v4-mshero">
      {/* DOMINANT: portfolio progress */}
      <div className="v4-mshero-tile v4-mshero-tile--main">
        <div className="v4-mshero-lbl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          Портфель milestones
        </div>
        <div className="v4-mshero-main-body">
          <div className="v4-mshero-ring">
            <svg viewBox="0 0 110 110" aria-hidden="true">
              <circle
                cx="55"
                cy="55"
                r={RING_R}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="8"
              />
              <circle
                cx="55"
                cy="55"
                r={RING_R}
                fill="none"
                stroke="#fff"
                strokeWidth="8"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - stats.pct / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="v4-mshero-ring-c">
              <div className="v4-mshero-ring-pct num">{stats.pct}%</div>
              <div className="v4-mshero-ring-lbl">issues done</div>
            </div>
          </div>
          <div className="v4-mshero-main-side">
            <div className="v4-mshero-row">
              <span className="v4-mshero-sw" style={{ background: "#fff" }} />
              <span className="v4-mshero-row-l">в работе</span>
              <b className="num">{stats.inProgress}</b>
            </div>
            <div className="v4-mshero-row">
              <span
                className="v4-mshero-sw"
                style={{ background: "rgba(239,68,68,0.95)" }}
              />
              <span className="v4-mshero-row-l">просрочено</span>
              <b className="num">{stats.overdue}</b>
            </div>
            <div className="v4-mshero-row">
              <span
                className="v4-mshero-sw"
                style={{ background: "rgba(255,255,255,0.35)" }}
              />
              <span className="v4-mshero-row-l">завершено</span>
              <b className="num">{stats.done}</b>
            </div>
          </div>
        </div>
      </div>

      {/* SUPPORT 1: velocity */}
      <div className="v4-mshero-tile">
        <div className="v4-mshero-lbl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          Velocity · 7 дней
        </div>
        <div className="v4-mshero-num num">
          {velocityStr}
          <span className="v4-mshero-num-u">issue/день</span>
        </div>
        <div className="v4-mshero-meta">
          {stats.velocityDelta !== 0 && (
            <span
              className={
                stats.velocityDelta >= 0
                  ? "v4-mshero-delta-pos"
                  : "v4-mshero-delta-neg"
              }
            >
              {stats.velocityDelta >= 0 ? "↑" : "↓"} {Math.abs(stats.velocityDelta)}%
            </span>
          )}
          <span>vs предыдущая неделя</span>
        </div>
        <div className="v4-mshero-spark">
          <svg viewBox="0 0 220 36" preserveAspectRatio="none" aria-hidden="true">
            <path d={spark.area} fill="rgba(18,183,106,0.12)" />
            <path
              d={spark.line}
              fill="none"
              stroke="var(--v4-success-500)"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>

      {/* SUPPORT 2: next deadline */}
      <div className="v4-mshero-tile">
        <div className="v4-mshero-lbl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Ближайший дедлайн
        </div>
        <div className="v4-mshero-num num">
          {stats.upcoming === undefined ? (
            "—"
          ) : stats.upcoming.days === 0 ? (
            "сегодня"
          ) : (
            <>
              {stats.upcoming.days}
              <span className="v4-mshero-num-u">дн</span>
            </>
          )}
        </div>
        <div className="v4-mshero-meta">
          {stats.upcoming && (
            <span className="v4-mshero-meta-strong">
              {stats.upcoming.m.repo} ·{" "}
              {stripEpicPrefix(stats.upcoming.m.title).slice(0, 38)}
            </span>
          )}
        </div>
        <div className="v4-mshero-break">
          <div className="v4-mshero-break-it">
            <div className="v4-mshero-break-n num">{stats.cnt7}</div>
            <div className="v4-mshero-break-l">≤ 7 дн</div>
          </div>
          <div className="v4-mshero-break-it">
            <div className="v4-mshero-break-n num">{stats.cnt30}</div>
            <div className="v4-mshero-break-l">≤ 30 дн</div>
          </div>
          <div className="v4-mshero-break-it">
            <div className="v4-mshero-break-n num">{stats.cntFar}</div>
            <div className="v4-mshero-break-l">дальше</div>
          </div>
        </div>
      </div>
    </div>
  );
}
