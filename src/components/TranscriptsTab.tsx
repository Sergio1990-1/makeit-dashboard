import { useCallback, useRef, useState } from "react";
import { uploadTranscript, fetchTranscriptResult, type TranscriptResult, type TranscriptionModel } from "../utils/transcript";
import { TranscriptProgress } from "./TranscriptProgress";
import { TranscriptBrief } from "./TranscriptBrief";
import { TranscriptEditor } from "./TranscriptEditor";
import { TranscriptHistory } from "./TranscriptHistory";
import type { ProjectConfig } from "../types";

const VALID_EXTENSIONS = ["mp3", "wav", "m4a", "txt", "md"];
const ALL_ACCEPTED = ".mp3,.wav,.m4a,.txt,.md";

interface Props {
  projects: ProjectConfig[];
}

export function TranscriptsTab({ projects }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [project, setProject] = useState(projects[0]?.repo ?? "");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [briefResult, setBriefResult] = useState<TranscriptResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [transcriptionModel, setTranscriptionModel] = useState<TranscriptionModel>("fast");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
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
      const dropped = e.dataTransfer.files[0];
      if (!dropped) return;
      const ext = dropped.name.split(".").pop()?.toLowerCase() ?? "";
      if (!VALID_EXTENSIONS.includes(ext)) {
        setResult({ ok: false, message: `Неподдерживаемый формат .${ext}. Допустимые: ${VALID_EXTENSIONS.join(", ")}` });
        return;
      }
      handleFile(dropped);
    },
    [handleFile],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0] ?? null);
    },
    [handleFile],
  );

  const onSubmit = useCallback(async () => {
    if (!file || !project) return;
    setUploading(true);
    setResult(null);
    setBriefResult(null);
    setEditing(false);
    try {
      const res = await uploadTranscript(file, project, transcriptionModel);
      setActiveTaskId(res.task_id);
      setHistoryRefreshKey((k) => k + 1);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setResult({ ok: false, message: String(err) });
    } finally {
      setUploading(false);
    }
  }, [file, project, transcriptionModel]);

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

  const fileExt = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const isAudio = ["mp3", "wav", "m4a"].includes(fileExt);

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

      {/* Progress tracker (shown after upload) */}
      {activeTaskId && (
        <TranscriptProgress
          taskId={activeTaskId}
          onDone={onProgressDone}
          onRetry={onRetry}
        />
      )}

      {/* Upload form (hidden while progress is active, brief is shown, or loading) */}
      {!activeTaskId && !briefResult && !loadingBrief && (
        <div className="tpc-form">
          {/* Drop zone */}
          <div
            className={`tpc-dropzone${dragging ? " tpc-dropzone--active" : ""}${file ? " tpc-dropzone--has-file" : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ALL_ACCEPTED}
              onChange={onFileChange}
              className="tpc-file-input"
            />
            {file ? (
              <div className="tpc-file-info">
                <span className={`tpc-file-badge${isAudio ? " tpc-file-badge--audio" : " tpc-file-badge--text"}`}>
                  {isAudio ? "🎙 Аудио" : "📄 Текст"}
                </span>
                <span className="tpc-file-name">{file.name}</span>
                <span className="tpc-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                <button
                  className="tpc-file-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="tpc-drop-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Перетащите файл сюда или нажмите для выбора</p>
                <span className="tpc-drop-hint">mp3, wav, m4a, txt, md</span>
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

            {/* Model toggle (only for audio files) */}
            {isAudio && (
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
              disabled={!file || uploading}
              onClick={onSubmit}
            >
              {uploading ? "Отправка…" : "Обработать"}
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
