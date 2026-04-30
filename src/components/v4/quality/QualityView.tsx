import { useState } from "react";
import { useQuality } from "../../../hooks/useQuality";
import { QualityHero } from "./QualityHero";
import { QualityKpiStrip } from "./QualityKpiStrip";
import { QualityKpiGrid } from "./QualityKpiGrid";
import { QualityTrendsV4 } from "./QualityTrends";
import { FindingsBarChart, ErrorsBarChart } from "./QualityBarCharts";
import { AutoTunerConfigCard } from "./AutoTunerConfigCard";
import { PendingChangesPanel } from "./PendingChangesPanel";
import { TuningHistoryPanel } from "./TuningHistoryPanel";
import { RetroListV4, RetroDetailV4 } from "./RetrosPanel";
import { LessonsViewer } from "./LessonsViewer";

const PROJECT_OPTIONS = [
  { value: null, label: "Все проекты" },
  { value: "moliyakg", label: "moliyakg" },
  { value: "mankassa-app", label: "mankassa-app" },
  { value: "Sewing-ERP", label: "Sewing-ERP" },
  { value: "solotax-kg", label: "solotax-kg" },
  { value: "makeit-pipeline", label: "makeit-pipeline" },
] as const;

export function QualityView() {
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

  const [showLessons, setShowLessons] = useState(false);

  if (loading && !snapshot) {
    return (
      <div className="v4-content">
        <div className="v4-ph">
          <div>
            <h1>Quality</h1>
            <div className="v4-sub">Метрики качества pipeline-агента</div>
          </div>
        </div>
        <div className="v4-empty">Загрузка метрик качества…</div>
      </div>
    );
  }

  if (available === false) {
    return (
      <div className="v4-content">
        <div className="v4-ph">
          <div>
            <h1>Quality</h1>
            <div className="v4-sub">Pipeline API офлайн</div>
          </div>
          <div className="v4-ph-right">
            <button type="button" className="v4-btn v4-btn--pri" onClick={() => refresh()}>
              Повторить
            </button>
          </div>
        </div>
        <div className="v4-panel">
          <div className="v4-empty">
            Не удалось подключиться к Pipeline API. Эндпоинты качества — часть makeit-pipeline.
          </div>
          <pre className="v4-qa-offline-cmd">
{`# Pipeline Mac:
launchctl start com.makeit.pipeline-api

# Или туннель:
launchctl start com.makeit.pipeline-tunnel`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Quality</h1>
          <div className="v4-sub">
            Метрики pipeline-агента
            {snapshot?.period_start && snapshot?.period_end && (
              <>
                {" · "}
                <span className="v4-pl-mono">
                  {snapshot.period_start} — {snapshot.period_end}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="v4-ph-right">
          <select
            className="v4-pl-input"
            value={projectFilter ?? ""}
            onChange={(e) => setProjectFilter(e.target.value || null)}
            aria-label="Фильтр по проекту"
          >
            {PROJECT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <QualityHero
        snapshot={snapshot}
        pendingCount={pendingChanges.length}
        retroRunning={retroRunning}
        onRunRetro={() => void startRetro()}
        onRefresh={() => refresh()}
      />

      {error && <div className="v4-error" style={{ marginTop: 14 }}>{error}</div>}

      <QualityKpiStrip
        snapshot={snapshot}
        pendingChanges={pendingChanges}
        retros={retros}
      />

      {snapshot ? (
        <QualityKpiGrid snapshot={snapshot} trends={trends} />
      ) : (
        <div className="v4-panel">
          <div className="v4-empty">
            Нет snapshot за текущий период. Запустите pipeline для генерации метрик.
          </div>
        </div>
      )}

      {trends && trends.snapshots.length > 0 && (
        <div className="v4-panel" style={{ marginTop: 14 }}>
          <div className="v4-panel-h">
            <div className="v4-panel-t">Тренды KPI</div>
            <div className="v4-pl-mono v4-qa-text-muted">
              {trends.snapshots.length} {trends.snapshots.length === 1 ? "неделя" : "недель"}
            </div>
          </div>
          <div className="v4-qa-trends-body">
            <QualityTrendsV4 trends={trends} />
          </div>
        </div>
      )}

      {(findings || errorsData) && (
        <div className="v4-grid" style={{ marginTop: 14 }}>
          <div className="v4-panel">
            <div className="v4-panel-h">
              <div className="v4-panel-t">Находки по категориям</div>
            </div>
            <div className="v4-qa-bars-body">
              {findings && Object.keys(findings.categories).length > 0 ? (
                <FindingsBarChart data={findings} />
              ) : (
                <div className="v4-empty">Нет находок за период.</div>
              )}
            </div>
          </div>
          <div className="v4-panel">
            <div className="v4-panel-h">
              <div className="v4-panel-t">Ошибки по классам</div>
            </div>
            <div className="v4-qa-bars-body">
              {errorsData && Object.keys(errorsData.classes).length > 0 ? (
                <ErrorsBarChart data={errorsData} />
              ) : (
                <div className="v4-empty">Нет ошибок за период.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <AutoTunerConfigCard config={qualityConfig} onSave={saveQualityConfig} />
      </div>

      <div style={{ marginTop: 14 }}>
        <PendingChangesPanel
          changes={pendingChanges}
          actionLoading={actionLoading}
          onApprove={approve}
          onReject={reject}
          loadPreview={previewChange}
          onBulkReject={bulkReject}
          tierFilter={tierFilter}
          onTierFilterChange={setTierFilter}
        />
      </div>

      {tuningHistory.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <TuningHistoryPanel
            history={tuningHistory}
            actionLoading={actionLoading}
            onRollback={rollback}
          />
        </div>
      )}

      <div className="v4-panel" style={{ marginTop: 14 }}>
        <div className="v4-panel-h">
          <div className="v4-panel-t">
            Ретроспективы
            {retros.length > 0 && (
              <span className="v4-tag" style={{ marginLeft: 8 }}>
                {retros.length}
              </span>
            )}
          </div>
        </div>
        <div className="v4-qa-retros-body">
          {selectedRetro ? (
            <RetroDetailV4 detail={selectedRetro} onBack={clearRetroDetail} />
          ) : (
            <RetroListV4
              retros={retros}
              retroRunning={retroRunning}
              onSelect={loadRetroDetail}
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="v4-qa-lessons-toggle">
          <button
            type="button"
            className="v4-linkbtn"
            onClick={() => setShowLessons((v) => !v)}
            aria-expanded={showLessons}
          >
            {showLessons ? "▾" : "▸"} Файлы уроков (только чтение)
          </button>
        </div>
        {showLessons && (
          <LessonsViewer
            projectSlug={projectFilter}
            cache={lessonsByProject}
            loadLessons={loadLessons}
          />
        )}
      </div>
    </div>
  );
}
