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
  const { data, annotations, loading, error, isStale, refresh, reloadAnnotations } = useCodexQuality();
  const [mode, setMode] = useState<PeriodMode>("12w");
  const [showAddModal, setShowAddModal] = useState(false);

  if (loading && !data) return <div className="v4-quality-tab">Загрузка…</div>;
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

  const handleAddAnnotation = async (p: AnnotationCreatePayload) => {
    await createAnnotation(p);
    await reloadAnnotations();
  };

  return (
    <div className="v4-quality-tab page">
      <div className="pageH">
        <div>
          <h1>Качество кода и изменения</h1>
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
