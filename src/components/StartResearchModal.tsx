import { useState } from "react";
import { GITHUB_OWNER, PROJECTS } from "../utils/config";

interface Props {
  /** Pre-selected repo (if launched from project card) */
  defaultRepo?: string;
  onClose: () => void;
  onStart: (project: string, productDescription: string, region: string) => void;
  starting: boolean;
}

const REGIONS = [
  { value: "", label: "Авто (по описанию)" },
  { value: "ru", label: "Россия / СНГ" },
  { value: "us", label: "США / Global" },
  { value: "eu", label: "Европа" },
  { value: "asia", label: "Азия" },
];

export function StartResearchModal({ defaultRepo, onClose, onStart, starting }: Props) {
  const [project, setProject] = useState(defaultRepo ? `${GITHUB_OWNER}/${defaultRepo}` : "");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");

  const canSubmit = project.trim() !== "" && !starting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onStart(project, description.trim(), region);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="srm-title">
      <div className="bento-panel modal-panel srm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="srm-header">
          <h2 className="modal-title" id="srm-title">Запустить Research агента</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        <div className="srm-form">
          <label className="srm-label">
            Проект <span className="srm-required">*</span>
            <select
              className="srm-select"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Выберите проект</option>
              {PROJECTS.map((p) => (
                <option key={p.repo} value={`${GITHUB_OWNER}/${p.repo}`}>{p.repo}</option>
              ))}
            </select>
          </label>

          <label className="srm-label">
            Описание продукта
            <textarea
              className="srm-textarea"
              placeholder="Кратко опишите продукт и целевую аудиторию для более точного анализа..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <span className="srm-hint">Необязательно. Помогает агенту точнее определить конкурентов.</span>
          </label>

          <label className="srm-label">
            Регион
            <select
              className="srm-select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="srm-info">
          Research агент проанализирует рынок, конкурентов и болевые точки пользователей.
          Результат сохраняется как RESEARCH.md в репозитории проекта.
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>
            Отмена
          </button>
          <button
            className="btn btn-primary modal-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {starting ? "Запуск..." : "Запустить Research"}
          </button>
        </div>
      </div>
    </div>
  );
}
