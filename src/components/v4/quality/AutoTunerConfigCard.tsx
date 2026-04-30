import { useState } from "react";
import type { QualityConfig, QualityConfigUpdate } from "../../../types";

interface Props {
  config: QualityConfig | null;
  onSave: (update: QualityConfigUpdate) => Promise<QualityConfig>;
}

function fmtHours(h: number): string {
  if (h <= 0) return "готов";
  if (h < 1) return `${Math.round(h * 60)} мин`;
  return `${h.toFixed(1)} ч`;
}

export function AutoTunerConfigCard({ config, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [draft, setDraft] = useState<QualityConfigUpdate>({});

  if (config === null) {
    return (
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">AutoTuner · параметры</div>
        </div>
        <div className="v4-empty">Параметры недоступны (Pipeline API офлайн?)</div>
      </div>
    );
  }

  const merged: QualityConfig = { ...config, ...draft };
  const hasChanges = Object.keys(draft).length > 0;

  async function save(updatesOverride?: QualityConfigUpdate) {
    const update: QualityConfigUpdate = updatesOverride ?? draft;
    if (Object.keys(update).length === 0) return;
    setSaving(true);
    setLocalError(null);
    try {
      await onSave(update);
      // Toggle saves leave slider draft intact for explicit review.
      if (updatesOverride === undefined) setDraft({});
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

  const bodyId = "v4-qa-autotuner-config-body";

  return (
    <div className="v4-panel">
      <div
        className="v4-panel-h v4-qa-config-h"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <div className="v4-panel-t">
          <span className="v4-qa-arrow" aria-hidden="true">{open ? "▾" : "▸"}</span>{" "}
          AutoTuner · параметры
        </div>
        <div className="v4-qa-config-summary">
          <span className={`v4-tag ${merged.retro_mode === "auto_apply" ? "v4-tag--ok" : ""}`}>
            {merged.retro_mode === "auto_apply" ? "автоприменение" : "только отчёт"}
          </span>
          <span className="v4-pl-mono v4-qa-text-muted">
            мин. уверенность {(merged.auto_apply_min_confidence * 100).toFixed(0)}% · задержка {merged.auto_apply_cooldown_hours}ч
          </span>
          {merged.cooldown_active && (
            <span className="v4-tag v4-tag--warn">задержка · {fmtHours(merged.cooldown_remaining_hours)}</span>
          )}
        </div>
      </div>

      {open && (
        <div id={bodyId} className="v4-qa-config-body">
          {localError && <div className="v4-error">{localError}</div>}

          <div className="v4-qa-config-grid">
            <div className="v4-qa-config-cell">
              <div className="v4-qa-config-label">Режим ретроспективы</div>
              <button
                type="button"
                className={`v4-qa-toggle ${merged.retro_mode === "auto_apply" ? "is-on" : ""}`}
                disabled={saving}
                onClick={toggleRetroMode}
              >
                <span className="v4-qa-toggle-dot" />
                {merged.retro_mode === "auto_apply" ? "автоприменение" : "только отчёт"}
              </button>
              <div className="v4-qa-config-hint">
                Автоприменение раскатывает уроки уровня 1 сразу; «только отчёт» — лишь кладёт в буфер ожидания.
              </div>
            </div>

            <SliderCell
              label="Мин. уверенность"
              value={merged.auto_apply_min_confidence}
              displayValue={`${(merged.auto_apply_min_confidence * 100).toFixed(0)}%`}
              min={0.5}
              max={1.0}
              step={0.01}
              disabled={saving}
              onChange={(v) => setDraft((d) => ({ ...d, auto_apply_min_confidence: v }))}
            />

            <SliderCell
              label="Задержка (часы)"
              value={merged.auto_apply_cooldown_hours}
              displayValue={String(merged.auto_apply_cooldown_hours)}
              min={1}
              max={168}
              step={1}
              disabled={saving}
              onChange={(v) => setDraft((d) => ({ ...d, auto_apply_cooldown_hours: v }))}
            />

            <SliderCell
              label="Порог деградации KPI"
              value={merged.kpi_degradation_threshold}
              displayValue={`${(merged.kpi_degradation_threshold * 100).toFixed(0)}%`}
              min={0.01}
              max={0.5}
              step={0.01}
              disabled={saving}
              onChange={(v) => setDraft((d) => ({ ...d, kpi_degradation_threshold: v }))}
            />

            <SliderCell
              label="Уроки · макс. строк"
              value={merged.lessons_max_lines}
              displayValue={String(merged.lessons_max_lines)}
              min={10}
              max={1000}
              step={10}
              disabled={saving}
              onChange={(v) => setDraft((d) => ({ ...d, lessons_max_lines: v }))}
            />

            <SliderCell
              label="Уроки · срок жизни (дни)"
              value={merged.lessons_ttl_days}
              displayValue={String(merged.lessons_ttl_days)}
              min={1}
              max={365}
              step={1}
              disabled={saving}
              onChange={(v) => setDraft((d) => ({ ...d, lessons_ttl_days: v }))}
            />

            <div className="v4-qa-config-cell">
              <div className="v4-qa-config-label">Проверка чисел</div>
              <button
                type="button"
                className={`v4-qa-toggle ${merged.validate_numeric_claims ? "is-on" : ""}`}
                disabled={saving}
                onClick={toggleValidator}
              >
                <span className="v4-qa-toggle-dot" />
                {merged.validate_numeric_claims ? "включена" : "выключена"}
              </button>
              <div className="v4-qa-config-hint">
                Сверяет числа в уроках с metrics.jsonl. Допуск{" "}
                {(merged.validation_tolerance * 100).toFixed(0)}%.
              </div>
            </div>
          </div>

          <div className="v4-qa-config-actions">
            {hasChanges && (
              <>
                <button
                  type="button"
                  className="v4-btn v4-btn--pri"
                  disabled={saving}
                  onClick={() => save()}
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  className="v4-btn"
                  disabled={saving}
                  onClick={() => setDraft({})}
                >
                  Отменить
                </button>
              </>
            )}
            {merged.last_apply_at && (
              <span className="v4-pl-mono v4-qa-text-muted">
                последнее применение: {new Date(merged.last_apply_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function SliderCell({ label, value, displayValue, min, max, step, disabled, onChange }: SliderProps) {
  return (
    <div className="v4-qa-config-cell">
      <div className="v4-qa-config-label">
        {label}
        <span className="v4-pl-mono v4-qa-config-value">{displayValue}</span>
      </div>
      <input
        type="range"
        className="v4-qa-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
