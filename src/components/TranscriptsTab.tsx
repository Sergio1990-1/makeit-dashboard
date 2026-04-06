import { useCallback, useRef, useState } from "react";
import { uploadTranscript, fetchTranscriptResult, type TranscriptResult, type TranscriptionModel } from "../utils/transcript";
import { TranscriptProgress } from "./TranscriptProgress";
import { TranscriptBrief } from "./TranscriptBrief";
import { TranscriptEditor } from "./TranscriptEditor";
import { TranscriptHistory } from "./TranscriptHistory";
import type { ProjectConfig } from "../types";

const VALID_EXTENSIONS = ["mp3", "wav", "m4a", "txt", "md"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a"];
const ALL_ACCEPTED = ".mp3,.wav,.m4a,.txt,.md";
const MAX_FILES = 15;
const MAX_CONCURRENT = 2;

type BatchFileStatus = "pending" | "uploading" | "processing" | "done" | "error";

interface BatchFile {
  id: string; // unique key
  file: File;
  status: BatchFileStatus;
  taskId?: string;
  error?: string;
}

interface Props {
  projects: ProjectConfig[];
}

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(getFileExt(name));
}

export function TranscriptsTab({ projects }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [project, setProject] = useState(projects[0]?.repo ?? "");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [briefResult, setBriefResult] = useState<TranscriptResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [transcriptionModel, setTranscriptionModel] = useState<TranscriptionModel>("fast");

  // Batch upload state
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  const abortRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    setResult(null);
    const valid: File[] = [];
    for (const f of newFiles) {
      const ext = getFileExt(f.name);
      if (!VALID_EXTENSIONS.includes(ext)) {
        setResult({ ok: false, message: `Пропущен файл с неподдерживаемым форматом: .${ext}` });
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        setResult({ ok: false, message: `Максимум ${MAX_FILES} файлов. Лишние не добавлены.` });
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
    setResult(null);
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
    [addFiles],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      if (selected.length > 0) addFiles(selected);
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles],
  );

  // --- Single-file upload (backward compat for single file) ---
  const onSubmitSingle = useCallback(async () => {
    if (files.length !== 1 || !project) return;
    const file = files[0];
    setResult(null);
    setBriefResult(null);
    setEditing(false);
    try {
      const res = await uploadTranscript(file, project, transcriptionModel);
      setActiveTaskId(res.task_id);
      setHistoryRefreshKey((k) => k + 1);
      clearFiles();
    } catch (err) {
      setResult({ ok: false, message: String(err) });
    }
  }, [files, project, transcriptionModel, clearFiles]);

  // --- Batch upload queue ---
  const onSubmitBatch = useCallback(async () => {
    if (files.length < 2 || !project) return;
    abortRef.current = false;
    setBriefResult(null);
    setEditing(false);
    setResult(null);

    const batch: BatchFile[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      status: "pending" as BatchFileStatus,
    }));
    setBatchFiles(batch);
    setBatchActive(true);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";

    // Process queue with max concurrency
    const queue = [...batch];
    const active = new Set<string>();

    const updateFile = (id: string, patch: Partial<BatchFile>) => {
      setBatchFiles((prev) =>
        prev.map((bf) => (bf.id === id ? { ...bf, ...patch } : bf)),
      );
    };

    const processOne = async (bf: BatchFile) => {
      if (abortRef.current) return;
      active.add(bf.id);
      updateFile(bf.id, { status: "uploading" });
      try {
        const res = await uploadTranscript(bf.file, project, transcriptionModel);
        updateFile(bf.id, { status: "processing", taskId: res.task_id });
        // We don't wait for processing to finish — it happens server-side
        updateFile(bf.id, { status: "done", taskId: res.task_id });
      } catch (err) {
        updateFile(bf.id, { status: "error", error: String(err) });
      } finally {
        active.delete(bf.id);
      }
    };

    // Run with concurrency limit
    let idx = 0;
    const runNext = async (): Promise<void> => {
      while (idx < queue.length && !abortRef.current) {
        if (active.size >= MAX_CONCURRENT) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        const item = queue[idx++];
        processOne(item); // fire and don't await — managed by concurrency
      }
      // Wait for remaining active
      while (active.size > 0) {
        await new Promise((r) => setTimeout(r, 300));
      }
    };

    await runNext();
    setHistoryRefreshKey((k) => k + 1);
    setBatchActive(false);
  }, [files, project, transcriptionModel]);

  const onSubmit = useCallback(() => {
    if (files.length === 1) return onSubmitSingle();
    if (files.length >= 2) return onSubmitBatch();
  }, [files.length, onSubmitSingle, onSubmitBatch]);

  const onCancelBatch = useCallback(() => {
    abortRef.current = true;
  }, []);

  const onCloseBatch = useCallback(() => {
    setBatchFiles([]);
    setBatchActive(false);
  }, []);

  // --- Existing callbacks (unchanged) ---
  const onProgressDone = useCallback(async (_resultUrl: string | null, taskId: string) => {
    setActiveTaskId(null);
    setHistoryRefreshKey((k) => k + 1);
    try {
      const data = await fetchTranscriptResult(taskId);
      setBriefResult(data);
    } catch (err) {
      setResult({ ok: false, message: `Обработка завершена, но не удалось загрузить результат: ${err}` });
    }
  }, []);

  const onRetry = useCallback(() => {
    setActiveTaskId(null);
    setResult(null);
  }, []);

  const onNewUpload = useCallback(() => {
    setBriefResult(null);
    setEditing(false);
    setResult(null);
  }, []);

  const onOpenFromHistory = useCallback(async (taskId: string) => {
    setBriefResult(null);
    setEditing(false);
    setResult(null);
    setLoadingBrief(true);
    try {
      const data = await fetchTranscriptResult(taskId);
      setBriefResult(data);
    } catch (err) {
      setResult({ ok: false, message: `Не удалось загрузить результат: ${err}` });
    } finally {
      setLoadingBrief(false);
    }
  }, []);

  const onResumeFromHistory = useCallback((taskId: string) => {
    setBriefResult(null);
    setEditing(false);
    setResult(null);
    setActiveTaskId(taskId);
  }, []);

  const onEditSave = useCallback((updatedBrief: string) => {
    setBriefResult((prev) => prev ? { ...prev, brief: updatedBrief } : prev);
    setEditing(false);
  }, []);

  // Determine if any selected file is audio (for model toggle)
  const hasAudio = files.some((f) => isAudioFile(f.name));

  // Batch progress stats
  const batchDone = batchFiles.filter((f) => f.status === "done").length;
  const batchErrors = batchFiles.filter((f) => f.status === "error").length;
  const batchTotal = batchFiles.length;
  const batchAllFinished = batchFiles.length > 0 && batchFiles.every((f) => f.status === "done" || f.status === "error");

  const showUploadForm = !activeTaskId && !briefResult && !loadingBrief && !batchActive && batchFiles.length === 0;

  return (
    <div className="bento-panel span-12 panel-projects">
      <div className="bento-panel-title">
        <div>
          Транскрипты
          <span className="audit-header-sub">Загрузка и обработка аудио / текстовых файлов</span>
        </div>
      </div>

      {/* Loading BRIEF from history */}
      {loadingBrief && (
        <div className="tpc-history-loading">
          <div className="audit-spinner" /> Загрузка результата...
        </div>
      )}

      {/* Editor mode */}
      {briefResult && editing && (
        <TranscriptEditor
          taskId={briefResult.task_id}
          initialBrief={briefResult.brief}
          onSave={onEditSave}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* BRIEF result (shown after successful processing or history open) */}
      {briefResult && !editing && (
        <TranscriptBrief
          result={briefResult}
          onNewUpload={onNewUpload}
          onEdit={() => setEditing(true)}
        />
      )}

      {/* Progress tracker (shown after single upload) */}
      {activeTaskId && (
        <TranscriptProgress
          taskId={activeTaskId}
          onDone={onProgressDone}
          onRetry={onRetry}
        />
      )}

      {/* Batch upload progress */}
      {batchFiles.length > 0 && (
        <div className="tpc-batch">
          <div className="tpc-batch-header">
            <span className="tpc-batch-title">
              Пакетная загрузка
            </span>
            <span className="tpc-batch-progress">
              {batchDone}/{batchTotal} готово
              {batchErrors > 0 && <span className="tpc-batch-errors">, {batchErrors} ошибок</span>}
            </span>
          </div>

          {/* Overall progress bar */}
          <div className="tpc-batch-bar">
            <div
              className="tpc-batch-bar-fill"
              style={{ width: `${((batchDone + batchErrors) / batchTotal) * 100}%` }}
            />
          </div>

          {/* Per-file status list */}
          <div className="tpc-batch-list">
            {batchFiles.map((bf) => (
              <div key={bf.id} className={`tpc-batch-item tpc-batch-item--${bf.status}`}>
                <span className="tpc-batch-item-icon">
                  {bf.status === "pending" && "⏳"}
                  {bf.status === "uploading" && "⬆️"}
                  {bf.status === "processing" && "⚙️"}
                  {bf.status === "done" && "✅"}
                  {bf.status === "error" && "❌"}
                </span>
                <span className="tpc-batch-item-name">{bf.file.name}</span>
                <span className="tpc-batch-item-status">
                  {bf.status === "pending" && "Ожидание"}
                  {bf.status === "uploading" && "Загрузка..."}
                  {bf.status === "processing" && "Обработка..."}
                  {bf.status === "done" && "Готово"}
                  {bf.status === "error" && (bf.error ?? "Ошибка")}
                </span>
              </div>
            ))}
          </div>

          {/* Batch actions */}
          <div className="tpc-batch-actions">
            {batchActive && (
              <button className="btn btn-sm" onClick={onCancelBatch}>
                Отменить
              </button>
            )}
            {batchAllFinished && (
              <button className="btn btn-sm btn-primary" onClick={onCloseBatch}>
                Закрыть
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upload form (hidden while progress is active, brief is shown, or loading) */}
      {showUploadForm && (
        <div className="tpc-form">
          {/* Drop zone */}
          <div
            className={`tpc-dropzone${dragging ? " tpc-dropzone--active" : ""}${files.length > 0 ? " tpc-dropzone--has-file" : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ALL_ACCEPTED}
              multiple
              onChange={onFileChange}
              className="tpc-file-input"
            />
            {files.length > 0 ? (
              <div className="tpc-file-list" onClick={(e) => e.stopPropagation()}>
                {files.map((f, i) => {
                  const ext = getFileExt(f.name);
                  const audio = AUDIO_EXTENSIONS.includes(ext);
                  return (
                    <div key={`${f.name}-${i}`} className="tpc-file-info">
                      <span className={`tpc-file-badge${audio ? " tpc-file-badge--audio" : " tpc-file-badge--text"}`}>
                        {audio ? "🎙" : "📄"}
                      </span>
                      <span className="tpc-file-name">{f.name}</span>
                      <span className="tpc-file-size">{(f.size / 1024).toFixed(1)} KB</span>
                      <button
                        className="tpc-file-remove"
                        onClick={() => removeFile(i)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <div className="tpc-file-list-footer">
                  <span className="tpc-file-count">{files.length} файл{files.length === 1 ? "" : files.length < 5 ? "а" : "ов"}</span>
                  <button className="tpc-file-clear" onClick={clearFiles}>Очистить все</button>
                </div>
              </div>
            ) : (
              <div className="tpc-drop-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Перетащите файлы сюда или нажмите для выбора</p>
                <span className="tpc-drop-hint">mp3, wav, m4a, txt, md (до {MAX_FILES} файлов)</span>
              </div>
            )}
          </div>

          {/* Project selector + model toggle + submit */}
          <div className="tpc-controls">
            <div className="tpc-field">
              <label className="tpc-label" htmlFor="tpc-project">Проект</label>
              <select
                id="tpc-project"
                className="tpc-select"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.repo} value={p.repo}>
                    {p.repo} — {p.client}
                  </option>
                ))}
              </select>
            </div>

            {/* Model toggle (only when audio files selected) */}
            {hasAudio && (
              <div className="tpc-field tpc-model-field">
                <label className="tpc-label">Модель</label>
                <div className="tpc-model-toggle">
                  <button
                    type="button"
                    className={`tpc-model-option${transcriptionModel === "fast" ? " tpc-model-option--active" : ""}`}
                    onClick={() => setTranscriptionModel("fast")}
                    title="30 секунд, спикеры определяются по контексту"
                  >
                    <span className="tpc-model-icon">&#9889;</span>
                    Быстрая
                  </button>
                  <button
                    type="button"
                    className={`tpc-model-option${transcriptionModel === "quality" ? " tpc-model-option--active" : ""}`}
                    onClick={() => setTranscriptionModel("quality")}
                    title="7-15 минут, точная диаризация спикеров"
                  >
                    <span className="tpc-model-icon">&#127919;</span>
                    Качественная
                  </button>
                </div>
              </div>
            )}

            <button
              className="btn btn-primary tpc-submit"
              disabled={files.length === 0}
              onClick={onSubmit}
            >
              {files.length > 1 ? `Обработать (${files.length})` : "Обработать"}
            </button>
          </div>

          {/* Result feedback */}
          {result && (
            <div className={`tpc-result${result.ok ? " tpc-result--ok" : " tpc-result--err"}`}>
              {result.message}
            </div>
          )}
        </div>
      )}

      {/* History table (hidden when BRIEF is shown or loading) */}
      {!briefResult && !activeTaskId && !loadingBrief && (
        <TranscriptHistory onOpen={onOpenFromHistory} onResume={onResumeFromHistory} refreshKey={historyRefreshKey} />
      )}
    </div>
  );
}
