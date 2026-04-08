import { useState, useMemo } from "react";
import type { QualitySnapshot, QualityTrends } from "../types";

// ── KPI metric definitions ──────────────────────────────────────────

interface MetricDef {
  key: keyof QualitySnapshot;
  label: string;
  color: string;
  format: (v: number | null) => string;
  isPercent: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: "first_pass_success_rate",
    label: "First Pass Rate",
    color: "var(--green-500)",
    format: pct,
    isPercent: true,
  },
  {
    key: "retry_rate",
    label: "Retry Rate",
    color: "var(--yellow-500)",
    format: pct,
    isPercent: true,
  },
  {
    key: "error_recovery_rate",
    label: "Error Recovery",
    color: "var(--blue-500)",
    format: pct,
    isPercent: true,
  },
  {
    key: "qa_pass_rate",
    label: "QA Pass Rate",
    color: "var(--purple-500)",
    format: pct,
    isPercent: true,
  },
  {
    key: "rollback_rate",
    label: "Rollback Rate",
    color: "var(--red-500)",
    format: pct,
    isPercent: true,
  },
  {
    key: "avg_finding_density",
    label: "Finding Density",
    color: "var(--cyan-500)",
    format: (v) => (v === null ? "—" : v.toFixed(2)),
    isPercent: false,
  },
];

const PERIODS = [4, 8, 12] as const;

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

// ── Chart geometry ──────────────────────────────────────────────────

const SVG_W = 600;
const SVG_H = 260;
const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
const CHART_W = SVG_W - PAD.left - PAD.right;
const CHART_H = SVG_H - PAD.top - PAD.bottom;

function shortDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, "0");
  const mon = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}.${mon}`;
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  trends: QualityTrends;
}

export function QualityTrendsChart({ trends }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    () => new Set(["first_pass_success_rate", "retry_rate"]),
  );
  const [weeks, setWeeks] = useState<number>(12);

  const snapshots = useMemo(() => {
    const all = trends.snapshots;
    return all.length > weeks ? all.slice(all.length - weeks) : all;
  }, [trends.snapshots, weeks]);

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (snapshots.length === 0) {
    return (
      <div className="qt-chart-empty">
        Нет данных для графика трендов. Нужно минимум 1 неделя данных.
      </div>
    );
  }

  // Compute Y-axis bounds across all active metrics
  const selectedDefs = METRICS.filter((m) => activeMetrics.has(m.key));
  const allPercent = selectedDefs.every((m) => m.isPercent);

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const snap of snapshots) {
    for (const m of selectedDefs) {
      const v = snap[m.key] as number | null;
      if (v !== null) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
  }
  if (!isFinite(yMin)) {
    yMin = 0;
    yMax = 1;
  }

  // Add padding to Y range
  const yRange = yMax - yMin || 1;
  yMin = Math.max(0, yMin - yRange * 0.1);
  yMax = yMax + yRange * 0.1;
  if (allPercent) {
    yMin = Math.max(0, yMin);
    yMax = Math.min(1, yMax);
    if (yMax - yMin < 0.1) {
      yMin = Math.max(0, yMax - 0.5);
      yMax = Math.min(1, yMin + 0.5);
    }
  }

  const xStep = snapshots.length > 1 ? CHART_W / (snapshots.length - 1) : CHART_W;
  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + CHART_H - ((v - yMin) / (yMax - yMin)) * CHART_H;

  // Y-axis ticks (5 ticks)
  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + ((yMax - yMin) * i) / 4);
  }

  const formatY = (v: number) => (allPercent ? `${(v * 100).toFixed(0)}%` : v.toFixed(1));

  return (
    <div className="qt-chart-wrap">
      {/* Period selector */}
      <div className="qt-chart-controls">
        <div className="qt-period-selector">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`qt-period-btn ${weeks === p ? "qt-period-btn--active" : ""}`}
              onClick={() => setWeeks(p)}
            >
              {p}н
            </button>
          ))}
        </div>

        {/* Metric toggles */}
        <div className="qt-metric-toggles">
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={`qt-metric-btn ${activeMetrics.has(m.key) ? "qt-metric-btn--active" : ""}`}
              style={
                activeMetrics.has(m.key)
                  ? { borderColor: m.color, color: m.color }
                  : undefined
              }
              onClick={() => toggleMetric(m.key)}
            >
              <span
                className="qt-metric-dot"
                style={{ background: activeMetrics.has(m.key) ? m.color : "var(--color-border)" }}
              />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="qt-svg"
        role="img"
        aria-label="Quality KPI trends chart"
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={toY(t)}
              x2={SVG_W - PAD.right}
              y2={toY(t)}
              className="qt-grid-line"
            />
            <text x={PAD.left - 6} y={toY(t) + 4} className="qt-y-label">
              {formatY(t)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {snapshots.map((s, i) => {
          // Show every label for <= 8 points, else every other
          if (snapshots.length > 8 && i % 2 !== 0 && i !== snapshots.length - 1) return null;
          return (
            <text
              key={i}
              x={toX(i)}
              y={SVG_H - 8}
              className="qt-x-label"
            >
              {shortDate(s.period_start)}
            </text>
          );
        })}

        {/* Data lines + dots */}
        {selectedDefs.map((m) => {
          const points: { x: number; y: number; val: number }[] = [];
          snapshots.forEach((s, i) => {
            const v = s[m.key] as number | null;
            if (v !== null) {
              points.push({ x: toX(i), y: toY(v), val: v });
            }
          });
          if (points.length === 0) return null;

          const pathD = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(" ");

          return (
            <g key={m.key}>
              <path d={pathD} fill="none" stroke={m.color} strokeWidth={2} className="qt-line" />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={3.5} fill={m.color} className="qt-dot" />
                  <title>
                    {m.label}: {m.format(p.val)}
                  </title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Trend indicators */}
      {Object.keys(trends.trends).length > 0 && (
        <div className="qt-trend-summary">
          {selectedDefs.map((m) => {
            const dir = trends.trends[m.key];
            if (!dir) return null;
            const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
            const cls =
              dir === "up" ? "qt-trend--up" : dir === "down" ? "qt-trend--down" : "qt-trend--flat";
            return (
              <span key={m.key} className={`qt-trend-tag ${cls}`} style={{ borderColor: m.color }}>
                {arrow} {m.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
