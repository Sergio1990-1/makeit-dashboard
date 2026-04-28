import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTranscriptStatus, type TranscriptStage, type TranscriptStatus } from "../utils/transcript";

const POLL_INTERVAL = 2000;
const MAX_POLL_FAILURES = 5;
// Hard ceiling on how long we keep showing the progress UI for a single
// task. The backend can hang silently (no error, no progress); without
// this ceiling the user is locked in a spinner forever. 30 minutes is
// well above any expected job duration.
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;

const STAGES: { key: TranscriptStage; label: string }[] = [
  { key: "intake", label: "Приём" },
  { key: "stt", label: "Транскрипция" },
  { key: "enrichment", label: "Обогащение" },
  { key: "structuring", label: "Структурирование" },
  { key: "synthesis", label: "Синтез" },
  { key: "done", label: "Готово" },
];

function stageIndex(stage: TranscriptStage): number {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx : 0;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} сек`;
  return `${m} мин ${s} сек`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} сек`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  taskId: string;
  onDone: (resultUrl: string | null, taskId: string) => void;
  onRetry: () => void;
}

export function TranscriptProgress({ taskId, onDone, onRetry }: Props) {
  const [status, setStatus] = useState<TranscriptStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval>>(null);
  const startedAtRef = useRef<number | null>(null);
  const failCountRef = useRef(0);
  const pollStartedAtRef = useRef<number | null>(null);
  // Reset stuck flag when taskId changes (React idiomatic
  // "during-render reset" — https://react.dev/reference/react/useState).
  // The eslint disables suppress react-hooks/refs (false positive: this
  // pattern is explicitly recommended in the React docs for resetting
  // state when an identity-bearing prop changes).
  const lastTaskIdRef = useRef(taskId);
  // eslint-disable-next-line react-hooks/refs
  if (lastTaskIdRef.current !== taskId) {
    // eslint-disable-next-line react-hooks/refs
    lastTaskIdRef.current = taskId;
    setStuck(false);
  }

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    // Bail out if we've been polling longer than the hard ceiling — the
    // task is most likely stuck on the backend.
    const polledMs = pollStartedAtRef.current
      ? Date.now() - pollStartedAtRef.current
      : 0;
    if (polledMs > MAX_POLL_DURATION_MS) {
      stopPolling();
      setStuck(true);
      return;
    }

    try {
      const s = await fetchTranscriptStatus(taskId);
      setStatus(s);
      setPollError(null);
      failCountRef.current = 0;

      // Capture started_at from API for persistent elapsed timer
      if (s.started_at && startedAtRef.current === null) {
        startedAtRef.current = new Date(s.started_at).getTime();
      }

      if (s.stage === "done" || s.error) {
        stopPolling();
        if (s.stage === "done") onDone(s.result_url, taskId);
      }
    } catch (err) {
      failCountRef.current += 1;
      setPollError(String(err));
      if (failCountRef.current >= MAX_POLL_FAILURES) {
        stopPolling();
        setPollExhausted(true);
      }
    }
  }, [taskId, onDone, stopPolling]);

  useEffect(() => {
    failCountRef.current = 0;
    startedAtRef.current = null;
    pollStartedAtRef.current = Date.now();
    const initial = setTimeout(poll, 0);
    timerRef.current = setInterval(poll, POLL_INTERVAL);
    elapsedRef.current = setInterval(() => {
      const t0 = startedAtRef.current;
      if (t0 !== null) {
        setElapsed(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
      }
    }, 1000);
    return () => {
      clearTimeout(initial);
      stopPolling();
    };
  }, [poll, stopPolling]);

  const currentIdx = status ? stageIndex(status.stage) : 0;
  const hasError = !!status?.error;
  const pct = status ? Math.min(100, Math.max(0, status.progress)) : 0;
  const isDone = status?.stage === "done";

  return (
    <div className="tpc-progress">
      {/* Header with file name and elapsed time */}
      <div className="tpc-progress-header">
        <div className="tpc-progress-title">
          {hasError
            ? "Ошибка обработки"
            : isDone
              ? "Обработка завершена"
              : status?.file_name
                ? `Обработка: ${status.file_name}`
                : "Обработка..."}
        </div>
        {!isDone && !hasError && (
          <div className="tpc-progress-elapsed">
            {formatElapsed(elapsed)}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!hasError && (
        <div className="tpc-progress-bar-wrap">
          <div className="tpc-progress-bar">
            <div
              className={`tpc-progress-bar-fill${isDone ? " tpc-progress-bar-fill--done" : ""}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tpc-progress-pct">{pct}%</span>
        </div>
      )}

      {/* Stepper timeline */}
      <div className="tpc-stepper">
        {STAGES.map((s, i) => {
          // Use stages_completed for precise state when available (new pipeline),
          // otherwise fall back to index-based comparison (legacy)
          const hasCompletedData = status && status.stages_completed.length > 0;
          const stepDone = hasCompletedData
            ? status.stages_completed.includes(s.key) || (s.key === "done" && isDone)
            : i < currentIdx || (i === currentIdx && isDone);
          const isActive = i === currentIdx && !hasError && !isDone;
          const isFailed = i === currentIdx && hasError;

          return (
            <div key={s.key} className="tpc-step-wrapper">
              <div className={`tpc-step${stepDone ? " tpc-step--done" : ""}${isActive ? " tpc-step--active" : ""}${isFailed ? " tpc-step--error" : ""}`}>
                <div className="tpc-step-dot">
                  {stepDone ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isFailed ? (
                    "!"
                  ) : (
                    <span>{s.key === "done" ? "\u2713" : i + 1}</span>
                  )}
                </div>
                <span className="tpc-step-label">{s.label}</span>
                {isActive && status?.stage_detail && (
                  <span className="tpc-step-detail">{status.stage_detail}</span>
                )}
              </div>
              {i < STAGES.length - 1 && (
                <div className={`tpc-step-line${stepDone ? " tpc-step-line--done" : ""}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Intermediate stats (shown after transcription completes) */}
      {status && (status.duration_seconds > 0 || status.speaker_count > 0) && (
        <div className="tpc-progress-stats">
          {status.duration_seconds > 0 && (
            <div className="tpc-progress-stat">
              <span className="tpc-progress-stat-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <span className="tpc-progress-stat-label">Длительность:</span>
              <span className="tpc-progress-stat-value">{formatDuration(status.duration_seconds)}</span>
            </div>
          )}
          {status.speaker_count > 0 && (
            <div className="tpc-progress-stat">
              <span className="tpc-progress-stat-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className="tpc-progress-stat-label">Спикеров:</span>
              <span className="tpc-progress-stat-value">{status.speaker_count}</span>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {hasError && status && (
        <div className="tpc-progress-error">
          <p>{status.error}</p>
          <p className="tpc-progress-error-context">
            Этап: {STAGES[currentIdx]?.label ?? status.stage_detail ?? status.stage}
            {status.stage_detail && status.stage_detail !== STAGES[currentIdx]?.label && (
              <> &mdash; {status.stage_detail}</>
            )}
          </p>
          <button className="btn btn-primary" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}

      {/* Poll error (network issue, not task error) */}
      {pollError && !hasError && (
        <div className="tpc-progress-error tpc-progress-error--network">
          <p>Соединение потеряно: {pollError}</p>
          {pollExhausted && (
            <button className="btn btn-primary" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}

      {/* Stuck task — backend never reported done/error within budget */}
      {stuck && !hasError && (
        <div className="tpc-progress-error tpc-progress-error--network">
          <p>Задача висит дольше 30 минут. Возможно, она зависла на бэкенде.</p>
          <button className="btn btn-primary" onClick={onRetry}>
            Считать зависшей и закрыть
          </button>
        </div>
      )}
    </div>
  );
}
