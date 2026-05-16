import { useMemo, useSyncExternalStore } from "react";
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

interface PipelineState {
  available: boolean | null;
  status: PipelineStatus | null;
  stats: PipelineStats | null;
  statsProject: string | null;
  error: string | null;
  starting: boolean;
  stopping: boolean;
}

/**
 * One process-wide pipeline engine shared by every `usePipeline()` consumer.
 *
 * The pipeline API is a single global resource (the feed is not repo-scoped),
 * so N mounted consumers must not each run their own ~2s poll loop. The engine
 * owns exactly one poll loop plus the epoch/timer/backoff bookkeeping; consumers
 * subscribe via `useSyncExternalStore` and read a shared snapshot. Polling is
 * reference-counted: it starts when the first consumer mounts and stops when
 * the last unmounts, so an idle app (no pipeline UI on screen) does no polling —
 * same gating as before, just deduplicated across instances.
 */
const listeners = new Set<() => void>();

let state: PipelineState = {
  available: null,
  status: null,
  stats: null,
  statsProject: null,
  error: null,
  starting: false,
  stopping: false,
};

// `useSyncExternalStore` requires getSnapshot to return a referentially stable
// value between mutations. We replace `state` wholesale on every change and
// hand back the same object until the next change.
function getSnapshot(): PipelineState {
  return state;
}

function setState(patch: Partial<PipelineState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      // A bad listener must never poison the notify loop.
      console.warn("[pipeline] listener threw:", e);
    }
  }
}

let refCount = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let notRunningStreak = 0;
let stopped = false;
// Epoch invalidates in-flight polls. Bumped on stop/start so a fetch that
// resolves after a restart can't schedule a stale timer the live loop owns.
let epoch = 0;

function stopPolling(): void {
  stopped = true;
  epoch += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  notRunningStreak = 0;
}

function scheduleNext(delay: number, fn: () => void): void {
  if (stopped) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(fn, delay);
}

async function pollOnce(): Promise<void> {
  const myEpoch = epoch;
  try {
    const s = await fetchPipelineStatus();
    if (epoch !== myEpoch) return;
    setState({ status: s, error: null });
    if (s.running) {
      notRunningStreak = 0;
    } else {
      notRunningStreak += 1;
    }
  } catch (err) {
    if (epoch !== myEpoch) return;
    console.error("[pipeline] poll error:", err);
    setState({ error: err instanceof Error ? err.message : "Ошибка статуса" });
    // On error, treat as idle for backoff but keep polling so we recover
    // automatically once the API comes back (e.g. after LaunchAgent reload).
    notRunningStreak += 1;
  }
  if (epoch !== myEpoch) return;
  scheduleNext(nextDelayMs(notRunningStreak), () => void pollOnce());
}

function startPolling(): void {
  // Bump epoch first so any in-flight pollOnce from a prior run won't
  // schedule a duplicate timer when it resolves.
  epoch += 1;
  stopped = false;
  notRunningStreak = 0;
  if (timer !== null) clearTimeout(timer);
  // Run first poll immediately, subsequent polls scheduled by pollOnce itself.
  void pollOnce();
}

async function checkAvailability(): Promise<boolean> {
  const ok = await isPipelineRunning();
  setState({ available: ok });
  // refCount can drop to 0 while this probe is in flight (consumer mounted
  // then unmounted). Only kick off the shared loop if a consumer is still
  // listening — otherwise an idle app would poll forever with nothing on
  // screen. A later mount re-probes (refCount 0→1) and starts it then.
  if (ok && refCount > 0) {
    // Backoff keeps idle load tiny, and we recover automatically after
    // pipeline restarts.
    startPolling();
  }
  return ok;
}

async function loadStats(project: string): Promise<void> {
  try {
    const s = await fetchPipelineStats(project);
    setState({ stats: s, statsProject: project });
  } catch {
    // Stats are non-critical — silently ignore
  }
}

async function start(req: PipelineStartRequest): Promise<boolean> {
  setState({ error: null, starting: true });
  try {
    await startPipeline(req);
    // Give background task time to set running=true before first poll.
    await new Promise((r) => setTimeout(r, 1500));
    // Reset backoff streak so we drop back to fast (2s) cadence immediately.
    notRunningStreak = 0;
    startPolling();
    return true;
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Ошибка запуска" });
    return false;
  } finally {
    setState({ starting: false });
  }
}

async function stop(): Promise<void> {
  setState({ error: null, stopping: true });
  try {
    await stopPipeline();
    await pollOnce();
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Ошибка остановки" });
  } finally {
    setState({ stopping: false });
  }
}

/**
 * Reference-counted subscription. The first consumer to mount probes
 * availability (which kicks off the shared poll loop); the last to unmount
 * tears the loop down so an idle app does no background polling.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  refCount += 1;
  if (refCount === 1) {
    stopped = false;
    void checkAvailability();
  }
  return () => {
    listeners.delete(listener);
    refCount -= 1;
    if (refCount === 0) {
      stopPolling();
    }
  };
}

export function usePipeline() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(
    () => ({
      available: s.available,
      status: s.status,
      stats: s.stats,
      statsProject: s.statsProject,
      error: s.error,
      starting: s.starting,
      stopping: s.stopping,
      start,
      stop,
      refresh: checkAvailability,
      loadStats,
    }),
    [s],
  );
}
