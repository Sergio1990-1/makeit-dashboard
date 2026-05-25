import type { QualitySnapshot, QualityTrends } from "../../../types";
import {
  deltaVsPrev,
  duration,
  healthColor,
  healthOf,
  pct,
  snapshotSeries,
  sparklinePath,
  type Health,
} from "./utils";

interface Props {
  snapshot: QualitySnapshot;
  trends: QualityTrends | null;
}

interface KpiDef {
  key: keyof QualitySnapshot;
  label: string;
  sub?: string;
  good: number;
  bad: number;
  higherIsBetter: boolean;
  isPercent: boolean;
}

const KPIS: KpiDef[] = [
  { key: "first_pass_success_rate", label: "С первой попытки", sub: "успех с первой попытки", good: 0.8, bad: 0.6, higherIsBetter: true, isPercent: true },
  { key: "retry_rate", label: "Повторы", sub: "повторные попытки", good: 0.1, bad: 0.25, higherIsBetter: false, isPercent: true },
  { key: "error_recovery_rate", label: "Восстановление", sub: "успех после ошибок", good: 0.7, bad: 0.4, higherIsBetter: true, isPercent: true },
  { key: "qa_pass_rate", label: "Прохождение QA", sub: "пройдено проверок QA", good: 0.9, bad: 0.7, higherIsBetter: true, isPercent: true },
  { key: "rollback_rate", label: "Откаты", sub: "частота откатов", good: 0.05, bad: 0.15, higherIsBetter: false, isPercent: true },
  { key: "avg_finding_density", label: "Находки", sub: "ср. находок на задачу", good: 1.0, bad: 3.0, higherIsBetter: false, isPercent: false },
];

const SPARK_W = 88;
const SPARK_H = 24;

export function QualityKpiGrid({ snapshot, trends }: Props) {
  return (
    <div className="v4-qa-kpi-grid">
      {KPIS.map((def) => {
        const raw = snapshot[def.key] as number | null;
        const series = trends ? snapshotSeries(trends.snapshots, def.key) : [];
        const delta = deltaVsPrev(series);
        const h: Health = healthOf(raw, def.good, def.bad, def.higherIsBetter);
        const color = healthColor(h);
        const display =
          raw === null
            ? "—"
            : def.isPercent
              ? pct(raw, 0)
              : raw.toFixed(2);
        const trend = trends?.trends?.[def.key];
        const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "";
        // Trend arrow color: depends on direction × higherIsBetter
        const trendBetter =
          trend === "flat" || !trend
            ? null
            : (trend === "up") === def.higherIsBetter;
        const trendColor =
          trendBetter === null
            ? "var(--mk-ink-400)"
            : trendBetter
              ? "var(--mk-success-strong)"
              : "var(--mk-danger-strong)";
        const sparkD = series.length > 1 ? sparklinePath(series, SPARK_W, SPARK_H) : "";

        return (
          <div key={String(def.key)} className={`v4-qa-kpi v4-qa-kpi--${h}`}>
            <div className="v4-qa-kpi-h">
              <span className="v4-qa-kpi-label">{def.label}</span>
              {arrow && (
                <span className="v4-qa-kpi-trend" style={{ color: trendColor }}>
                  {arrow}
                </span>
              )}
            </div>
            <div className="v4-qa-kpi-val" style={{ color }}>
              {display}
            </div>
            {def.sub && <div className="v4-qa-kpi-sub">{def.sub}</div>}
            <div className="v4-qa-kpi-foot">
              {sparkD ? (
                <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="v4-qa-spark" aria-hidden="true">
                  <path d={sparkD} fill="none" stroke={color} strokeWidth={1.5} />
                </svg>
              ) : (
                <span className="v4-qa-spark-empty">нет истории</span>
              )}
              {delta && def.isPercent && (
                <span
                  className="v4-pl-mono v4-qa-kpi-delta"
                  style={{ color: deltaColor(delta.abs, def.higherIsBetter) }}
                  title={`vs среднее за прошлые 3 недели`}
                >
                  {delta.abs >= 0 ? "+" : ""}
                  {(delta.abs * 100).toFixed(1)}pp
                </span>
              )}
              {delta && !def.isPercent && (
                <span
                  className="v4-pl-mono v4-qa-kpi-delta"
                  style={{ color: deltaColor(delta.abs, def.higherIsBetter) }}
                  title={`vs среднее за прошлые 3 недели`}
                >
                  {delta.abs >= 0 ? "+" : ""}
                  {delta.abs.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Always-shown 7th tile for avg_duration (purely informational, no health) */}
      <div className="v4-qa-kpi v4-qa-kpi--neutral">
        <div className="v4-qa-kpi-h">
          <span className="v4-qa-kpi-label">Среднее время</span>
        </div>
        <div className="v4-qa-kpi-val">{duration(snapshot.avg_duration_sec)}</div>
        <div className="v4-qa-kpi-sub">время выполнения задачи</div>
        <div className="v4-qa-kpi-foot">
          <span className="v4-pl-mono v4-qa-kpi-delta v4-qa-kpi-delta--mute">
            {snapshot.merged_count}/{snapshot.total_issues} замержено
          </span>
        </div>
      </div>
    </div>
  );
}

function deltaColor(abs: number, higherIsBetter: boolean): string {
  const better = higherIsBetter ? abs > 0 : abs < 0;
  if (Math.abs(abs) < 0.005) return "var(--mk-ink-400)";
  return better ? "var(--mk-success-strong)" : "var(--mk-danger-strong)";
}
