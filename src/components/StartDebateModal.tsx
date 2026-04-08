import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { startDebate } from "../utils/debate";
import { GITHUB_OWNER, PROJECTS } from "../utils/config";
import type { DebateParticipant } from "../types/debate";

type Provider = DebateParticipant["provider"];
type Role = DebateParticipant["role"];

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "gemini", label: "Gemini (2.5 Pro)" },
];

const ROLES: { value: Role; label: string }[] = [
  { value: "architect", label: "Architect" },
  { value: "critic", label: "Critic" },
  { value: "practitioner", label: "Practitioner" },
];

const DEFAULT_PARTICIPANTS: DebateParticipant[] = [
  { provider: "anthropic", role: "architect" },
  { provider: "openai", role: "critic" },
  { provider: "gemini", role: "practitioner" },
];

const MAX_BRIEF_LENGTH = 50000;
const BRIEF_WARNING_LENGTH = 30000;

interface Props {
  onClose: () => void;
  onStarted: (id: string) => void;
}

export function StartDebateModal({ onClose, onStarted }: Props) {
  const [topic, setTopic] = useState("");
  const [project, setProject] = useState("");
  const [brief, setBrief] = useState("");
  const [contextFiles, setContextFiles] = useState("");
  const [participants, setParticipants] = useState<DebateParticipant[]>(DEFAULT_PARTICIPANTS);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectOptions = PROJECTS.map((p) => ({
    value: `${GITHUB_OWNER}/${p.repo}`,
    label: p.repo,
  }));

  const validationErrors: string[] = [];
  if (!topic.trim()) validationErrors.push("Тема обязательна");
  if (participants.length < 2) validationErrors.push("Минимум 2 участника");
  const dupes = participants.filter(
    (p, i) => participants.findIndex((o) => o.provider === p.provider && o.role === p.role) !== i,
  );
  if (dupes.length > 0) validationErrors.push("Дублирование provider+role");
  if (brief.length > MAX_BRIEF_LENGTH) validationErrors.push(`Бриф превышает ${MAX_BRIEF_LENGTH} символов`);

  const canSubmit = validationErrors.length === 0 && !starting;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setBrief(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addParticipant = () => {
    const usedCombos = new Set(participants.map((p) => `${p.provider}:${p.role}`));
    for (const prov of PROVIDERS) {
      for (const role of ROLES) {
        if (!usedCombos.has(`${prov.value}:${role.value}`)) {
          setParticipants([...participants, { provider: prov.value, role: role.value }]);
          return;
        }
      }
    }
  };

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const updateParticipant = (index: number, field: "provider" | "role", value: string) => {
    setParticipants(
      participants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      ),
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStarting(true);
    setError(null);
    try {
      const contextFilesList = contextFiles
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      const result = await startDebate({
        topic: topic.trim(),
        project: project || undefined,
        brief: brief.trim() || undefined,
        context_files: contextFilesList.length > 0 ? contextFilesList : undefined,
        participants,
      });
      setStarting(false);
      onStarted(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запуска дебата");
      setStarting(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="sdm-title">
      <div className="modal-panel sdm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sdm-header">
          <h2 className="modal-title" id="sdm-title">Запустить дебат</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: "var(--sp-4)" }}>{error}</div>}

        <div className="sdm-form">
          {/* Project */}
          <label className="sdm-label">
            Проект
            <select
              className="sdm-select"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Без проекта (абстрактный дебат)</option>
              {projectOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {project && (
              <span className="sdm-hint">Context Gatherer автоматически соберёт контекст проекта</span>
            )}
          </label>

          {/* Topic */}
          <label className="sdm-label">
            Тема <span className="sdm-required">*</span>
            <input
              type="text"
              className="sdm-input"
              placeholder="Архитектурное решение, техническая дискуссия..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              autoFocus
            />
          </label>

          {/* Brief */}
          <label className="sdm-label">
            Бриф / ТЗ
            <textarea
              className="sdm-textarea"
              placeholder="Описание задачи, требования, контекст... (markdown)"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={5}
            />
            <div className="sdm-brief-meta">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Загрузить файл
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <span className={brief.length > BRIEF_WARNING_LENGTH ? "sdm-char-warn" : "sdm-char-count"}>
                {brief.length.toLocaleString()} / {MAX_BRIEF_LENGTH.toLocaleString()}
              </span>
            </div>
          </label>

          {/* Context files (only if project selected) */}
          {project && (
            <label className="sdm-label">
              Context files
              <textarea
                className="sdm-textarea"
                placeholder="src/api/routes.py&#10;src/models/order.py&#10;(по одному файлу на строку)"
                value={contextFiles}
                onChange={(e) => setContextFiles(e.target.value)}
                rows={3}
              />
              <span className="sdm-hint">
                Дополнительные файлы для контекста. Основные файлы проекта будут собраны автоматически.
              </span>
            </label>
          )}

          {/* Participants */}
          <div className="sdm-label">
            Участники <span className="sdm-required">*</span> (мин. 2)
            <div className="sdm-participants">
              {participants.map((p, i) => (
                <div key={i} className="sdm-participant-row">
                  <select
                    className="sdm-select sdm-select-sm"
                    value={p.provider}
                    onChange={(e) => updateParticipant(i, "provider", e.target.value)}
                  >
                    {PROVIDERS.map((prov) => (
                      <option key={prov.value} value={prov.value}>{prov.label}</option>
                    ))}
                  </select>
                  <select
                    className="sdm-select sdm-select-sm"
                    value={p.role}
                    onChange={(e) => updateParticipant(i, "role", e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm sdm-remove-btn"
                    onClick={() => removeParticipant(i)}
                    disabled={participants.length <= 2}
                    title="Удалить"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {participants.length < PROVIDERS.length * ROLES.length && (
                <button type="button" className="btn btn-sm" onClick={addParticipant}>
                  + Добавить участника
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Validation warnings */}
        {validationErrors.length > 0 && topic.length > 0 && (
          <div className="sdm-validation">
            {validationErrors.map((e, i) => (
              <div key={i} className="sdm-validation-item">{e}</div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>
            Отмена
          </button>
          <button
            className="btn btn-primary modal-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {starting ? "Запуск..." : "▶ Запустить дебат"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
