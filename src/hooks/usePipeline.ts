import { useState, useEffect, useCallback, useRef } from "react";
import {
  isPipelineRunning,
  fetchPipelineStatus,
  fetchPipelineStats,
  startPipeline,
  stopPipeline,
  type PipelineStartRequest,
  type PipelineStatus,
  type PipelineStats,
} from "../utils/pipeline";

/**
 * Polling cadence. Exponential backoff so we always recover from a pipeline-API
 * restart without F5, but never bomb the server in idle periods:
 *   running=true                 → 2s
 *   running=false (any time)     → 5s
 *   running=false × 5 in a row   → 15s
 *   running=false × 10 in a row  → 30s (cap)
 */
const POLL_RUNNING_MS = 2000;
const POLL_IDLE_MS = 5000;
const POLL_IDLE_SLOW_MS = 15000;
const POLL_IDLE_MIN_MS = 30000;

function nextDelayMs(notRunningStreak: number): number {
  if (notRunningStreak === 0) return POLL_RUNNING_MS;
  if (notRunningStreak < 5) return POLL_IDLE_MS;
  if (notRunningStreak < 10) return POLL_IDLE_SLOW_MS;
  return POLL_IDLE_MIN_MS;
}

export function usePipeline() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [statsProject, setStatsProject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notRunningStreakRef = useRef(0);
  const stoppedRef = useRef(false);
  // Epoch invalidates in-flight polls. Bumped on stop/start/unmount so a
  // fetch that resolves after a remount or restart can't schedule a stale
  // timer the new instance also owns.
  const epochRef = useRef(0);

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    epochRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    notRunningStreakRef.current = 0;
  }, []);

  const scheduleNext = useCallback((delay: number, fn: () => void) => {
    if (stoppedRef.current) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, delay);
  }, []);

  const pollOnce = useCallback(async () => {
    const myEpoch = epochRef.current;
    try {
      const s = await fetchPipelineStatus();
      if (epochRef.current !== myEpoch) return;
      setStatus(s);
      setError(null);
      if (s.running) {
        notRunningStreakRef.current = 0;
      } else {
        notRunningStreakRef.current += 1;
      }
    } catch (err) {
      if (epochRef.current !== myEpoch) return;
      console.error("[pipeline] poll error:", err);
      setError(err instanceof Error ? err.message : "Ошибка статуса");
      // On error, treat as idle for backoff but keep polling so we recover
      // automatically once the API comes back (e.g. after LaunchAgent reload).
      notRunningStreakRef.current += 1;
    }
    if (epochRef.current !== myEpoch) return;
    scheduleNext(nextDelayMs(notRunningStreakRef.current), () => void pollOnce());
  }, [scheduleNext]);

  const startPolling = useCallback(() => {
    // Bump epoch first so any in-flight pollOnce from a prior run won't
    // schedule a duplicate timer when it resolves.
    epochRef.current += 1;
    stoppedRef.current = false;
    notRunningStreakRef.current = 0;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    // Run first poll immediately, subsequent polls scheduled by pollOnce itself.
    void pollOnce();
  }, [pollOnce]);

  const checkAvailability = useCallback(async () => {
    const ok = await isPipelineRunning();
    setAvailable(ok);
    if (ok) {
      // Always start polling once the API is reachable — backoff keeps idle
      // load tiny, and we recover automatically after pipeline restarts.
      startPolling();
    }
    return ok;
  }, [startPolling]);

  useEffect(() => {
    void checkAvailability();
    return stopPolling;
  }, [checkAvailability, stopPolling]);

  const loadStats = useCallback(async (project: string) => {
    try {
      const s = await fetchPipelineStats(project);
      setStats(s);
      setStatsProject(project);
    } catch {
      // Stats are non-critical — silently ignore
    }
  }, []);

  const start = useCallback(
    async (req: PipelineStartRequest) => {
      setError(null);
      setStarting(true);
      try {
        await startPipeline(req);
        // Give background task time to set running=true before first poll.
        await new Promise((r) => setTimeout(r, 1500));
        // Reset backoff streak so we drop back to fast (2s) cadence immediately.
        notRunningStreakRef.current = 0;
        startPolling();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска");
      } finally {
        setStarting(false);
      }
    },
    [startPolling],
  );

  const stop = useCallback(async () => {
    setError(null);
    setStopping(true);
    try {
      await stopPipeline();
      await pollOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка остановки");
    } finally {
      setStopping(false);
    }
  }, [pollOnce]);

  return {
    available,
    status,
    stats,
    statsProject,
    error,
    starting,
    stopping,
    start,
    stop,
    refresh: checkAvailability,
    loadStats,
  };
}
