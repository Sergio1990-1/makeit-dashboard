import type { ComplexityFilter } from "../../../utils/pipeline";
import { PROJECTS } from "../../../utils/config";
import { GITHUB_OWNER } from "../../../utils/config";

const LABEL_OPTIONS = ["P1-critical", "P2-high", "P3-medium"] as const;
export type LabelOption = (typeof LABEL_OPTIONS)[number];

const LABEL_COLOR: Record<LabelOption, string> = {
  "P1-critical": "var(--mk-priority-p1)",
  "P2-high": "var(--mk-priority-p2)",
  "P3-medium": "var(--mk-priority-p3)",
};

const COMPLEXITY_OPTIONS: { value: ComplexityFilter; label: string; hint: string }[] = [
  { value: "all", label: "All", hint: "Все задачи" },
  { value: "auto", label: "Auto", hint: "Sonnet — простые" },
  { value: "assisted", label: "Assisted", hint: "Opus — сложные" },
  { value: "manual", label: "Manual", hint: "Ручной режим" },
];

interface Props {
  open: boolean;
  disabled: boolean;
  selectedProject: string;
  setSelectedProject: (v: string) => void;
  selectedLabels: LabelOption[];
  toggleLabel: (label: LabelOption) => void;
  complexityFilter: ComplexityFilter;
  setComplexityFilter: (v: ComplexityFilter) => void;
  limit: number;
  setLimit: (n: number) => void;
  unclassifiedCount: number;
  classifying: boolean;
  onClassify: () => void;
}

export function ConfigPanel({
  open,
  disabled,
  selectedProject,
  setSelectedProject,
  selectedLabels,
  toggleLabel,
  complexityFilter,
  setComplexityFilter,
  limit,
  setLimit,
  unclassifiedCount,
  classifying,
  onClassify,
}: Props) {
  if (!open) return null;
  return (
    <div className="v4-pl-config" role="region" aria-label="Параметры запуска">
      <div className="v4-pl-config-row">
        <label className="v4-pl-config-label">
          <span className="v4-pl-config-key">Проект</span>
          <select
            className="v4-pl-input"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            disabled={disabled}
          >
            <option value="">Все проекты</option>
            {PROJECTS.map((p) => (
              <option key={p.repo} value={`${p.owner}/${p.repo}`}>
                {p.repo}
              </option>
            ))}
            {selectedProject && !PROJECTS.find((p) => `${p.owner}/${p.repo}` === selectedProject) && (
              <option value={selectedProject}>{selectedProject.replace(`${GITHUB_OWNER}/`, "")}</option>
            )}
          </select>
        </label>

        <fieldset className="v4-pl-config-label" disabled={disabled}>
          <span className="v4-pl-config-key">Лейблы</span>
          <div className="v4-pl-chip-row">
            {LABEL_OPTIONS.map((label) => {
              const active = selectedLabels.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  className={`v4-pl-label-chip ${active ? "is-active" : ""}`}
                  style={{
                    borderColor: active ? LABEL_COLOR[label] : undefined,
                    color: active ? LABEL_COLOR[label] : undefined,
                    background: active
                      ? `color-mix(in srgb, ${LABEL_COLOR[label]} 12%, transparent)`
                      : undefined,
                  }}
                  onClick={() => toggleLabel(label)}
                  disabled={disabled}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="v4-pl-config-label" disabled={disabled}>
          <span className="v4-pl-config-key">Сложность</span>
          <div className="v4-pl-chip-row">
            {COMPLEXITY_OPTIONS.map((opt) => {
              const active = complexityFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`v4-pl-label-chip ${active ? "is-active v4-pl-cx-chip--active" : ""}`}
                  onClick={() => setComplexityFilter(opt.value)}
                  disabled={disabled}
                  title={opt.hint}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="v4-pl-config-label v4-pl-config-label--narrow">
          <span className="v4-pl-config-key">Лимит</span>
          <input
            type="number"
            className="v4-pl-input v4-pl-input--narrow"
            min={1}
            max={50}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            disabled={disabled}
          />
        </label>

        {unclassifiedCount > 0 && (
          <div className="v4-pl-config-classify">
            <button
              type="button"
              className="v4-btn"
              onClick={onClassify}
              disabled={classifying || !selectedProject}
              title={!selectedProject ? "Выберите проект" : `Классифицировать ${unclassifiedCount} issues`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M7 12h10M10 18h4" />
              </svg>
              Classify {unclassifiedCount}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
