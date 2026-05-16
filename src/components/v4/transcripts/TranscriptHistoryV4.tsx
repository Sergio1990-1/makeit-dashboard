import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTranscriptList,
  deleteTranscript,
  type TranscriptListItem,
  type TranscriptionModel,
} from "../../../utils/transcript";

interface Props {
  onOpen: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onRetry: (
    taskId: string,
    transcriptionModel: TranscriptionModel | undefined,
    project: string,
  ) => Promise<void>;
  refreshKey: number;
  onItemsChanged?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  done: "Готово",
  queued: "В очереди",
  transcribing: "Транскрипция",
  processing: "Обработка",
  error: "Ошибка",
};

const STATUS_CLASS: Record<string, string> = {
  done: "v4-tpc-status--done",
  queued: "v4-tpc-status--active",
  transcribing: "v4-tpc-status--active",
  processing: "v4-tpc-status--active",
  error: "v4-tpc-status--err",
};

const ACTIVE_STATUSES = new Set(["queued", "transcribing", "processing"]);

type StatusFilter = "all" | "active" | "done" | "error";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "Все",
  active: "Активные",
  done: "Готово",
  error: "Ошибки",
};

type SortKey = "date" | "filename" | "project" | "model" | "status";

const SORT_LABELS: Record<SortKey, string> = {
  date: "Дата",
  filename: "Файл",
  project: "Проект",
  model: "Модель",
  status: "Статус",
};

interface ToolbarState {
  filter: StatusFilter;
  query: string;
  project: string;
  model: TranscriptionModel | "all";
  sort: SortKey;
  asc: boolean;
}

const STORAGE_KEY = "makeit.transcriptsHistory.v1";

const VALID_FILTERS: readonly StatusFilter[] = ["all", "active", "done", "error"];
const VALID_SORTS: readonly SortKey[] = ["date", "filename", "project", "model", "status"];
const VALID_MODELS: readonly (TranscriptionModel | "all")[] = ["all", "fast", "quality"];

function loadState(): ToolbarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ToolbarState>;
      return {
        filter: VALID_FILTERS.includes(p.filter as StatusFilter)
          ? (p.filter as StatusFilter)
          : "all",
        query: "",
        project: typeof p.project === "string" ? p.project : "",
        model: VALID_MODELS.includes(p.model as TranscriptionModel | "all")
          ? (p.model as TranscriptionModel | "all")
          : "all",
        sort: VALID_SORTS.includes(p.sort as SortKey) ? (p.sort as SortKey) : "date",
        asc: typeof p.asc === "boolean" ? p.asc : false,
      };
    }
  } catch {
    /* ignore */
  }
  return { filter: "all", query: "", project: "", model: "all", sort: "date", asc: false };
}

function saveState(s: ToolbarState) {
  try {
    const { query: _q, ...persist } = s;
    void _q;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  } catch {
    /* ignore */
  }
}

function matchesFilter(item: TranscriptListItem, f: StatusFilter): boolean {
  if (f === "all") return true;
  if (f === "active") return ACTIVE_STATUSES.has(item.status);
  if (f === "done") return item.status === "done";
  if (f === "error") return item.status === "error";
  return true;
}

export function TranscriptHistoryV4({ onOpen, onResume, onRetry, refreshKey, onItemsChanged }: Props) {
  const [items, setItems] = useState<TranscriptListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [state, setState] = useState<ToolbarState>(() => loadState());
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const prevRefreshKey = useRef(refreshKey);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Outside click + Escape for sort menu
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!sortMenuRef.current?.contains(e.target as Node)) setSortMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortMenuOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

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

  useEffect(() => {
    if (refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey;
      load();
    }
  }, [refreshKey, load]);

  const hasActive = useMemo(
    () => items.some((i) => ACTIVE_STATUSES.has(i.status)),
    [items]
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

  const inflightRetriesRef = useRef<Set<string>>(new Set());
  const handleRetry = useCallback(
    async (
      taskId: string,
      model: TranscriptionModel | undefined,
      project: string,
    ) => {
      if (inflightRetriesRef.current.has(taskId)) return;
      inflightRetriesRef.current.add(taskId);
      setRetryingIds(new Set(inflightRetriesRef.current));
      try {
        await onRetry(taskId, model, project);
      } finally {
        inflightRetriesRef.current.delete(taskId);
        setRetryingIds(new Set(inflightRetriesRef.current));
      }
    },
    [onRetry]
  );

  const handleDelete = useCallback(async (taskId: string, filename: string) => {
    if (!window.confirm(`Удалить транскрипцию ${filename}?`)) return;
    setDeleteError(null);
    try {
      await deleteTranscript(taskId);
      setItems((prev) => prev.filter((i) => i.task_id !== taskId));
      onItemsChanged?.();
    } catch (err) {
      // Use a separate state from the load-error so the delete failure is
      // visible even when items.length > 0 (the load-error panel is
      // conditional on empty list).
      setDeleteError(`Не удалось удалить ${filename}: ${err}`);
    }
  }, [onItemsChanged]);

  const projects = useMemo(
    () => [...new Set(items.map((i) => i.project))].sort(),
    [items]
  );

  // If a stale persisted project filter is no longer present in the dataset,
  // reset it to "" — otherwise the user may see zero rows with no way to clear
  // the filter (the selector is hidden when projects.length <= 1).
  useEffect(() => {
    if (loading) return;
    if (state.project && !projects.includes(state.project)) {
      setState((s) => (s.project ? { ...s, project: "" } : s));
    }
  }, [projects, state.project, loading]);

  const counts = useMemo(() => {
    const c = { all: items.length, active: 0, done: 0, error: 0 };
    for (const i of items) {
      if (ACTIVE_STATUSES.has(i.status)) c.active++;
      else if (i.status === "done") c.done++;
      else if (i.status === "error") c.error++;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return items.filter((i) => {
      if (!matchesFilter(i, state.filter)) return false;
      if (state.project && i.project !== state.project) return false;
      if (state.model !== "all" && i.transcription_model !== state.model) return false;
      if (q && !i.filename.toLowerCase().includes(q) && !i.project.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, state.filter, state.project, state.model, state.query]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      // Always keep active rows on top regardless of sort
      const aActive = ACTIVE_STATUSES.has(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      let cmp = 0;
      switch (state.sort) {
        case "date":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "filename":
          cmp = a.filename.localeCompare(b.filename, "ru");
          break;
        case "project":
          cmp = a.project.localeCompare(b.project, "ru");
          break;
        case "model":
          cmp = (a.transcription_model ?? "").localeCompare(b.transcription_model ?? "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return state.asc ? cmp : -cmp;
    });
    return out;
  }, [filtered, state.sort, state.asc]);

  if (loading && items.length === 0) {
    return (
      <div className="v4-panel">
        <div className="v4-empty">Загрузка истории…</div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="v4-panel">
        <div className="v4-empty">
          <p style={{ marginBottom: 12 }}>Не удалось загрузить историю</p>
          <button type="button" className="v4-btn v4-btn--pri" onClick={load}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="v4-panel v4-tpc-history-panel">
      <div className="v4-panel-h v4-tpc-history-h">
        <div className="v4-panel-t">
          История <span className="v4-tag">{filtered.length}/{items.length}</span>
        </div>
        <div className="v4-panel-actions v4-tpc-history-tools">
          <div className="v4-pillgrp">
            {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((k) => (
              <button
                key={k}
                type="button"
                className={state.filter === k ? "is-active" : ""}
                onClick={() => setState((s) => ({ ...s, filter: k }))}
              >
                {FILTER_LABELS[k]} {counts[k] > 0 && <>· {counts[k]}</>}
              </button>
            ))}
          </div>
          <div className="v4-search v4-tpc-history-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={state.query}
              onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
              placeholder="Поиск по filename / project…"
              aria-label="Поиск истории"
            />
          </div>
          {projects.length > 1 && (
            <select
              className="v4-pl-input v4-tpc-history-select"
              value={state.project}
              onChange={(e) => setState((s) => ({ ...s, project: e.target.value }))}
              aria-label="Фильтр по проекту"
            >
              <option value="">Все проекты</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          <select
            className="v4-pl-input v4-tpc-history-select"
            value={state.model}
            onChange={(e) =>
              setState((s) => ({ ...s, model: e.target.value as TranscriptionModel | "all" }))
            }
            aria-label="Фильтр по модели"
          >
            <option value="all">Все модели</option>
            <option value="fast">Быстрая</option>
            <option value="quality">Качественная</option>
          </select>
          <div className="v4-projects-sort" ref={sortMenuRef}>
            <button
              type="button"
              className="v4-btn"
              onClick={() => setSortMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
            >
              {SORT_LABELS[state.sort]} {state.asc ? "↑" : "↓"}
            </button>
            {sortMenuOpen && (
              <div className="v4-projects-sort-menu" role="menu">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={state.sort === k}
                    className={state.sort === k ? "is-active" : ""}
                    onClick={() => {
                      setState((s) => ({ ...s, sort: k }));
                      setSortMenuOpen(false);
                    }}
                  >
                    {SORT_LABELS[k]}
                  </button>
                ))}
                <div className="v4-projects-sort-sep" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={state.asc}
                  className={state.asc ? "is-active" : ""}
                  onClick={() => setState((s) => ({ ...s, asc: !s.asc }))}
                >
                  {state.asc ? "↑ По возрастанию" : "↓ По убыванию"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {deleteError && (
        <div className="v4-error" style={{ margin: "8px 18px 0" }}>
          {deleteError}
          <button
            type="button"
            className="v4-linkbtn"
            style={{ marginLeft: 12 }}
            onClick={() => setDeleteError(null)}
          >
            закрыть
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="v4-empty">
          {state.query
            ? `По запросу «${state.query}» ничего не найдено`
            : "Нет транскрипций под фильтр"}
        </div>
      ) : (
        <div className="v4-tpc-history-rows">
          {sorted.map((item) => {
            const isActive = ACTIVE_STATUSES.has(item.status);
            const dateStr = new Date(item.created_at).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={item.task_id}
                className={`v4-tpc-history-row ${isActive ? "is-active" : ""}`}
              >
                <div className="v4-tpc-history-cell v4-tpc-history-date v4-pl-mono">{dateStr}</div>
                <div className="v4-tpc-history-cell v4-tpc-history-project">
                  <span className="v4-pl-mono">{item.project}</span>
                </div>
                <div className="v4-tpc-history-cell v4-tpc-history-file" title={item.filename}>
                  {item.filename}
                </div>
                <div className="v4-tpc-history-cell v4-tpc-history-model">
                  {item.transcription_model === "quality" ? (
                    <span title="Качественная (диаризация)">🎯 quality</span>
                  ) : item.transcription_model === "fast" ? (
                    <span title="Быстрая">⚡ fast</span>
                  ) : (
                    <span className="v4-tpc-text-muted">—</span>
                  )}
                </div>
                <div className="v4-tpc-history-cell v4-tpc-history-status">
                  <span className={`v4-tpc-status ${STATUS_CLASS[item.status] ?? ""}`}>
                    {isActive && <span className="v4-tpc-status-pulse" />}
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </div>
                <div className="v4-tpc-history-cell v4-tpc-history-quality">
                  <span className="v4-tpc-text-muted">—</span>
                </div>
                <div className="v4-tpc-history-cell v4-tpc-history-actions">
                  {item.status === "done" && (
                    <button
                      type="button"
                      className="v4-btn v4-btn--pri"
                      onClick={() => onOpen(item.task_id)}
                    >
                      Открыть
                    </button>
                  )}
                  {isActive && (
                    <button
                      type="button"
                      className="v4-btn"
                      onClick={() => onResume(item.task_id)}
                    >
                      Следить
                    </button>
                  )}
                  {item.status === "error" && (
                    <button
                      type="button"
                      className="v4-btn"
                      onClick={() => handleRetry(item.task_id, item.transcription_model, item.project)}
                      disabled={retryingIds.has(item.task_id)}
                      title="Повторить с момента сбоя"
                    >
                      {retryingIds.has(item.task_id) ? "Запуск…" : "↻ Повторить"}
                    </button>
                  )}
                  {(item.status === "done" || item.status === "error") && (
                    <button
                      type="button"
                      className="v4-btn v4-tpc-btn-icon"
                      onClick={() => handleDelete(item.task_id, item.filename)}
                      title="Удалить транскрипцию"
                      aria-label={`Удалить ${item.filename}`}
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
