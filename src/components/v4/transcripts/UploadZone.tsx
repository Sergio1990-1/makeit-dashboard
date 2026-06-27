import { useCallback, useRef, useState } from "react";
import type { ProjectConfig } from "../../../types";
import type { TranscriptionModel } from "../../../utils/transcript";

const VALID_EXTENSIONS = ["mp3", "wav", "m4a", "txt", "md"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a"];
const ALL_ACCEPTED = ".mp3,.wav,.m4a,.txt,.md";
const MAX_FILES = 15;

interface Props {
  projects: ProjectConfig[];
  selectedProject: string;
  setSelectedProject: (v: string) => void;
  selectedModel: TranscriptionModel;
  setSelectedModel: (v: TranscriptionModel) => void;
  onSubmit: (files: File[]) => void | Promise<void>;
  errorMessage?: string | null;
  /**
   * Upload progress 0–100 for a single-file submit, or null when not
   * uploading. Drives the progress bar shown while a large audio file is
   * being sent to the server.
   */
  uploadProgress?: number | null;
}

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(getFileExt(name));
}

function ru_plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function UploadZone({
  projects,
  selectedProject,
  setSelectedProject,
  selectedModel,
  setSelectedModel,
  onSubmit,
  errorMessage,
  uploadProgress,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    setLocalError(null);
    const valid: File[] = [];
    for (const f of newFiles) {
      const ext = getFileExt(f.name);
      if (!VALID_EXTENSIONS.includes(ext)) {
        setLocalError(`Пропущен файл с неподдерживаемым форматом: .${ext}`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        setLocalError(`Максимум ${MAX_FILES} файлов. Лишние не добавлены.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) addFiles(dropped);
    },
    [addFiles]
  );
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      if (selected.length > 0) addFiles(selected);
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles]
  );

  const handleSubmit = useCallback(async () => {
    if (files.length === 0 || !selectedProject || submitting) return;
    // Snapshot the batch we're submitting. The user can still queue more
    // files during the in-flight upload (drag/drop, "+ Добавить"); clearing
    // by snapshot identity preserves those instead of dropping them.
    const submitted = files;
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSubmit(submitted);
      setFiles((prev) => prev.filter((f) => !submitted.includes(f)));
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      // Keep selected files so the user can retry without re-picking them.
      setLocalError(`Не удалось отправить файлы: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }, [files, selectedProject, submitting, onSubmit]);

  const hasAudio = files.some((f) => isAudioFile(f.name));
  const hasFiles = files.length > 0;

  return (
    <div className="v4-tpc-upload">
      <div
        className={`v4-tpc-dropzone ${dragging ? "is-active" : ""} ${hasFiles ? "has-files" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !hasFiles && inputRef.current?.click()}
        role={!hasFiles ? "button" : undefined}
        tabIndex={!hasFiles ? 0 : undefined}
        onKeyDown={(e) => {
          if (!hasFiles && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALL_ACCEPTED}
          multiple
          onChange={onFileChange}
          className="v4-tpc-file-input"
        />
        {hasFiles ? (
          <div className="v4-tpc-file-list">
            {files.map((f, i) => {
              const audio = isAudioFile(f.name);
              return (
                <div key={`${f.name}-${i}`} className="v4-tpc-file-item">
                  <span className={`v4-tpc-file-badge v4-tpc-file-badge--${audio ? "audio" : "text"}`}>
                    {audio ? "🎙" : "📄"}
                  </span>
                  <span className="v4-tpc-file-name">{f.name}</span>
                  <span className="v4-tpc-file-size">
                    {f.size < 1024 * 1024
                      ? `${(f.size / 1024).toFixed(1)} KB`
                      : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                  <button
                    type="button"
                    className="v4-tpc-file-remove"
                    aria-label={`Удалить файл ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div className="v4-tpc-file-list-foot">
              <span className="v4-tpc-text-muted">
                {files.length} {ru_plural(files.length, "файл", "файла", "файлов")}
              </span>
              <button
                type="button"
                className="v4-linkbtn"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFiles();
                }}
              >
                Очистить все
              </button>
              <button
                type="button"
                className="v4-linkbtn"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                + Добавить
              </button>
            </div>
          </div>
        ) : (
          <div className="v4-tpc-drop-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Перетащите файлы сюда или нажмите для выбора</p>
            <span className="v4-tpc-drop-hint">mp3, wav, m4a, txt, md (до {MAX_FILES} файлов)</span>
          </div>
        )}
      </div>

      <div className="v4-tpc-controls">
        <label className="v4-tpc-control-field">
          <span className="v4-tpc-control-key">Проект</span>
          <select
            className="v4-pl-input"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.repo} value={p.repo}>
                {p.repo} — {p.client}
              </option>
            ))}
          </select>
        </label>

        {hasAudio && (
          <fieldset className="v4-tpc-control-field">
            <span className="v4-tpc-control-key">Модель</span>
            <div className="v4-pillgrp">
              <button
                type="button"
                className={selectedModel === "draft" ? "is-active" : ""}
                onClick={() => setSelectedModel("draft")}
                title="Быстрый черновик без надёжных спикеров и таймкодов"
              >
                ⚡ Черновик
              </button>
              <button
                type="button"
                className={selectedModel === "quality" ? "is-active" : ""}
                onClick={() => setSelectedModel("quality")}
                title="Production BRIEF с полной обработкой спикеров"
              >
                🎯 Качественная
              </button>
            </div>
          </fieldset>
        )}

        <button
          type="button"
          className="v4-btn v4-btn--pri v4-tpc-submit"
          disabled={!hasFiles || !selectedProject || submitting}
          onClick={handleSubmit}
        >
          {submitting
            ? typeof uploadProgress === "number"
              ? `Загрузка… ${uploadProgress}%`
              : "Отправка…"
            : files.length > 1
              ? `Обработать (${files.length})`
              : "Обработать"}
        </button>
      </div>

      {submitting && typeof uploadProgress === "number" && (
        <div className="v4-tpc-upload-progress" style={{ marginTop: 12 }}>
          <div className="v4-ptrack" style={{ height: 6 }}>
            <div
              className="v4-pfill"
              style={{ width: `${uploadProgress}%`, background: "var(--mk-brand-500)" }}
            />
          </div>
          <div className="v4-tpc-text-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Загрузка файла на сервер… {uploadProgress}% — не закрывайте вкладку
          </div>
        </div>
      )}

      {(localError || errorMessage) && (
        <div className="v4-error" style={{ marginTop: 12 }}>
          {localError || errorMessage}
        </div>
      )}
    </div>
  );
}
