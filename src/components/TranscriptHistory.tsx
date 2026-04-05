import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchTranscriptList, type TranscriptListItem } from "../utils/transcript";

interface Props {
  onOpen: (taskId: string) => void;
  refreshKey: number; // increment to trigger refresh
}

const STATUS_LABELS: Record<string, string> = {
  done: "Готово",
  processing: "В обработке",
  failed: "Ошибка",
};

const STATUS_CLASS: Record<string, string> = {
  done: "tpc-status--done",
  processing: "tpc-status--processing",
  failed: "tpc-status--failed",
};

export function TranscriptHistory({ onOpen, refreshKey }: Props) {
  const [items, setItems] = useState<TranscriptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState("");
  const prevRefreshKey = useRef(refreshKey);

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

  const projects = useMemo(
    () => [...new Set(items.map((i) => i.project))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const list = filterProject
      ? items.filter((i) => i.project === filterProject)
      : items;
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
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
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.task_id}>
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
                  <td>
                    <span className={`tpc-status ${STATUS_CLASS[item.status] ?? ""}`}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td>
                    {item.status === "done" && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => onOpen(item.task_id)}
                      >
                        Открыть
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
