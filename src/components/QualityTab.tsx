import { useEffect } from "react";
import { useQuality } from "../hooks/useQuality";
import { QualityTrendsChart } from "./QualityTrendsChart";
import { QualityFindingsChart, QualityErrorsChart } from "./QualityBarCharts";
import { PendingChangesList, TuningHistory } from "./QualityPendingChanges";
import { RetroList, RetroDetailView } from "./QualityRetros";
import { QualityAutoTunerConfig } from "./QualityAutoTunerConfig";
import { QualityLessonsViewer } from "./QualityLessonsViewer";
import type { QualitySnapshot } from "../types";

// Project slug catalog — hardcoded to match the pipeline config. Keep in
// sync with ~/.makeit-pipeline/config.yaml `projects[]`.
const PROJECT_FILTER_OPTIONS = [
  { value: null, label: "Все проекты" },
  { value: "moliyakg", label: "moliyakg" },
  { value: "mankassa-app", label: "mankassa-app" },
  { value: "Sewing-ERP", label: "Sewing-ERP" },
  { value: "solotax-kg", label: "solotax-kg" },
  { value: "makeit-pipeline", label: "makeit-pipeline" },
] as const;

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
    tuningHistory,
    retros,
    selectedRetro,
    retroRunning,
    actionLoading,
    qualityConfig,
    lessonsByProject,
    projectFilter,
    tierFilter,
    refresh,
    approve,
    reject,
    rollback,
    startRetro,
    loadRetroDetail,
    clearRetroDetail,
    saveQualityConfig,
    loadLessons,
    previewChange,
    bulkReject,
    setProjectFilter,
    setTierFilter,
  } = useQuality();

  // Refetch whenever the project/tier filter changes so the list, history,
  // config panel and lessons viewer all stay in sync.
  useEffect(() => {
    refresh(projectFilter ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, tierFilter]);

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
            <select
              className="qk-project-filter"
              value={projectFilter ?? ""}
              onChange={(e) => setProjectFilter(e.target.value || null)}
              aria-label="Фильтр по проекту"
            >
              {PROJECT_FILTER_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
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
        <div className="qbc-row span-12">
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

      {/* Phase F2: AutoTuner config panel */}
      <QualityAutoTunerConfig config={qualityConfig} onSave={saveQualityConfig} />

      {/* AutoTuner: Pending Changes + History */}
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title">
          AutoTuner
          {pendingChanges.length > 0 && (
            <span className="qk-pending-badge qp-inline-badge">
              {pendingChanges.length} ожидает
            </span>
          )}
        </div>
        <PendingChangesList
          changes={pendingChanges}
          actionLoading={actionLoading}
          onApprove={approve}
          onReject={reject}
          loadPreview={previewChange}
          onBulkReject={bulkReject}
          tierFilter={tierFilter}
          onTierFilterChange={setTierFilter}
        />
        {tuningHistory.length > 0 && (
          <>
            <div className="qp-history-title">История изменений</div>
            <TuningHistory
              history={tuningHistory}
              actionLoading={actionLoading}
              onRollback={rollback}
            />
          </>
        )}
      </div>

      {/* Phase F2: Lessons Viewer (shown when a project is filtered in) */}
      <QualityLessonsViewer
        projectSlug={projectFilter}
        cache={lessonsByProject}
        loadLessons={loadLessons}
      />

      {/* Retrospectives */}
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title">Ретроспективы</div>
        {selectedRetro ? (
          <RetroDetailView detail={selectedRetro} onBack={clearRetroDetail} />
        ) : (
          <RetroList
            retros={retros}
            retroRunning={retroRunning}
            onSelect={loadRetroDetail}
            onRunRetro={startRetro}
          />
        )}
      </div>
    </>
  );
}
