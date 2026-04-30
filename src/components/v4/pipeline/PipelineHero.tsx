import { useEffect, useState } from "react";
import type { PipelineStatus } from "../../../utils/pipeline";
import { activeTaskCount, compactUSD, formatDuration } from "./utils";

interface Props {
  available: boolean | null;
  status: PipelineStatus | null;
  starting: boolean;
  stopping: boolean;
  /** Wall-clock millis when the current run started (set by parent on start). */
  runStartedAt: number | null;
  /** Aggregate cost of the current run (sum of result.cost_usd since runStartedAt). */
  currentRunCost: number;
  /** Last completed result count (used to label "since last run"). */
  lastRunSummary?: { done: number; failed: number; finishedAt: number | null };
  onStart: () => void;
  onStop: () => void;
  onConfigToggle: () => void;
  configOpen: boolean;
  startDisabled?: boolean;
  selectedProjectLabel?: string;
}

function relativeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}с назад`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  const d = Math.floor(h / 24);
  return `${d}д назад`;
}

/** 1Hz tick used to keep the live elapsed timer fresh. */
function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function PipelineHero({
  available,
  status,
  starting,
  stopping,
  runStartedAt,
  currentRunCost,
  lastRunSummary,
  onStart,
  onStop,
  onConfigToggle,
  configOpen,
  startDisabled,
  selectedProjectLabel,
}: Props) {
  const isRunning = status?.running ?? false;
  const isStopping = status?.stopping ?? false;
  const now = useNowTick(isRunning);
  const elapsedSec = isRunning && runStartedAt ? Math.floor((now - runStartedAt) / 1000) : 0;
  const active = activeTaskCount(status);

  // Loading
  if (available === null) {
    return (
      <div className="v4-pl-hero v4-pl-hero--loading">
        <div className="v4-pl-hero-status">
          <span className="v4-pl-hero-dot v4-pl-hero-dot--idle" />
          <div>
            <div className="v4-pl-hero-title">Подключение к Pipeline…</div>
            <div className="v4-pl-hero-sub">Проверка доступности API</div>
          </div>
        </div>
      </div>
    );
  }

  // Offline
  if (available === false) {
    return (
      <div className="v4-pl-hero v4-pl-hero--offline">
        <div className="v4-pl-hero-status">
          <span className="v4-pl-hero-dot v4-pl-hero-dot--offline" />
          <div>
            <div className="v4-pl-hero-title">Pipeline недоступен</div>
            <div className="v4-pl-hero-sub">
              API сервер не отвечает. Убедитесь, что Mac включён и API запущен.
            </div>
          </div>
        </div>
        <pre className="v4-pl-hero-cmd">
{`# На Mac:
cd ~/Desktop/makeit-pipeline
source .venv/bin/activate
uvicorn makeit_pipeline.api:create_app --factory --port 8766`}
        </pre>
      </div>
    );
  }

  // Running
  if (isRunning) {
    return (
      <div className="v4-pl-hero v4-pl-hero--running">
        <div className="v4-pl-hero-status">
          <span className="v4-pl-hero-dot v4-pl-hero-dot--running" />
          <div>
            <div className="v4-pl-hero-title">
              Pipeline running
              {selectedProjectLabel && (
                <span className="v4-pl-hero-sub-inline"> · {selectedProjectLabel}</span>
              )}
            </div>
            <div className="v4-pl-hero-sub">
              <b className="v4-pl-hero-num">{active}</b> активных задач
              <span className="v4-pl-sep">·</span>
              <span className="v4-pl-mono">
                {elapsedSec > 0 ? formatDuration(elapsedSec) : "—"}
              </span>{" "}
              elapsed
              {currentRunCost > 0 && (
                <>
                  <span className="v4-pl-sep">·</span>
                  <span className="v4-pl-mono v4-pl-cost">
                    {compactUSD(currentRunCost)}
                  </span>{" "}
                  потрачено
                </>
              )}
            </div>
          </div>
        </div>
        <div className="v4-pl-hero-actions">
          <button type="button" className="v4-btn" onClick={onConfigToggle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Параметры {configOpen ? "▴" : "▾"}
          </button>
          <button
            type="button"
            className="v4-btn v4-pl-btn-stop"
            onClick={onStop}
            disabled={stopping || isStopping}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            {stopping || isStopping ? "Останавливаем…" : "Остановить"}
          </button>
        </div>
      </div>
    );
  }

  // Idle
  const lastResult = status?.results.at(-1);
  const lastFinishedAt = lastRunSummary?.finishedAt ?? null;
  return (
    <div className="v4-pl-hero v4-pl-hero--idle">
      <div className="v4-pl-hero-status">
        <span className="v4-pl-hero-dot v4-pl-hero-dot--idle" />
        <div>
          <div className="v4-pl-hero-title">Pipeline свободен</div>
          <div className="v4-pl-hero-sub">
            {lastResult ? (
              <>
                Последний запуск {relativeAgo(lastFinishedAt)}
                <span className="v4-pl-sep">·</span>
                {lastRunSummary && (
                  <>
                    <b className="v4-pl-hero-num v4-pl-text-success">{lastRunSummary.done}</b> готово
                    {lastRunSummary.failed > 0 && (
                      <>
                        <span className="v4-pl-sep">·</span>
                        <b className="v4-pl-hero-num v4-pl-text-danger">{lastRunSummary.failed}</b> требует внимания
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <>Нет недавних запусков</>
            )}
          </div>
        </div>
      </div>
      <div className="v4-pl-hero-actions">
        <button type="button" className="v4-btn" onClick={onConfigToggle}>
          Параметры {configOpen ? "▴" : "▾"}
        </button>
        <button
          type="button"
          className="v4-btn v4-btn--pri v4-pl-btn-start"
          onClick={onStart}
          disabled={starting || startDisabled}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {starting ? "Запуск…" : "Запустить"}
        </button>
      </div>
    </div>
  );
}
