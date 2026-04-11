/** Config panel for AutoTuner: retro_mode, thresholds, cooldown state. */

import { useState } from "react";
import type { QualityConfig, QualityConfigUpdate } from "../types";

interface Props {
  config: QualityConfig | null;
  onSave: (update: QualityConfigUpdate) => Promise<QualityConfig>;
}

function formatHours(h: number): string {
  if (h <= 0) return "готов";
  if (h < 1) return `${Math.round(h * 60)} мин`;
  return `${h.toFixed(1)} ч`;
}

export function QualityAutoTunerConfig({ config, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Local staging for slider/input edits so we only POST on explicit save.
  const [draft, setDraft] = useState<QualityConfigUpdate>({});

  if (config === null) {
    return (
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title">AutoTuner · Config</div>
        <div className="qk-empty">Конфиг недоступен (pipeline API offline?)</div>
      </div>
    );
  }

  const merged: QualityConfig = { ...config, ...draft };
  const hasChanges = Object.keys(draft).length > 0;

  async function save(updatesOverride?: QualityConfigUpdate) {
    const update = updatesOverride ?? draft;
    if (Object.keys(update).length === 0) return;
    setSaving(true);
    setLocalError(null);
    try {
      await onSave(update);
      setDraft({});
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRetroMode() {
    const next = merged.retro_mode === "auto_apply" ? "reporting" : "auto_apply";
    await save({ retro_mode: next });
  }

  async function toggleValidator() {
    await save({ validate_numeric_claims: !merged.validate_numeric_claims });
  }

  return (
    <div className="bento-panel span-12 panel-projects">
      <div className="bento-panel-title">
        AutoTuner · Config
        <span
          className={`qtc-badge ${merged.retro_mode === "auto_apply" ? "qtc-on" : "qtc-off"}`}
        >
          {merged.retro_mode === "auto_apply" ? "auto-apply" : "reporting"}
        </span>
        {merged.cooldown_active && (
          <span className="qtc-cooldown">
            cooldown · {formatHours(merged.cooldown_remaining_hours)}
          </span>
        )}
      </div>

      {localError && <div className="qk-error">{localError}</div>}

      <div className="qtc-grid">
        {/* Retro mode toggle */}
        <div className="qtc-cell">
          <div className="qtc-label">Retro mode</div>
          <button
            type="button"
            className={`qtc-toggle ${merged.retro_mode === "auto_apply" ? "qtc-toggle-on" : ""}`}
            disabled={saving}
            onClick={toggleRetroMode}
          >
            <span className="qtc-toggle-dot" />
            {merged.retro_mode === "auto_apply" ? "auto_apply" : "reporting"}
          </button>
          <div className="qtc-hint">
            auto_apply применяет Tier-1 lessons автоматически; reporting — только stage.
          </div>
        </div>

        {/* Min confidence */}
        <div className="qtc-cell">
          <div className="qtc-label">
            Min confidence
            <span className="qtc-value">{(merged.auto_apply_min_confidence * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.01}
            value={merged.auto_apply_min_confidence}
            onChange={(e) =>
              setDraft((d) => ({ ...d, auto_apply_min_confidence: Number(e.target.value) }))
            }
            disabled={saving}
          />
        </div>

        {/* Cooldown */}
        <div className="qtc-cell">
          <div className="qtc-label">
            Cooldown (часы)
            <span className="qtc-value">{merged.auto_apply_cooldown_hours}</span>
          </div>
          <input
            type="range"
            min={1}
            max={168}
            step={1}
            value={merged.auto_apply_cooldown_hours}
            onChange={(e) =>
              setDraft((d) => ({ ...d, auto_apply_cooldown_hours: Number(e.target.value) }))
            }
            disabled={saving}
          />
        </div>

        {/* KPI degradation threshold */}
        <div className="qtc-cell">
          <div className="qtc-label">
            KPI degradation threshold
            <span className="qtc-value">{(merged.kpi_degradation_threshold * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.5}
            step={0.01}
            value={merged.kpi_degradation_threshold}
            onChange={(e) =>
              setDraft((d) => ({ ...d, kpi_degradation_threshold: Number(e.target.value) }))
            }
            disabled={saving}
          />
        </div>

        {/* Lessons max lines */}
        <div className="qtc-cell">
          <div className="qtc-label">
            Lessons · max lines
            <span className="qtc-value">{merged.lessons_max_lines}</span>
          </div>
          <input
            type="range"
            min={10}
            max={1000}
            step={10}
            value={merged.lessons_max_lines}
            onChange={(e) =>
              setDraft((d) => ({ ...d, lessons_max_lines: Number(e.target.value) }))
            }
            disabled={saving}
          />
        </div>

        {/* Lessons TTL */}
        <div className="qtc-cell">
          <div className="qtc-label">
            Lessons TTL (дни)
            <span className="qtc-value">{merged.lessons_ttl_days}</span>
          </div>
          <input
            type="range"
            min={1}
            max={365}
            step={1}
            value={merged.lessons_ttl_days}
            onChange={(e) =>
              setDraft((d) => ({ ...d, lessons_ttl_days: Number(e.target.value) }))
            }
            disabled={saving}
          />
        </div>

        {/* Numeric claim validator */}
        <div className="qtc-cell">
          <div className="qtc-label">Numeric claim validator</div>
          <button
            type="button"
            className={`qtc-toggle ${merged.validate_numeric_claims ? "qtc-toggle-on" : ""}`}
            disabled={saving}
            onClick={toggleValidator}
          >
            <span className="qtc-toggle-dot" />
            {merged.validate_numeric_claims ? "on" : "off"}
          </button>
          <div className="qtc-hint">
            Проверяет числа в lessons против metrics.jsonl. Toleranсе {" "}
            {(merged.validation_tolerance * 100).toFixed(0)}%.
          </div>
        </div>
      </div>

      <div className="qtc-actions">
        {hasChanges && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => save()}
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => setDraft({})}
            >
              Отменить
            </button>
          </>
        )}
        {merged.last_apply_at && (
          <span className="qtc-last-apply">
            last apply: {new Date(merged.last_apply_at).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
