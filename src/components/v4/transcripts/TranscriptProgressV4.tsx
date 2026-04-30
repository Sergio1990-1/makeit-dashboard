import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTranscriptStatus, type TranscriptStage, type TranscriptStatus } from "../../../utils/transcript";

const POLL_INTERVAL = 2000;
const MAX_POLL_FAILURES = 5;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;

const STAGES: { key: TranscriptStage; label: string }[] = [
  { key: "intake", label: "Приём" },
  { key: "stt", label: "Транскрипция" },
  { key: "enrichment", label: "Обогащение" },
  { key: "structuring", label: "Структуризация" },
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

export function TranscriptProgressV4({ taskId, onDone, onRetry }: Props) {
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

  // React idiomatic state-reset on identity-bearing prop change
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
    <div className="v4-panel v4-tpc-progress-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          {hasError
            ? "Ошибка обработки"
            : isDone
            ? "Обработка завершена"
            : status?.file_name
            ? `Обработка: ${status.file_name}`
            : "Обработка…"}
        </div>
        {!isDone && !hasError && (
          <div className="v4-panel-meta v4-pl-mono">{formatElapsed(elapsed)}</div>
        )}
      </div>

      {/* Progress bar */}
      {!hasError && (
        <div className="v4-tpc-progress-bar-row">
          <div className="v4-ptrack" style={{ height: 8 }}>
            <div
              className="v4-pfill"
              style={{
                width: `${pct}%`,
                background: isDone ? "var(--v4-success-500)" : "var(--v4-accent-500)",
              }}
            />
          </div>
          <span className="v4-pl-mono v4-tpc-progress-pct">{pct}%</span>
        </div>
      )}

      {/* Phase stepper */}
      <div className="v4-tpc-stepper">
        {STAGES.map((s, i) => {
          const hasCompletedData = status && status.stages_completed.length > 0;
          const stepDone = hasCompletedData
            ? status.stages_completed.includes(s.key) || (s.key === "done" && isDone)
            : i < currentIdx || (i === currentIdx && isDone);
          const isActive = i === currentIdx && !hasError && !isDone;
          const isFailed = i === currentIdx && hasError;
          const dotCls = stepDone
            ? "v4-pl-dot--ok"
            : isFailed
            ? "v4-pl-dot--fail"
            : isActive
            ? "v4-pl-dot--running"
            : "v4-pl-dot--pending";
          return (
            <div key={s.key} className="v4-tpc-step">
              {i > 0 && (
                <span className={`v4-pl-phase-link ${stepDone ? "v4-pl-dot--ok" : "v4-pl-dot--pending"}`} />
              )}
              <span className={`v4-pl-dot ${dotCls}`} />
              <span className={`v4-tpc-step-label ${isActive ? "is-active" : ""} ${stepDone ? "is-done" : ""}`}>
                {s.label}
              </span>
              {isActive && status?.stage_detail && (
                <span className="v4-tpc-step-detail">{status.stage_detail}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Intermediate stats */}
      {status && (status.duration_seconds > 0 || status.speaker_count > 0) && (
        <div className="v4-tpc-progress-stats">
          {status.duration_seconds > 0 && (
            <div className="v4-tpc-progress-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="v4-tpc-text-muted">Длительность:</span>
              <b className="v4-pl-mono">{formatDuration(status.duration_seconds)}</b>
            </div>
          )}
          {status.speaker_count > 0 && (
            <div className="v4-tpc-progress-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <span className="v4-tpc-text-muted">Спикеров:</span>
              <b className="v4-pl-mono">{status.speaker_count}</b>
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {hasError && status && (
        <div className="v4-tpc-progress-error">
          <p>{status.error}</p>
          <p className="v4-tpc-text-muted">
            Этап: {STAGES[currentIdx]?.label ?? status.stage_detail ?? status.stage}
            {status.stage_detail && status.stage_detail !== STAGES[currentIdx]?.label && (
              <> — {status.stage_detail}</>
            )}
          </p>
          <button type="button" className="v4-btn v4-btn--pri" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
      {pollError && !hasError && (
        <div className="v4-tpc-progress-error v4-tpc-progress-error--soft">
          <p>Соединение потеряно: {pollError}</p>
          {pollExhausted && (
            <button type="button" className="v4-btn v4-btn--pri" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}
      {stuck && !hasError && (
        <div className="v4-tpc-progress-error v4-tpc-progress-error--soft">
          <p>Задача висит дольше 30 минут. Возможно, она зависла на бэкенде.</p>
          <button type="button" className="v4-btn v4-btn--pri" onClick={onRetry}>
            Считать зависшей и закрыть
          </button>
        </div>
      )}
    </div>
  );
}
