import { useRef, useState } from "react";
import type { HealthTrend } from "../../../types/health";

interface Props {
  trend: HealthTrend;
}

const W = 320;
const H = 56;

// Sparkline with hover tooltip + animated end dot pulse. Stroke and fill
// colours come from the trend direction (up=green, down=red, flat=neutral).
// Animation timings match the design system (see ph-spark-* in v4-health.css).
export function FancySpark({ trend }: Props) {
  const points = trend.points.length > 0 ? trend.points : [0];
  const min = Math.min(...points) - 2;
  const max = Math.max(...points) + 2;
  const span = max - min || 1;
  const stepX = points.length > 1 ? W / (points.length - 1) : 0;
  const coords: [number, number][] = points.map((p, i) => [
    points.length > 1 ? i * stepX : W / 2,
    H - ((p - min) / span) * H,
  ]);
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  const stroke =
    trend.direction === "up"
      ? "var(--v4-success-500)"
      : trend.direction === "down"
        ? "var(--v4-danger-500)"
        : "var(--v4-ink-400)";
  const fill =
    trend.direction === "up"
      ? "color-mix(in srgb, var(--mk-success) 12%, transparent)"
      : trend.direction === "down"
        ? "color-mix(in srgb, var(--mk-danger) 10%, transparent)"
        : "color-mix(in srgb, var(--mk-ink-400) 10%, transparent)";
  const last = coords[coords.length - 1];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || coords.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let bestD = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c[0] - x);
      if (d < bestD) {
        bestD = d;
        nearest = i;
      }
    });
    setHover(nearest);
  };
  const onLeave = () => setHover(null);

  const dayLabel = (i: number) => {
    const daysAgo = points.length - 1 - i;
    if (daysAgo === 0) return "сейчас";
    if (daysAgo === 1) return "прошлый скан";
    return `${daysAgo} скан${daysAgo > 4 ? "ов" : daysAgo > 1 ? "а" : ""} назад`;
  };

  return (
    <div className="ph-spark-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="ph-spark-svg"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <path className="ph-spark-area" d={area} fill={fill} />
        <path
          className="ph-spark-line"
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r="4" fill={stroke} className="ph-spark-end" />
        <circle cx={last[0]} cy={last[1]} r="8" fill={stroke} opacity="0.18" className="ph-spark-end-pulse" />
        {hover != null && (
          <g className="ph-spark-hover">
            <line
              x1={coords[hover][0]}
              x2={coords[hover][0]}
              y1="0"
              y2={H}
              stroke="var(--v4-ink-300)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={coords[hover][0]} cy={coords[hover][1]} r="4" fill="#fff" stroke={stroke} strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="ph-spark-tip"
          style={{ left: `${(coords[hover][0] / W) * 100}%` }}
        >
          <span className="v4-mono">{points[hover]}</span>
          <span className="ph-spark-tip-day">{dayLabel(hover)}</span>
        </div>
      )}
    </div>
  );
}
