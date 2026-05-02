import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectData } from "../../types";
import { dailyClosedLastN, movingAverage } from "../../utils/dashboardMetrics";
import { ruDow, ruMonthShort } from "./milestones/utils";

interface Props {
  projects: ProjectData[];
}

const W = 960;
const H = 320;
const PAD_L = 16;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 28;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;
const BAR_GAP = 4;

function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length < 2) return "";
  const out = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0x, p0y] = points[i - 1] ?? points[i];
    const [p1x, p1y] = points[i];
    const [p2x, p2y] = points[i + 1];
    const [p3x, p3y] = points[i + 2] ?? points[i + 1];
    const cp1x = p1x + (p2x - p0x) / 6;
    const cp1y = p1y + (p2y - p0y) / 6;
    const cp2x = p2x - (p3x - p1x) / 6;
    const cp2y = p2y - (p3y - p1y) / 6;
    out.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`);
  }
  return out.join(" ");
}

export function ClosedChart30d({ projects }: Props) {
  const { daily, total, peak, peakIdx, ma } = useMemo(() => {
    const daily = dailyClosedLastN(projects, 30);
    const total = daily.reduce((s, d) => s + d.count, 0);
    let peak = 0;
    let peakIdx = 0;
    daily.forEach((d, i) => {
      if (d.count > peak) {
        peak = d.count;
        peakIdx = i;
      }
    });
    const ma = movingAverage(
      daily.map((d) => d.count),
      10
    );
    return { daily, total, peak, peakIdx, ma };
  }, [projects]);

  const max = Math.max(peak, ...ma, 1) * 1.1;
  const barW = (INNER_W - BAR_GAP * (daily.length - 1)) / daily.length;
  const xOf = (i: number) => PAD_L + i * (barW + BAR_GAP);
  const cxOf = (i: number) => xOf(i) + barW / 2;
  const yOf = (v: number) => PAD_T + INNER_H - (v / max) * INNER_H;

  // 0→1 grow animation
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 900;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      setT(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width;
    if (x < PAD_L || x > W - PAD_R) {
      setHover(null);
      return;
    }
    const idx = Math.max(
      0,
      Math.min(daily.length - 1, Math.round((x - PAD_L) / (barW + BAR_GAP)))
    );
    setHover(idx);
  };

  // trend (smooth bezier)
  const trendPts = ma.map(
    (v, i) => [cxOf(i), yOf(v)] as readonly [number, number]
  );
  const trendD = smoothPath(trendPts);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [trendLen, setTrendLen] = useState(0);
  useEffect(() => {
    if (pathRef.current) setTrendLen(pathRef.current.getTotalLength());
  }, [trendD]);

  const grid = [0, 1, 2, 3].map((i) => PAD_T + (INNER_H / 3) * i);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${ruMonthShort(d)}.`;
  };
  const peakDateStr = daily[peakIdx] ? fmtDate(daily[peakIdx].day) : "—";

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Закрыто за 30 дней <span className="v4-tag">по дням</span>
        </div>
        <div className="v4-panel-meta">всего {total}</div>
      </div>
      <div className="v4-closed-chart">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ display: "block", cursor: "crosshair" }}
        >
          {/* gridlines (3 dotted + 1 solid baseline) */}
          {grid.map((y, i) => (
            <line
              key={i}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y}
              y2={y}
              stroke="var(--v4-line-soft)"
              strokeWidth="1"
              strokeDasharray={i === grid.length - 1 ? "0" : "2 4"}
            />
          ))}

          {/* hover full-height column highlight */}
          {hover !== null && (
            <rect
              x={xOf(hover) - 2}
              y={PAD_T - 6}
              width={barW + 4}
              height={INNER_H + 12}
              fill="var(--v4-accent-100)"
              opacity="0.45"
              rx="4"
            />
          )}

          {/* bars */}
          {daily.map((d, i) => {
            const fullH = (d.count / max) * INNER_H;
            const h = Math.max(d.count > 0 ? 2 : 0, fullH * t);
            const y = PAD_T + INNER_H - h;
            const isPeak = i === peakIdx && peak > 0;
            const isHover = hover === i;
            const fill =
              isHover || isPeak
                ? "var(--v4-accent-700)"
                : "var(--v4-accent-500)";
            return (
              <g key={d.day}>
                <rect
                  x={xOf(i)}
                  y={y}
                  width={barW}
                  height={h}
                  rx="3"
                  fill={fill}
                  opacity={hover === null || isHover ? 1 : 0.55}
                  style={{ transition: "opacity .15s, fill .15s" }}
                />
                {isPeak && t > 0.95 && !isHover && (
                  <circle
                    cx={cxOf(i)}
                    cy={y - 7}
                    r="3"
                    fill="var(--v4-accent-700)"
                  />
                )}
              </g>
            );
          })}

          {/* trend line — smooth, animated reveal */}
          {trendD && (
            <>
              <path
                ref={pathRef}
                d={trendD}
                fill="none"
                stroke="var(--v4-success-500)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={trendLen ? `${trendLen} ${trendLen}` : undefined}
                strokeDashoffset={trendLen ? trendLen * (1 - t) : 0}
                style={{ filter: "drop-shadow(0 1px 0 rgba(18,183,106,0.15))" }}
              />
              <path
                d={trendD}
                fill="none"
                stroke="var(--v4-paper)"
                strokeWidth="2.5"
                strokeDasharray="0 7 4 0"
                opacity={t > 0.6 ? (t - 0.6) / 0.4 : 0}
                style={{ transition: "opacity .2s" }}
              />
            </>
          )}

          {/* X-axis: every 5th day */}
          {daily.map((d, i) =>
            i % 5 === 0 || i === daily.length - 1 ? (
              <text
                key={`x-${d.day}`}
                x={cxOf(i)}
                y={H - 10}
                textAnchor="middle"
                fontFamily="var(--v4-mono)"
                fontSize="10"
                fill="var(--v4-ink-400)"
              >
                {new Date(d.day).getDate()}
              </text>
            ) : null
          )}

          {/* hover bar value chip */}
          {hover !== null && daily[hover].count > 0 && (() => {
            const v = daily[hover].count;
            const cx = cxOf(hover);
            const fullH = (v / max) * INNER_H;
            const y = PAD_T + INNER_H - fullH;
            return (
              <g pointerEvents="none">
                <line
                  x1={cx}
                  x2={cx}
                  y1={y - 4}
                  y2={PAD_T + INNER_H}
                  stroke="var(--v4-accent-700)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.5"
                />
                <rect
                  x={cx - 22}
                  y={y - 26}
                  width="44"
                  height="20"
                  rx="4"
                  fill="var(--v4-ink-900)"
                />
                <text
                  x={cx}
                  y={y - 12}
                  textAnchor="middle"
                  fontFamily="var(--v4-mono)"
                  fontSize="11"
                  fontWeight="700"
                  fill="#fff"
                >
                  {v}
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Tooltip card on hover */}
        {hover !== null && (() => {
          const dRow = daily[hover];
          const date = new Date(dRow.day);
          const v = dRow.count;
          const tr = Math.round(ma[hover] ?? 0);
          const delta = v - tr;
          const cx = cxOf(hover);
          const pctX = (cx / W) * 100;
          const flipLeft = pctX > 70;
          return (
            <div
              className="v4-closed-tip"
              style={{
                left: `calc(${pctX}% + 20px - ${flipLeft ? "200px" : "0px"})`,
              }}
            >
              <div className="v4-closed-tip-l">
                {ruDow(date)}, {date.getDate()} {ruMonthShort(date)}.{" "}
                {date.getFullYear()}
              </div>
              <div className="v4-closed-tip-row">
                <span className="v4-closed-tip-v">{v}</span>
                <span className="v4-closed-tip-u">
                  {v === 1 ? "задача закрыта" : "задач закрыто"}
                </span>
              </div>
              <div className="v4-closed-tip-foot">
                <span>тренд (10-дн)</span>
                <span className="v4-closed-tip-tr">{tr}</span>
              </div>
              <div className="v4-closed-tip-foot v4-closed-tip-foot--tight">
                <span>Δ к тренду</span>
                <span
                  className={
                    delta >= 0
                      ? "v4-closed-tip-delta v4-closed-tip-delta--pos"
                      : "v4-closed-tip-delta v4-closed-tip-delta--neg"
                  }
                >
                  {delta >= 0 ? "+" : ""}
                  {delta}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
      <div className="v4-cc-legend">
        <span className="v4-cc-lg">
          <span
            className="v4-cc-sw"
            style={{ background: "var(--v4-accent-500)" }}
          />
          Закрыто (шт.)
        </span>
        <span className="v4-cc-lg">
          <svg width="22" height="6">
            <line
              x1="0"
              y1="3"
              x2="22"
              y2="3"
              stroke="var(--v4-success-500)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          Тренд (10-дн скользящее)
        </span>
        <span className="v4-cc-peak">
          пик: <b>{peakDateStr}</b> · <b>{peak} шт.</b>
        </span>
      </div>
    </div>
  );
}
