import { useQuality } from "../hooks/useQuality";
import { QualityTrendsChart } from "./QualityTrendsChart";
import { QualityFindingsChart, QualityErrorsChart } from "./QualityBarCharts";
import type { QualitySnapshot } from "../types";

/** Color class based on value + thresholds (green/yellow/red). */
function kpiColor(value: number | null, good: number, bad: number, higher_is_better = true): string {
  if (value === null) return "";
  if (higher_is_better) {
    if (value >= good) return "qk-good";
    if (value >= bad) return "qk-warn";
    return "qk-bad";
  }
  // lower is better
  if (value <= good) return "qk-good";
  if (value <= bad) return "qk-warn";
  return "qk-bad";
}

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function duration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}с`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)}м`;
  return `${(sec / 3600).toFixed(1)}ч`;
}

interface KpiDef {
  label: string;
  value: string;
  color: string;
  sub?: string;
}

function buildKpis(s: QualitySnapshot): KpiDef[] {
  return [
    {
      label: "First Pass Rate",
      value: pct(s.first_pass_success_rate),
      color: kpiColor(s.first_pass_success_rate, 0.8, 0.6),
      sub: "Успех с первой попытки",
    },
    {
      label: "Retry Rate",
      value: pct(s.retry_rate),
      color: kpiColor(s.retry_rate, 0.1, 0.25, false),
      sub: "Повторные попытки",
    },
    {
      label: "Error Recovery",
      value: pct(s.error_recovery_rate),
      color: kpiColor(s.error_recovery_rate, 0.7, 0.4),
      sub: "Восстановление после ошибок",
    },
    {
      label: "QA Pass Rate",
      value: pct(s.qa_pass_rate),
      color: kpiColor(s.qa_pass_rate, 0.9, 0.7),
      sub: "Прохождение QA",
    },
    {
      label: "Rollback Rate",
      value: pct(s.rollback_rate),
      color: kpiColor(s.rollback_rate, 0.05, 0.15, false),
      sub: "Частота откатов",
    },
    {
      label: "Finding Density",
      value: s.avg_finding_density.toFixed(2),
      color: kpiColor(s.avg_finding_density, 1.0, 3.0, false),
      sub: "Среднее findings/задачу",
    },
    {
      label: "Avg Duration",
      value: duration(s.avg_duration_sec),
      color: "",
      sub: "Среднее время выполнения",
    },
    {
      label: "Merged / Total",
      value: `${s.merged_count} / ${s.total_issues}`,
      color: "",
      sub: `${s.period_start} — ${s.period_end}`,
    },
  ];
}

export function QualityTab() {
  const {
    available,
    loading,
    error,
    snapshot,
    trends,
    findings,
    errors: errorsData,
    pendingChanges,
    retros,
    refresh,
  } = useQuality();

  if (loading) {
    return (
      <div className="bento-panel span-12 panel-projects">
        <div className="audit-spinner" />
        Загрузка Quality Dashboard...
      </div>
    );
  }

  if (available === false) {
    return (
      <div className="bento-panel span-12 panel-projects audit-offline">
        <div className="audit-offline-card">
          <h2 className="audit-offline-title">Quality Dashboard</h2>
          <p className="audit-offline-desc">
            Не удалось подключиться к Pipeline API. Quality endpoints являются частью makeit-pipeline.
          </p>
          <pre className="audit-offline-code">{`# Pipeline Mac:\nlaunchctl start com.makeit.pipeline-api\n\n# Или проверьте туннель:\nlaunchctl start com.makeit.pipeline-tunnel`}</pre>
          <button className="btn btn-primary audit-offline-btn" onClick={() => refresh()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const kpis = snapshot ? buildKpis(snapshot) : [];

  return (
    <>
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title">
          <div>
            Quality Dashboard
            <span className="audit-header-sub">Метрики качества pipeline-агента</span>
          </div>
          <div className="qk-header-actions">
            {pendingChanges.length > 0 && (
              <span className="qk-pending-badge">{pendingChanges.length} pending</span>
            )}
            {retros.length > 0 && (
              <span className="qk-retro-badge">{retros.length} retros</span>
            )}
            <button className="btn btn-sm audit-refresh-btn" onClick={() => refresh()}>
              ↻ Обновить
            </button>
          </div>
        </div>

        {error && <div className="qk-error">{error}</div>}

        {snapshot ? (
          <div className="qk-grid">
            {kpis.map((k) => (
              <div key={k.label} className={`qk-card ${k.color}`} role="group" aria-label={k.label}>
                <div className="qk-card-value">{k.value}</div>
                <div className="qk-card-label">{k.label}</div>
                {k.sub && <div className="qk-card-sub">{k.sub}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="qk-empty">
            Нет данных за текущую неделю. Запустите pipeline для генерации метрик.
          </div>
        )}
      </div>

      {/* Trends chart */}
      {trends && trends.snapshots.length > 0 && (
        <div className="bento-panel span-12 panel-projects">
          <div className="bento-panel-title">Тренды KPI</div>
          <QualityTrendsChart trends={trends} />
        </div>
      )}

      {/* Findings & Errors bar charts */}
      {(findings || errorsData) && (
        <div className="qbc-row">
          {findings && Object.keys(findings.categories).length > 0 && (
            <div className="bento-panel span-6 panel-projects">
              <div className="bento-panel-title">Findings по категориям</div>
              <QualityFindingsChart data={findings} />
            </div>
          )}
          {errorsData && Object.keys(errorsData.classes).length > 0 && (
            <div className="bento-panel span-6 panel-projects">
              <div className="bento-panel-title">Ошибки по классам</div>
              <QualityErrorsChart data={errorsData} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
