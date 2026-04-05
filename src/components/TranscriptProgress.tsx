import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTranscriptStatus, type TranscriptStage, type TranscriptStatus } from "../utils/transcript";

const POLL_INTERVAL = 3000;
const MAX_POLL_FAILURES = 5;

const STAGES: { key: TranscriptStage; label: string }[] = [
  { key: "upload", label: "Загрузка" },
  { key: "transcription", label: "Транскрипция" },
  { key: "processing", label: "Обработка" },
  { key: "done", label: "Готово" },
];

function stageIndex(stage: TranscriptStage): number {
  return STAGES.findIndex((s) => s.key === stage);
}

interface Props {
  taskId: string;
  onDone: (resultUrl: string | null) => void;
  onRetry: () => void;
}

export function TranscriptProgress({ taskId, onDone, onRetry }: Props) {
  const [status, setStatus] = useState<TranscriptStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const failCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const s = await fetchTranscriptStatus(taskId);
      setStatus(s);
      setPollError(null);
      failCountRef.current = 0;

      if (s.stage === "done" || s.error) {
        stopPolling();
        if (s.stage === "done") onDone(s.result_url);
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
    const initial = setTimeout(poll, 0);
    timerRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      clearTimeout(initial);
      stopPolling();
    };
  }, [poll, stopPolling]);

  const currentIdx = status ? stageIndex(status.stage) : 0;
  const hasError = !!status?.error;
  const pct = status ? Math.min(100, Math.max(0, status.progress)) : 0;

  return (
    <div className="tpc-progress">
      <div className="tpc-progress-title">
        {hasError ? "Ошибка обработки" : status?.stage === "done" ? "Обработка завершена" : "Обработка..."}
      </div>

      {/* Stepper */}
      <div className="tpc-stepper">
        {STAGES.map((s, i) => {
          const isDone = i < currentIdx || (i === currentIdx && status?.stage === "done");
          const isActive = i === currentIdx && !hasError && status?.stage !== "done";
          const isFailed = i === currentIdx && hasError;

          return (
            <div key={s.key} className="tpc-step-wrapper">
              <div className={`tpc-step${isDone ? " tpc-step--done" : ""}${isActive ? " tpc-step--active" : ""}${isFailed ? " tpc-step--error" : ""}`}>
                <div className="tpc-step-dot">
                  {isDone ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isFailed ? (
                    "!"
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className="tpc-step-label">{s.label}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`tpc-step-line${isDone ? " tpc-step-line--done" : ""}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar for active stage */}
      {status && !hasError && status.stage !== "done" && (
        <div className="tpc-progress-bar-wrap">
          <div className="tpc-progress-bar">
            <div className="tpc-progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="tpc-progress-pct">{pct}%</span>
        </div>
      )}

      {/* Error message */}
      {hasError && (
        <div className="tpc-progress-error">
          <p>{status?.error}</p>
          <button className="btn btn-primary" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}

      {/* Poll error (network issue, not task error) */}
      {pollError && !hasError && (
        <div className="tpc-progress-error">
          <p>Соединение потеряно: {pollError}</p>
          {pollExhausted && (
            <button className="btn btn-primary" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
