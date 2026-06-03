import { useEffect, useMemo, useRef, useState } from "react";
import type { Milestone, ProjectData } from "../../../types";
import { daysUntil } from "../../../utils/date";
import { calcPortfolioVelocity } from "../../../utils/dashboardMetrics";
import { classifyMilestone } from "./classifyMilestone";
import { deadlineTier, stripEpicPrefix } from "./utils";

interface Props {
  /**
   * Full milestone set (open + closed). Hero classifies internally and counts
   * `done`, `inProgress`, `overdue`, plus the issue rollup ring. Passing only
   * open milestones makes the «завершено» counter and progress ring miss every
   * closed milestone — see fix for #230.
   */
  milestones: Milestone[];
  /**
   * Project data (issues from project boards). Velocity reuses the dashboard's
   * `calcPortfolioVelocity` so the Milestones tile matches the headline KPI
   * exactly. Without this we'd be summing milestone-issues — which are
   * limited to first:50 by createdAt ASC and miss recent closures.
   */
  projects?: ProjectData[];
  now: Date;
}

const RING_R = 48;
const RING_C = 2 * Math.PI * RING_R;

const SPARK_W = 220;
const SPARK_H = 44;
const SPARK_P = 4;

interface SparkGeom {
  line: string;
  area: string;
  pts: ReadonlyArray<readonly [number, number]>;
}

function buildSpark(values: number[]): SparkGeom {
  if (values.length === 0) return { line: "", area: "", pts: [] };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = (SPARK_W - SPARK_P * 2) / Math.max(1, values.length - 1);
  const pts = values.map<readonly [number, number]>((v, i) => {
    const x = SPARK_P + i * stepX;
    const y =
      SPARK_P + (SPARK_H - SPARK_P * 2) - ((v - min) / span) * (SPARK_H - SPARK_P * 2);
    return [x, y];
  });
  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const cx = (px + x) / 2;
    line += ` C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }
  const last = pts[pts.length - 1];
  const area = `${line} L ${last[0]} ${SPARK_H} L ${pts[0][0]} ${SPARK_H} Z`;
  return { line, area, pts };
}

function VelocitySpark({ values }: { values: number[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const geom = useMemo(() => buildSpark(values), [values]);
  if (!geom.pts.length) return <div className="v4-mshero-spark" />;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * SPARK_W;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < geom.pts.length; i++) {
      const d = Math.abs(geom.pts[i][0] - relX);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHover({ idx: best, x: geom.pts[best][0], y: geom.pts[best][1] });
  };

  const daysAgo = (idx: number) => {
    const back = values.length - 1 - idx;
    if (back === 0) return "сегодня";
    if (back === 1) return "вчера";
    return `${back} дн. назад`;
  };

  const pctX = hover ? (hover.x / SPARK_W) * 100 : 0;
  const flip = pctX > 65;

  return (
    <div
      ref={ref}
      className="v4-mshero-spark"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="ms-vel-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mk-success)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--mk-success)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={geom.area} className="v4-mshero-spark-area" fill="url(#ms-vel-area)" />
        <path d={geom.line} className="v4-mshero-spark-line" />
        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={SPARK_P}
              y2={SPARK_H}
              stroke="var(--mk-success)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.5"
            />
            <circle cx={hover.x} cy={hover.y} r="6" fill="var(--mk-success)" opacity="0.18" />
            <circle
              cx={hover.x}
              cy={hover.y}
              r="3.5"
              fill="#fff"
              stroke="var(--mk-success)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="v4-mshero-spark-tip is-on"
          style={{
            left: `${pctX}%`,
            transform: flip
              ? "translate(calc(-100% - 10px), 0)"
              : "translate(10px, 0)",
          }}
        >
          <div className="v4-mshero-spark-tip-l">{daysAgo(hover.idx)}</div>
          <div className="v4-mshero-spark-tip-v">
            {values[hover.idx]} <small>задач/день</small>
          </div>
        </div>
      )}
    </div>
  );
}

export function MilestonesHero({ milestones, projects, now }: Props) {
  const stats = useMemo(() => {
    const enriched = milestones.map((m) => {
      const days = m.dueOn ? daysUntil(m.dueOn, now) : null;
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

    let velocityPerDay = 0;
    let velocityDelta = 0;
    let daily14: number[] = new Array(14).fill(0);
    if (projects && projects.length > 0) {
      const v = calcPortfolioVelocity(projects);
      velocityPerDay = v.perDay7d;
      // delta7dVsPrev is now `number | null` (null = "new from a zero base",
      // not a real ±%). The Hero's delta chip hides on 0, so coalesce null to 0
      // — surfaces no misleading "+100%" here (KpiRow shows the "новый" badge).
      velocityDelta = v.delta7dVsPrev ?? 0;
      daily14 = v.daily28d.slice(-14);
    }

    const upcoming = enriched
      .filter((x) => x.cls !== "done" && x.days !== null && x.days >= 0)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))[0];

    // Breakdown derives from the canonical deadline tiers (utils.deadlineTier)
    // so "≤ 7 дн / ≤ 30 дн / дальше" stay in lock-step with the card group
    // headers and status-bar legend. Overdue milestones are not upcoming, so
    // they're excluded from all three counters. `noeta` (no dueOn) rolls into
    // "дальше".
    const cnt7 = enriched.filter(
      (x) => x.cls !== "done" && deadlineTier(x.days) === "week"
    ).length;
    const cnt30 = enriched.filter(
      (x) => x.cls !== "done" && deadlineTier(x.days) === "month"
    ).length;
    const cntFar = enriched.filter(
      (x) =>
        x.cls !== "done" &&
        (deadlineTier(x.days) === "later" || deadlineTier(x.days) === "noeta")
    ).length;

    return {
      totalIssues,
      closedIssues,
      pct,
      overdue,
      inProgress,
      done,
      daily14,
      velocityPerDay,
      velocityDelta,
      upcoming,
      cnt7,
      cnt30,
      cntFar,
    };
  }, [milestones, projects, now]);

  const velocityStr = stats.velocityPerDay.toFixed(1).replace(".", ",");

  // Animate the ring stroke once stats settle. Drive the offset through React
  // state so we don't fight the JSX `strokeDashoffset` prop on re-render. On
  // stat refreshes the CSS transition tweens directly from the previous offset
  // to the new one — no need to reset to RING_C in between.
  const targetOffset = RING_C * (1 - stats.pct / 100);
  const [ringOffset, setRingOffset] = useState(RING_C);
  useEffect(() => {
    const t = window.setTimeout(() => setRingOffset(targetOffset), 50);
    return () => window.clearTimeout(t);
  }, [targetOffset]);

  return (
    <div className="v4-mshero">
      {/* DOMINANT: portfolio progress */}
      <div className="v4-mshero-tile v4-mshero-tile--main">
        <div className="v4-mshero-lbl">
          <span className="v4-mshero-lbl-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </span>
          Портфель milestones
        </div>
        <div className="v4-mshero-main-body">
          <div className="v4-mshero-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle
                cx="60"
                cy="60"
                r={RING_R}
                fill="none"
                /* white/transparent stroke на цветном hero-фоне — это
                   намеренный «контраст на color bg» паттерн; mk-токены сюда
                   не применяются (hero всегда tinted). */
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="9"
              />
              <circle
                className="v4-mshero-ring-fg"
                cx="60"
                cy="60"
                r={RING_R}
                fill="none"
                stroke="#fff"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={ringOffset}
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
          <span className="v4-mshero-lbl-ic" style={{ color: "var(--mk-purple-500)" }}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h7l-1 8 11-13h-8l1-7z" />
            </svg>
          </span>
          Velocity · 7 дней
        </div>
        <div className="v4-mshero-num-row">
          <span className="v4-mshero-num num">{velocityStr}</span>
          <span className="v4-mshero-num-u">issue/день</span>
          {stats.velocityDelta !== 0 && (
            <span
              className={`v4-mshero-delta-chip v4-mshero-delta-chip--${
                stats.velocityDelta >= 0 ? "pos" : "neg"
              }`}
            >
              {stats.velocityDelta >= 0 ? "↑" : "↓"} {Math.abs(stats.velocityDelta)}%
            </span>
          )}
        </div>
        <div className="v4-mshero-meta">vs. предыдущая неделя</div>
        <VelocitySpark values={stats.daily14} />
      </div>

      {/* SUPPORT 2: next deadline */}
      <div className="v4-mshero-tile">
        <div className="v4-mshero-lbl">
          <span className="v4-mshero-lbl-ic" style={{ color: "var(--mk-success)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </span>
          Ближайший дедлайн
        </div>
        <div className="v4-mshero-num-row">
          {stats.upcoming === undefined ? (
            <span className="v4-mshero-num num">—</span>
          ) : stats.upcoming.days === 0 ? (
            <span className="v4-mshero-num num" style={{ fontSize: 32 }}>
              сегодня
            </span>
          ) : (
            <>
              <span className="v4-mshero-num num">{stats.upcoming.days}</span>
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
