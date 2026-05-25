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
  const [mode, setMode] = useState<PeriodMode>("30d");
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddAnnotation = async (p: AnnotationCreatePayload) => {
    await createAnnotation(p);
    await reloadAnnotations();
  };

  // All branches use `v4-quality-tab page` so they inherit the same
  // padding/max-width as the populated state — otherwise a quick error
  // or loading flash shows content flush against the top-left edge of
  // the content area, off-grid relative to every other tab.
  if (loading && !data) return <div className="v4-quality-tab page">Загрузка…</div>;
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
          {annotations.length > 0 && (
            // Empty-state shows no timeline, so a fresh POST has nowhere
            // visible to land. Surfacing the count here is the cheapest
            // confirmation that the mini-API actually accepted the event
            // (mini-API + sweep are independent, so this can be non-zero
            // even with no chart data).
            <p
              style={{ fontSize: 11, opacity: 0.7, fontFamily: "var(--mk-font-mono)" }}
              aria-live="polite"
            >
              сохранено событий: {annotations.length} — появятся на таймлайне после первой агрегации
            </p>
          )}
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
      <div className="v4-quality-tab page">
        <div className="pageH">
          <div>
            <h1>Качество кода</h1>
            <div className="sub">Не удалось загрузить данные — попробуйте обновить.</div>
          </div>
        </div>
        <div className="quality-error-panel">
          <b>Ошибка загрузки данных:</b> {error}
          <button onClick={() => refresh()}>Попробовать снова</button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="v4-quality-tab page">Нет данных</div>;

  return (
    <div className="v4-quality-tab page">
      <div className="pageH">
        <div>
          <h1>Качество кода</h1>
          <div className="sub">Доля PR с критическими/высокими замечаниями review</div>
        </div>
        <div className="ctrls">
          <div className="seg">
            <button
              className={mode === "30d" ? "active" : ""}
              onClick={() => setMode("30d")}
              title="30 дней · По дням"
            >
              30 дн.
            </button>
            <button
              className={mode === "12w" ? "active" : ""}
              onClick={() => setMode("12w")}
              title="12 недель · По неделям"
            >
              12 нед.
            </button>
          </div>
          <button className="btn-add-event" onClick={() => setShowAddModal(true)}>+ событие</button>
          <div
            title={`Синхр. ежедневно · 03:00 Бали\nпоследняя: ${new Date(data.generated_at).toLocaleString("ru")}`}
            style={{ fontFamily: "var(--mk-font-mono)", fontSize: 10, color: "var(--mk-ink-500)", whiteSpace: "nowrap" }}
          >
            ↻ {new Date(data.generated_at).toLocaleString("ru", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <button
            className="btn-refresh"
            onClick={() => refresh()}
            disabled={loading}
            title="Обновить сейчас"
          >
            ↻
          </button>
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
