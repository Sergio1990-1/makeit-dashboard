import { useState } from "react";
import { useCodexQuality } from "../../hooks/useCodexQuality";
import type { PeriodMode, AnnotationCreatePayload } from "../../types/quality";
import { QualitySummaryPanel } from "./QualitySummaryPanel";
import { QualityProjectGrid } from "./QualityProjectGrid";
import { QualityStaleBanner } from "./QualityStaleBanner";
import { AnnotationModal } from "./AnnotationModal";
import { createAnnotation } from "../../utils/codex-quality";
import "../../styles/v4-quality.css";

export function QualityTab() {
  const { data, annotations, loading, error, unavailable, isStale, refresh, reloadAnnotations } = useCodexQuality();
  const [mode, setMode] = useState<PeriodMode>("12w");
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddAnnotation = async (p: AnnotationCreatePayload) => {
    await createAnnotation(p);
    await reloadAnnotations();
  };

  if (loading && !data) return <div className="v4-quality-tab">Загрузка…</div>;
  if (unavailable) {
    // Sweep aggregate (/data/codex-quality.json) hasn't been published yet —
    // either the GitHub Actions workflow hasn't run for the first time, or
    // the publish step failed and nginx is serving its SPA fallback. The
    // annotations mini-API is independent (separate VPS service), so we
    // still surface "+ событие" — users can pre-seed deploy/skill events
    // even before the first chart appears.
    return (
      <div className="v4-quality-tab page">
        <div className="pageH">
          <div>
            <h1>Качество кода</h1>
            <div className="sub">
              Доля PR с критическими/высокими замечаниями <b>chatgpt-codex-connector[bot]</b> от общего числа merged PR · события на временной оси
            </div>
          </div>
          <div className="ctrls">
            <button className="btn-add-event" onClick={() => setShowAddModal(true)}>+ событие</button>
            <button className="btn-refresh" onClick={() => refresh()} disabled={loading}>↻ Проверить ещё раз</button>
          </div>
        </div>
        <div className="quality-empty-panel">
          <div className="quality-empty-icon">📊</div>
          <h2>Агрегация ещё не выполнялась</h2>
          <p>
            Файл <code>/data/codex-quality.json</code> ещё не опубликован — GitHub Actions sweep пока не отработал.
            Первый прогон по расписанию (~03:17 Бали, 19:17 UTC) запишет недельную динамику P0/P1/P2 находок Codex по 12 проектам;
            можно запустить вручную: <code>workflow_dispatch</code> на <code>codex-quality-sweep</code>.
          </p>
          <p style={{ fontSize: 12, opacity: 0.8 }}>
            События ниже работают независимо — добавляйте deploy/skill вехи, они появятся на таймлайне сразу как только аггрегация заработает.
          </p>
        </div>
        {showAddModal && (
          <AnnotationModal
            onSubmit={handleAddAnnotation}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </div>
    );
  }
  if (error) {
    return (
      <div className="v4-quality-tab">
        <div className="quality-error-panel">
          <b>Ошибка загрузки данных:</b> {error}
          <button onClick={() => refresh()}>Попробовать снова</button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="v4-quality-tab">Нет данных</div>;

  return (
    <div className="v4-quality-tab page">
      <div className="pageH">
        <div>
          <h1>Качество кода</h1>
          <div className="sub">
            Доля PR с критическими/высокими замечаниями <b>chatgpt-codex-connector[bot]</b> от общего числа merged PR · события на временной оси
          </div>
        </div>
        <div className="ctrls">
          <div className="seg">
            <button className={mode === "30d" ? "active" : ""} onClick={() => setMode("30d")}>30 дней · По дням</button>
            <button className={mode === "12w" ? "active" : ""} onClick={() => setMode("12w")}>12 недель · По неделям</button>
          </div>
          <button className="btn-add-event" onClick={() => setShowAddModal(true)}>+ событие</button>
          <div style={{ fontFamily: "var(--v4-mono)", fontSize: 10, color: "var(--v4-ink-500)", textAlign: "right" }}>
            <div>Синхр. ежедневно · 03:00 Бали</div>
            <div style={{ color: "var(--v4-ink-400)" }}>
              последняя: {new Date(data.generated_at).toLocaleString("ru")}
            </div>
          </div>
          <button className="btn-refresh" onClick={() => refresh()} disabled={loading}>↻ Сейчас</button>
        </div>
      </div>

      {isStale && <QualityStaleBanner generatedAt={data.generated_at} onRefresh={() => refresh()} />}

      <QualitySummaryPanel data={data} annotations={annotations} mode={mode} />
      <QualityProjectGrid data={data} mode={mode} />

      {showAddModal && (
        <AnnotationModal
          onSubmit={handleAddAnnotation}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
