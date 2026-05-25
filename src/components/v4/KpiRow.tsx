import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ProjectData, SummaryMetrics } from "../../types";
import {
  calcPortfolioVelocity,
  calcOpenDelta,
  calcProgressDelta,
  sumOpenPriorities,
} from "../../utils/dashboardMetrics";
import { TweenedNumber } from "./TweenedNumber";

interface IndexedStyle extends CSSProperties {
  "--i"?: number;
}

interface Props {
  projects: ProjectData[];
  summary: SummaryMetrics;
  onFinanceClick?: () => void;
}

function compactUSD(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k.toFixed(k % 1 === 0 ? 0 : 1).replace(".", ",")}k`;
  }
  return `$${n}`;
}

const SPARK_W = 240;
const SPARK_H = 52;
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
    const y = SPARK_P + (SPARK_H - SPARK_P * 2) - ((v - min) / span) * (SPARK_H - SPARK_P * 2);
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
  if (!geom.pts.length) return <div className="v4-kpi-spark" />;

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
      className="v4-kpi-spark"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="kpi-vel-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mk-success)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--mk-success)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={geom.area} fill="url(#kpi-vel-area)" />
        <path
          d={geom.line}
          fill="none"
          stroke="var(--v4-success-500)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={SPARK_P}
              y2={SPARK_H}
              stroke="var(--v4-success-500)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.5"
            />
            <circle cx={hover.x} cy={hover.y} r="6" fill="var(--v4-success-500)" opacity="0.18" />
            <circle
              cx={hover.x}
              cy={hover.y}
              r="3.5"
              fill="#fff"
              stroke="var(--v4-success-500)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="v4-kpi-spark-tip"
          style={{
            left: `${pctX}%`,
            transform: flip
              ? "translate(calc(-100% - 10px), 0)"
              : "translate(10px, 0)",
          }}
        >
          <div className="v4-kpi-spark-tip-l">{daysAgo(hover.idx)}</div>
          <div className="v4-kpi-spark-tip-v">
            {values[hover.idx]}
            <small>задач/день</small>
          </div>
        </div>
      )}
    </div>
  );
}

interface SplitItem {
  key: string;
  n: ReactNode;
  l: string;
  color?: string;
}

function SplitsRow({
  items,
  accent = false,
}: {
  items: SplitItem[];
  accent?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className={`v4-kpi-splits${accent ? " v4-kpi-splits--acc" : ""}`}>
      {items.map((s) => (
        <div
          key={s.key}
          className={`v4-kpi-split${hovered === s.key ? " is-on" : ""}`}
          onMouseEnter={() => setHovered(s.key)}
          onMouseLeave={() => setHovered(null)}
        >
          <div
            className="v4-kpi-split-n"
            style={s.color ? { color: s.color } : undefined}
          >
            {s.n}
          </div>
          <div className="v4-kpi-split-l">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

export function KpiRow({ projects, summary, onFinanceClick }: Props) {
  const velocity = useMemo(() => calcPortfolioVelocity(projects), [projects]);
  const openDelta = useMemo(() => calcOpenDelta(projects), [projects]);
  const progressDelta = useMemo(() => calcProgressDelta(projects), [projects]);
  const priorityTotals = useMemo(() => sumOpenPriorities(projects), [projects]);
  // Derive total/done/open from the (possibly phase-filtered) `projects` so
  // all three splits-row numbers and the headline percentage live in the same
  // scope. Using `summary.*` here mixed global totals with a filtered open
  // count, producing inconsistent rows like done + open !== total under an
  // active phaseFilter.
  const { totalCount, doneCount, openCount } = useMemo(() => {
    let total = 0;
    let done = 0;
    let open = 0;
    for (const p of projects) {
      total += p.totalCount ?? 0;
      done += p.doneCount ?? 0;
      open += p.openCount ?? 0;
    }
    return { totalCount: total, doneCount: done, openCount: open };
  }, [projects]);

  const pctDone =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const hasFinances = summary.totalBudget > 0;
  const paidPct = hasFinances
    ? Math.round((summary.totalPaid / summary.totalBudget) * 100)
    : 0;
  const remPct = hasFinances ? 100 - paidPct : 0;

  const monthName = new Date().toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  const [budgetSeg, setBudgetSeg] = useState<"paid" | "rem" | null>(null);
  const isVelDown = velocity.delta7dVsPrev < 0;
  const isVelUp = velocity.delta7dVsPrev > 0;

  return (
    <div className="v4-kpi-row">
      {/* 1. Прогресс портфеля (accent) */}
      <div className="v4-kpi v4-kpi--acc" style={{ "--i": 0 } as IndexedStyle}>
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </span>
          Прогресс портфеля
        </div>
        <div className="v4-kpi-num-row">
          <span className="v4-kpi-num num">
            <TweenedNumber value={pctDone} />
          </span>
          <span className="v4-kpi-num-u">%</span>
          {progressDelta.pointsDelta7d !== 0 && (
            <span
              className={`v4-kpi-delta-chip v4-kpi-delta-chip--${
                progressDelta.pointsDelta7d >= 0 ? "pos" : "neg"
              } v4-kpi-delta-chip--on-acc`}
            >
              {progressDelta.pointsDelta7d >= 0 ? "↑" : "↓"}{" "}
              {Math.abs(progressDelta.pointsDelta7d)
                .toString()
                .replace(".", ",")}{" "}
              п.п.
            </span>
          )}
        </div>
        <div className="v4-kpi-sub">
          {progressDelta.pointsDelta7d === 0 ? "без изменений за 7 дней" : "за 7 дней"}
        </div>
        <SplitsRow
          accent
          items={[
            {
              key: "total",
              n: <TweenedNumber value={totalCount} />,
              l: "Всего",
            },
            {
              key: "done",
              n: <TweenedNumber value={doneCount} />,
              l: "Сделано",
            },
            {
              key: "open",
              n: <TweenedNumber value={openCount} />,
              l: "Открыто",
            },
          ]}
        />
      </div>

      {/* 2. Открытые задачи */}
      <div className="v4-kpi" style={{ "--i": 1 } as IndexedStyle}>
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic v4-kpi-ic--b">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
          Открытые задачи
        </div>
        <div className="v4-kpi-num-row">
          <span className="v4-kpi-num num">
            <TweenedNumber value={openCount} />
          </span>
          {openDelta.netDelta7d !== 0 && (
            <span
              className={`v4-kpi-delta-chip v4-kpi-delta-chip--${
                openDelta.netDelta7d > 0 ? "neg" : "pos"
              }`}
            >
              {openDelta.netDelta7d > 0 ? "↑" : "↓"}{" "}
              {Math.abs(openDelta.netDelta7d)}
            </span>
          )}
        </div>
        <div className="v4-kpi-sub">
          {openDelta.netDelta7d === 0
            ? "без изменений за 7 дней"
            : "net за 7 дней"}
        </div>
        <SplitsRow
          items={[
            {
              key: "P1",
              n: <TweenedNumber value={priorityTotals.P1} />,
              l: "P1",
              color: "var(--v4-p1)",
            },
            {
              key: "P2",
              n: <TweenedNumber value={priorityTotals.P2} />,
              l: "P2",
              color: "var(--v4-p2)",
            },
            {
              key: "P3",
              n: <TweenedNumber value={priorityTotals.P3} />,
              l: "P3",
              color: "var(--v4-p3)",
            },
          ]}
        />
      </div>

      {/* 3. Velocity 7д + sparkline (hover tooltip) */}
      <div className="v4-kpi" style={{ "--i": 2 } as IndexedStyle}>
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic v4-kpi-ic--p">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h7l-1 8 11-13h-8l1-7z" />
            </svg>
          </span>
          Velocity · 7 дней
        </div>
        <div className="v4-kpi-num-row">
          <span className="v4-kpi-num num">
            <TweenedNumber
              value={velocity.perDay7d}
              decimals={1}
              decimalSeparator=","
            />
          </span>
          <span className="v4-kpi-num-u">issue/день</span>
          {velocity.delta7dVsPrev !== 0 && (
            <span
              className={`v4-kpi-delta-chip v4-kpi-delta-chip--${
                isVelDown ? "neg" : "pos"
              }`}
            >
              {isVelUp ? "↑" : "↓"} {Math.abs(velocity.delta7dVsPrev)}%
            </span>
          )}
        </div>
        <div className="v4-kpi-sub">
          {velocity.delta7dVsPrev === 0
            ? "28-дн. ритм закрытия"
            : "vs. предыдущая неделя"}
        </div>
        <VelocitySpark values={velocity.daily28d} />
      </div>

      {/* 4. Бюджет */}
      <div
        className="v4-kpi"
        style={
          {
            "--i": 3,
            ...(onFinanceClick ? { cursor: "pointer" } : null),
          } as IndexedStyle
        }
        onClick={onFinanceClick}
        role={onFinanceClick ? "button" : undefined}
        tabIndex={onFinanceClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onFinanceClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onFinanceClick();
          }
        }}
        aria-label={onFinanceClick ? "Открыть редактор финансов" : undefined}
      >
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic v4-kpi-ic--g">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20" />
              <path d="M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </span>
          Бюджет портфеля
        </div>
        <div className="v4-kpi-num-row">
          <span className="v4-kpi-num num">{compactUSD(summary.totalBudget)}</span>
        </div>
        <div className="v4-kpi-sub">
          {monthName} · оплачено {paidPct}%
        </div>
        {hasFinances ? (
          <div className="v4-fin-bar">
            <div className="v4-fin-bar-stk">
              <div
                className={`v4-pp${budgetSeg === "paid" ? " is-on" : ""}`}
                style={{ width: `${paidPct}%` }}
                onMouseEnter={() => setBudgetSeg("paid")}
                onMouseLeave={() => setBudgetSeg(null)}
              />
              <div
                className={`v4-ip${budgetSeg === "rem" ? " is-on" : ""}`}
                style={{ width: `${remPct}%` }}
                onMouseEnter={() => setBudgetSeg("rem")}
                onMouseLeave={() => setBudgetSeg(null)}
              />
            </div>
            <div className="v4-fin-lg">
              <span
                className={`v4-fin-lg-i${budgetSeg === "paid" ? " is-on" : ""}`}
              >
                <span
                  className="v4-fin-lg-sw"
                  style={{ background: "var(--v4-success-500)" }}
                />
                Оплачено <b>{compactUSD(summary.totalPaid)}</b>
              </span>
              <span
                className={`v4-fin-lg-i${budgetSeg === "rem" ? " is-on" : ""}`}
              >
                <span
                  className="v4-fin-lg-sw v4-fin-lg-sw--out"
                />
                Остаток <b>{compactUSD(summary.totalRemaining)}</b>
              </span>
            </div>
          </div>
        ) : (
          <SplitsRow
            items={[
              {
                key: "paid",
                n: compactUSD(summary.totalPaid),
                l: "Оплачено",
                color: "var(--v4-success-700)",
              },
              {
                key: "rem",
                n: compactUSD(summary.totalRemaining),
                l: "Остаток",
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
