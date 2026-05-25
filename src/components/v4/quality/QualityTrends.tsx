import { useMemo, useState } from "react";
import type { QualitySnapshot, QualityTrends as QualityTrendsT } from "../../../types";

interface MetricDef {
  key: keyof QualitySnapshot;
  label: string;
  color: string;
  isPercent: boolean;
  format: (v: number | null) => string;
}

const METRICS: MetricDef[] = [
  { key: "first_pass_success_rate", label: "С первой попытки", color: "var(--mk-success)", isPercent: true, format: pctFmt },
  { key: "retry_rate", label: "Повторы", color: "var(--mk-priority-p2)", isPercent: true, format: pctFmt },
  { key: "error_recovery_rate", label: "Восстановление", color: "var(--mk-priority-p3)", isPercent: true, format: pctFmt },
  { key: "qa_pass_rate", label: "Прохождение QA", color: "var(--mk-purple-500)", isPercent: true, format: pctFmt },
  { key: "rollback_rate", label: "Откаты", color: "var(--mk-priority-p1)", isPercent: true, format: pctFmt },
  { key: "avg_finding_density", label: "Находки", color: "var(--mk-sky-500)", isPercent: false, format: (v) => v === null ? "—" : v.toFixed(2) },
];

const PERIODS = [4, 8, 12] as const;

function pctFmt(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

const SVG_W = 720;
const SVG_H = 240;
const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
const CHART_W = SVG_W - PAD.left - PAD.right;
const CHART_H = SVG_H - PAD.top - PAD.bottom;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

interface Props {
  trends: QualityTrendsT;
}

export function QualityTrendsV4({ trends }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    () => new Set(["first_pass_success_rate", "retry_rate"]),
  );
  const [weeks, setWeeks] = useState<number>(12);

  const snapshots = useMemo(() => {
    const all = trends.snapshots;
    return all.length > weeks ? all.slice(all.length - weeks) : all;
  }, [trends.snapshots, weeks]);

  function toggleMetric(key: string) {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  if (snapshots.length === 0) {
    return <div className="v4-empty">Нет данных для графика. Запустите pipeline.</div>;
  }

  const selectedDefs = METRICS.filter((m) => activeMetrics.has(String(m.key)));
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

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + ((yMax - yMin) * i) / 4);
  }

  const formatY = (v: number) => (allPercent ? `${(v * 100).toFixed(0)}%` : v.toFixed(1));

  return (
    <div className="v4-qa-trends">
      <div className="v4-qa-trends-controls">
        <div className="v4-pillgrp">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={weeks === p ? "is-active" : ""}
              onClick={() => setWeeks(p)}
            >
              {p}н
            </button>
          ))}
        </div>
        <div className="v4-qa-metric-toggles">
          {METRICS.map((m) => {
            const on = activeMetrics.has(String(m.key));
            return (
              <button
                key={String(m.key)}
                type="button"
                className={`v4-qa-metric-btn ${on ? "is-active" : ""}`}
                style={on ? { borderColor: m.color, color: m.color } : undefined}
                onClick={() => toggleMetric(String(m.key))}
                aria-pressed={on}
              >
                <span
                  className="v4-qa-metric-dot"
                  style={{ background: on ? m.color : "var(--v4-line-strong)" }}
                />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="v4-qa-svg" role="img" aria-label="Quality KPI trends">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(t)} x2={SVG_W - PAD.right} y2={toY(t)} className="v4-qa-grid-line" />
            <text x={PAD.left - 6} y={toY(t) + 4} className="v4-qa-y-label">
              {formatY(t)}
            </text>
          </g>
        ))}
        {snapshots.map((s, i) => {
          if (snapshots.length > 8 && i % 2 !== 0 && i !== snapshots.length - 1) return null;
          return (
            <text key={i} x={toX(i)} y={SVG_H - 8} className="v4-qa-x-label">
              {shortDate(s.period_start)}
            </text>
          );
        })}
        {selectedDefs.map((m) => {
          const points: { x: number; y: number; val: number }[] = [];
          snapshots.forEach((s, i) => {
            const v = s[m.key] as number | null;
            if (v !== null) points.push({ x: toX(i), y: toY(v), val: v });
          });
          if (points.length === 0) return null;
          const pathD = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(" ");
          return (
            <g key={String(m.key)}>
              <path d={pathD} fill="none" stroke={m.color} strokeWidth={2} />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={3} fill={m.color} />
                  <title>
                    {m.label}: {m.format(p.val)}
                  </title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {Object.keys(trends.trends).length > 0 && (
        <div className="v4-qa-trend-summary">
          {selectedDefs.map((m) => {
            const dir = trends.trends[m.key];
            if (!dir) return null;
            const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
            return (
              <span
                key={String(m.key)}
                className="v4-qa-trend-tag"
                style={{ borderColor: m.color, color: m.color }}
              >
                {arrow} {m.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
