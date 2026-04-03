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

const POLL_INTERVAL_MS = 2000;

export function usePipeline() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [statsProject, setStatsProject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notRunningCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    notRunningCountRef.current = 0;
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchPipelineStatus();
      setStatus(s);
      setError(null);
      if (!s.running) {
        notRunningCountRef.current += 1;
        if (notRunningCountRef.current >= 3) {
          console.log("[pipeline] stopped polling (3x not running)");
          stopPolling();
        }
      } else {
        notRunningCountRef.current = 0;
      }
    } catch (err) {
      console.error("[pipeline] poll error:", err);
      setError(err instanceof Error ? err.message : "Ошибка статуса");
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => void loadStatus(), POLL_INTERVAL_MS);
  }, [stopPolling, loadStatus]);

  const checkAvailability = useCallback(async () => {
    const ok = await isPipelineRunning();
    setAvailable(ok);
    if (ok) {
      try {
        const s = await fetchPipelineStatus();
        setStatus(s);
        setError(null);
        // Resume polling if pipeline was already running when the tab was opened
        if (s.running && pollRef.current === null) {
          startPolling();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка статуса");
      }
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
        // Give background task time to set running=true before first poll
        await new Promise((r) => setTimeout(r, 1500));
        await loadStatus();
        startPolling();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска");
      } finally {
        setStarting(false);
      }
    },
    [loadStatus, startPolling],
  );

  const stop = useCallback(async () => {
    setError(null);
    setStopping(true);
    try {
      await stopPipeline();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка остановки");
    } finally {
      setStopping(false);
    }
  }, [loadStatus]);

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
