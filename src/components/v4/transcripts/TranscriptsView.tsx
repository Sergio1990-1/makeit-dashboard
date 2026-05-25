import { useCallback, useEffect, useRef, useState } from "react";
import {
  uploadTranscript,
  retryTranscript,
  fetchTranscriptResult,
  fetchTranscriptList,
  type TranscriptResult,
  type TranscriptionModel,
} from "../../../utils/transcript";
import type { ProjectConfig } from "../../../types";
import { UploadZone } from "./UploadZone";
import { TranscriptProgressV4 } from "./TranscriptProgressV4";
import { BatchProgressV4, type BatchFile, type BatchFileStatus } from "./BatchProgressV4";
import { TranscriptBriefV4 } from "./TranscriptBriefV4";
import { TranscriptEditorV4 } from "./TranscriptEditorV4";
import { TranscriptHistoryV4 } from "./TranscriptHistoryV4";

interface Props {
  projects: ProjectConfig[];
}

const ACTIVE_STATUSES = new Set(["queued", "transcribing", "processing"]);
const MAX_CONCURRENT = 2;

const STORAGE = {
  project: "tpc:lastProject",
  model: "tpc:lastModel",
};

export function TranscriptsView({ projects }: Props) {
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    return localStorage.getItem(STORAGE.project) || projects[0]?.repo || "";
  });
  const [selectedModel, setSelectedModel] = useState<TranscriptionModel>(() => {
    const v = localStorage.getItem(STORAGE.model);
    return v === "fast" || v === "quality" ? v : "fast";
  });

  useEffect(() => { localStorage.setItem(STORAGE.project, selectedProject); }, [selectedProject]);
  useEffect(() => { localStorage.setItem(STORAGE.model, selectedModel); }, [selectedModel]);

  // Active task / batch / brief / editor states (mutually exclusive at the
  // top of the page).
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [briefResult, setBriefResult] = useState<TranscriptResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Aggregate counters from history (updates with refreshKey + initial load)
  const [agg, setAgg] = useState({ total: 0, active: 0, done: 0, error: 0 });

  const refreshAgg = useCallback(async () => {
    try {
      const list = await fetchTranscriptList();
      const c = { total: list.length, active: 0, done: 0, error: 0 };
      for (const i of list) {
        if (ACTIVE_STATUSES.has(i.status)) c.active++;
        else if (i.status === "done") c.done++;
        else if (i.status === "error") c.error++;
      }
      setAgg(c);
    } catch {
      /* silently ignore — history component will surface load errors */
    }
  }, []);

  useEffect(() => {
    refreshAgg();
  }, [refreshAgg, historyRefreshKey]);

  // Auto-refresh agg every 10s while there are active tasks
  useEffect(() => {
    if (agg.active === 0) return;
    const id = setInterval(refreshAgg, 10_000);
    return () => clearInterval(id);
  }, [agg.active, refreshAgg]);

  // Batch upload state
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  const abortRef = useRef(false);

  const onSubmitSingle = useCallback(async (file: File) => {
    setUploadError(null);
    setBriefResult(null);
    setEditing(false);
    try {
      const res = await uploadTranscript(file, selectedProject, selectedModel);
      setActiveTaskId(res.task_id);
      setHistoryRefreshKey((k) => k + 1);
    } catch (err) {
      setUploadError(String(err));
      // Re-throw so UploadZone keeps the selected file and the user can retry
      // without having to pick it again.
      throw err;
    }
  }, [selectedProject, selectedModel]);

  const onSubmitBatch = useCallback(async (files: File[]) => {
    abortRef.current = false;
    setBriefResult(null);
    setEditing(false);
    setUploadError(null);

    const batch: BatchFile[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      status: "pending" as BatchFileStatus,
    }));
    setBatchFiles(batch);
    setBatchActive(true);

    const queue = [...batch];
    const activeIds = new Set<string>();

    const updateFile = (id: string, patch: Partial<BatchFile>) => {
      setBatchFiles((prev) =>
        prev.map((bf) => (bf.id === id ? { ...bf, ...patch } : bf))
      );
    };

    const processOne = async (bf: BatchFile) => {
      if (abortRef.current) {
        activeIds.delete(bf.id);
        return;
      }
      updateFile(bf.id, { status: "uploading" });
      try {
        const res = await uploadTranscript(bf.file, selectedProject, selectedModel);
        updateFile(bf.id, { status: "done", taskId: res.task_id });
      } catch (err) {
        updateFile(bf.id, { status: "error", error: String(err) });
      } finally {
        activeIds.delete(bf.id);
      }
    };

    let idx = 0;
    const runNext = async (): Promise<void> => {
      while (idx < queue.length && !abortRef.current) {
        if (activeIds.size >= MAX_CONCURRENT) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        const item = queue[idx++];
        activeIds.add(item.id);
        // Fire-and-forget — surface unexpected throws so they don't
        // become silent unhandled-rejection warnings.
        processOne(item).catch((err) => {
          console.error("[transcripts] batch processOne unexpected error:", err);
          activeIds.delete(item.id);
        });
      }
      while (activeIds.size > 0) {
        await new Promise((r) => setTimeout(r, 300));
      }
    };

    try {
      await runNext();
    } finally {
      setHistoryRefreshKey((k) => k + 1);
      setBatchActive(false);
    }
  }, [selectedProject, selectedModel]);

  const onSubmitFromZone = useCallback((files: File[]) => {
    if (files.length === 1) return onSubmitSingle(files[0]);
    if (files.length >= 2) return onSubmitBatch(files);
  }, [onSubmitSingle, onSubmitBatch]);

  const onCancelBatch = useCallback(() => {
    abortRef.current = true;
  }, []);
  const onCloseBatch = useCallback(() => {
    setBatchFiles([]);
    setBatchActive(false);
  }, []);

  const onProgressDone = useCallback(async (_resultUrl: string | null, taskId: string) => {
    setActiveTaskId(null);
    setHistoryRefreshKey((k) => k + 1);
    try {
      const data = await fetchTranscriptResult(taskId);
      setBriefResult(data);
    } catch (err) {
      setUploadError(`Обработка завершена, но не удалось загрузить результат: ${err}`);
    }
  }, []);

  const onRetry = useCallback(() => {
    setActiveTaskId(null);
    setUploadError(null);
  }, []);

  const onNewUpload = useCallback(() => {
    setBriefResult(null);
    setEditing(false);
    setUploadError(null);
  }, []);

  const onOpenFromHistory = useCallback(async (taskId: string) => {
    setBriefResult(null);
    setEditing(false);
    setUploadError(null);
    setLoadingBrief(true);
    try {
      const data = await fetchTranscriptResult(taskId);
      setBriefResult(data);
    } catch (err) {
      setUploadError(`Не удалось загрузить результат: ${err}`);
    } finally {
      setLoadingBrief(false);
    }
  }, []);

  const onResumeFromHistory = useCallback((taskId: string) => {
    setBriefResult(null);
    setEditing(false);
    setUploadError(null);
    setActiveTaskId(taskId);
  }, []);

  // Per-taskId double-click protection lives in TranscriptHistoryV4
  // (inflightRetriesRef guards each row's button). No view-level guard
  // needed — and adding one would create dead code that misleads readers.
  const onRetryFromHistory = useCallback(
    async (
      taskId: string,
      originalModel: TranscriptionModel | undefined,
      originalProject: string,
    ) => {
      setBriefResult(null);
      setEditing(false);
      setUploadError(null);
      try {
        const res = await retryTranscript(
          taskId,
          originalModel ?? "fast",
          originalProject,
        );
        setActiveTaskId(res.task_id);
        setHistoryRefreshKey((k) => k + 1);
      } catch (err) {
        setUploadError(`Не удалось повторить: ${err}`);
      }
    },
    []
  );

  const onEditSave = useCallback((updatedBrief: string) => {
    setBriefResult((prev) => (prev ? { ...prev, brief: updatedBrief } : prev));
    setEditing(false);
  }, []);

  const showUploadForm =
    !activeTaskId && !briefResult && !loadingBrief && !batchActive && batchFiles.length === 0;

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Транскрипты</h1>
          <div className="v4-sub">Загрузка и обработка аудио / текстовых файлов</div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      {/* Aggregate strip */}
      <div className="v4-projects-toolbar v4-pl-kpi-strip">
        <div className="v4-projects-agg">
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{agg.total}</div>
            <div className="v4-projects-agg-l">в истории</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div
              className="v4-projects-agg-n num"
              style={{ color: agg.active > 0 ? "var(--v4-accent-700)" : undefined }}
            >
              {agg.active}
            </div>
            <div className="v4-projects-agg-l">в работе</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div
              className="v4-projects-agg-n num"
              style={{ color: agg.done > 0 ? "var(--v4-success-700)" : undefined }}
            >
              {agg.done}
            </div>
            <div className="v4-projects-agg-l">готово</div>
          </div>
          <div className="v4-projects-agg-cell">
            <div
              className="v4-projects-agg-n num"
              style={{ color: agg.error > 0 ? "var(--v4-danger-700)" : undefined }}
            >
              {agg.error}
            </div>
            <div className="v4-projects-agg-l">ошибки</div>
          </div>
        </div>
      </div>

      {loadingBrief && (
        <div className="v4-panel">
          <div className="v4-empty">Загрузка результата…</div>
        </div>
      )}

      {briefResult && editing && (
        <TranscriptEditorV4
          taskId={briefResult.task_id}
          initialBrief={briefResult.brief}
          onSave={onEditSave}
          onCancel={() => setEditing(false)}
        />
      )}

      {briefResult && !editing && (
        <TranscriptBriefV4
          result={briefResult}
          onNewUpload={onNewUpload}
          onEdit={() => setEditing(true)}
        />
      )}

      {activeTaskId && (
        <TranscriptProgressV4
          taskId={activeTaskId}
          onDone={onProgressDone}
          onRetry={onRetry}
        />
      )}

      {batchFiles.length > 0 && (
        <BatchProgressV4
          files={batchFiles}
          active={batchActive}
          onCancel={onCancelBatch}
          onClose={onCloseBatch}
        />
      )}

      {showUploadForm && (
        <UploadZone
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onSubmit={onSubmitFromZone}
          errorMessage={uploadError}
        />
      )}

      {/* History — hidden when a brief is being viewed/edited, actively
          polled, or batch is in flight (its own auto-refresh + the history
          5s poll would race). */}
      {!briefResult && !activeTaskId && !loadingBrief && !batchActive && batchFiles.length === 0 && (
        <TranscriptHistoryV4
          onOpen={onOpenFromHistory}
          onResume={onResumeFromHistory}
          onRetry={onRetryFromHistory}
          refreshKey={historyRefreshKey}
          onItemsChanged={() => setHistoryRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
