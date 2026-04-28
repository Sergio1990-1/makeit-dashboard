import { useCallback, useEffect, useRef } from "react";

/**
 * Lightweight polling helper used by hooks that need to repeatedly call
 * an async fetcher and react to status changes.
 *
 * Why this exists: hooks like useAudit/useUXAudit historically wired
 * setInterval inside a useEffect whose deps depended on the polled
 * state. Each state change tore down the interval and started a new
 * one — and during that small gap, in-flight fetches from the old
 * interval would resolve and overwrite freshly-set state. Routing the
 * callback through a ref keeps the closure always current while the
 * interval itself lives in a stable ref.
 *
 * Contract: `intervalMs` is read once at start() time. Changes to it
 * after polling has begun are NOT honoured until stop() + start() is
 * invoked. All current callers pass a module-level constant.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
) {
  const cbRef = useRef(callback);
  // Keep the ref in sync with the latest callback after each render so
  // the interval always invokes the freshest closure.
  useEffect(() => {
    cbRef.current = callback;
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current !== null) return; // already running — see "Contract"
    intervalRef.current = setInterval(() => {
      void cbRef.current();
    }, intervalMs);
  }, [intervalMs]);

  // Stop on unmount
  useEffect(() => stop, [stop]);

  return { start, stop };
}
