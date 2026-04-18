import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTranscriptList,
  deleteTranscript,
  type TranscriptListItem,
  type TranscriptQuality,
} from "../utils/transcript";

interface Props {
  onOpen: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  refreshKey: number; // increment to trigger refresh
}

const STATUS_LABELS: Record<string, string> = {
  done: "Готово",
  queued: "В очереди",
  transcribing: "Транскрипция",
  processing: "Обработка",
  error: "Ошибка",
};

const STATUS_CLASS: Record<string, string> = {
  done: "tpc-status--done",
  queued: "tpc-status--active",
  transcribing: "tpc-status--active",
  processing: "tpc-status--active",
  error: "tpc-status--failed",
};

const ACTIVE_STATUSES = new Set(["queued", "transcribing", "processing"]);

const STAGE_LABELS: Record<string, string> = {
  intake: "Приём",
  stt: "Транскрипция",
  enrichment: "Обогащение",
  structuring: "Структуризация",
  synthesis: "Синтез",
};

const QUALITY_LABEL: Record<TranscriptQuality, string> = {
  pass: "ОК",
  warning: "Замечания",
  needs_review: "Проверить",
};

const QUALITY_CLASS: Record<TranscriptQuality, string> = {
  pass: "pass",
  warning: "warning",
  needs_review: "needs-review",
};

export function TranscriptHistory({ onOpen, onResume, onRetry, refreshKey }: Props) {
  const [items, setItems] = useState<TranscriptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState("");
  const prevRefreshKey = useRef(refreshKey);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval>>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTranscriptList();
      setItems(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload when refreshKey changes (after new upload completes)
  useEffect(() => {
    if (refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey;
      load();
    }
  }, [refreshKey, load]);

  // Auto-refresh while there are active jobs
  const hasActive = useMemo(
    () => items.some((i) => ACTIVE_STATUSES.has(i.status)),
    [items],
  );

  useEffect(() => {
    if (hasActive) {
      autoRefreshRef.current = setInterval(load, 5000);
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [hasActive, load]);

  const handleDelete = useCallback(async (taskId: string, filename: string) => {
    if (!window.confirm(`Удалить транскрипцию ${filename}?`)) return;
    try {
      await deleteTranscript(taskId);
      setItems((prev) => prev.filter((i) => i.task_id !== taskId));
    } catch (err) {
      setError(`Не удалось удалить: ${err}`);
    }
  }, []);

  const projects = useMemo(
    () => [...new Set(items.map((i) => i.project))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const list = filterProject
      ? items.filter((i) => i.project === filterProject)
      : items;
    // Active jobs first, then by date
    return [...list].sort((a, b) => {
      const aActive = ACTIVE_STATUSES.has(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items, filterProject]);

  if (loading) {
    return (
      <div className="tpc-history-loading">
        <div className="audit-spinner" /> Загрузка истории...
      </div>
    );
  }

  if (error) {
    return (
      <div className="tpc-history-error">
        <p>Не удалось загрузить историю</p>
        <button className="btn btn-sm" onClick={load}>Повторить</button>
      </div>
    );
  }

  return (
    <div className="tpc-history">
      <div className="tpc-history-header">
        <span className="tpc-history-title">
          История ({filtered.length})
        </span>
        {projects.length > 1 && (
          <select
            className="tpc-select tpc-history-filter"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">Все проекты</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="tpc-history-empty">Нет обработанных транскрипций</div>
      ) : (
        <div className="tpc-history-table-wrap">
          <table className="tpc-history-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Проект</th>
                <th>Файл</th>
                <th>Модель</th>
                <th>Статус</th>
                <th>Качество</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isActive = ACTIVE_STATUSES.has(item.status);
                return (
                  <tr key={item.task_id} className={isActive ? "tpc-history-row--active" : ""}>
                    <td className="tpc-history-date">
                      {new Date(item.created_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="tpc-history-project">{item.project}</td>
                    <td className="tpc-history-file">{item.filename}</td>
                    <td className="tpc-history-model">
                      {item.transcription_model === "quality" ? (
                        <span title="Качественная (диаризация)">&#127919;</span>
                      ) : item.transcription_model === "fast" ? (
                        <span title="Быстрая">&#9889;</span>
                      ) : (
                        <span className="tpc-text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`tpc-status ${STATUS_CLASS[item.status] ?? ""}`}>
                        {isActive && <span className="tpc-status-pulse" />}
                        {STATUS_LABELS[item.status] ?? item.status}
                        {item.status === "error" && item.current_stage && STAGE_LABELS[item.current_stage] && (
                          <span className="tpc-status-stage"> ({STAGE_LABELS[item.current_stage]})</span>
                        )}
                      </span>
                    </td>
                    <td className="tpc-history-quality">
                      {item.status === "done" ? (
                        item.quality ? (
                          <span className={`tpc-quality-badge tpc-quality-badge--${QUALITY_CLASS[item.quality]} tpc-quality-badge--static tpc-quality-badge--sm`}>
                            {QUALITY_LABEL[item.quality]}
                          </span>
                        ) : (
                          <span className="tpc-text-muted">—</span>
                        )
                      ) : (
                        <span className="tpc-text-muted">—</span>
                      )}
                    </td>
                    <td className="tpc-history-actions">
                      {item.status === "done" && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => onOpen(item.task_id)}
                        >
                          Открыть
                        </button>
                      )}
                      {isActive && (
                        <button
                          className="btn btn-sm"
                          onClick={() => onResume(item.task_id)}
                        >
                          Следить
                        </button>
                      )}
                      {item.status === "error" && (
                        <button
                          className="btn btn-sm"
                          onClick={() => onRetry(item.task_id)}
                          title="Повторить с момента сбоя"
                        >
                          ↻ Повторить
                        </button>
                      )}
                      {(item.status === "done" || item.status === "error") && (
                        <button
                          className="btn btn-sm tpc-delete-btn"
                          onClick={() => handleDelete(item.task_id, item.filename)}
                          title="Удалить транскрипцию"
                        >
                          &#128465;
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
