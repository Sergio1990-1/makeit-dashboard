import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBootstrapToken,
  loadAllSettings,
  SettingsAuthError,
  SettingsUnavailableError,
} from "../utils/settings";

export type SettingsError = "auth" | "unavailable" | null;

export interface UseSettingsResult {
  /** True once `loadAllSettings()` has succeeded for this page session. */
  ready: boolean;
  /**
   * - `auth`        — bootstrap token missing or rejected (401/403).
   * - `unavailable` — pipeline 5xx / network failure (transient).
   * - `null`        — no error (either still loading or ready).
   */
  error: SettingsError;
  /** Re-attempt `loadAllSettings()` (e.g. after the user fixes the token). */
  retry: () => void;
}

/**
 * App-level bootstrap state machine for the Pipeline settings store.
 *
 * Flow:
 *  1. Mount — if no bootstrap token, immediately surface `error: 'auth'`
 *     so App.tsx can render the bootstrap form (no wasted HTTP call).
 *  2. With a token — call `loadAllSettings()`; on success → `ready: true`.
 *  3. SettingsAuthError → token already cleared by the client; surface
 *     `error: 'auth'`.
 *  4. SettingsUnavailableError → keep token; surface `error: 'unavailable'`
 *     so the user sees a retry-able diagnostic screen.
 *
 * `retry()` is the single entry point for the bootstrap form's onSuccess
 * callback AND for the "Повторить" button on the unavailable screen.
 */
export function useSettings(): UseSettingsResult {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<SettingsError>(null);
  // Bumped by retry() to re-trigger the load effect.
  const [tick, setTick] = useState(0);
  // Guards against late completions setting state on an unmounted component.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let active = true;

    const run = async () => {
      // Reset per-attempt UI state so a stale "unavailable" doesn't flash
      // before the loader resolves.
      setReady(false);
      setError(null);

      if (!getBootstrapToken()) {
        if (!active) return;
        setError("auth");
        return;
      }

      try {
        await loadAllSettings();
        if (!active) return;
        setReady(true);
      } catch (e) {
        if (!active) return;
        if (e instanceof SettingsAuthError) {
          setError("auth");
        } else if (e instanceof SettingsUnavailableError) {
          setError("unavailable");
        } else {
          // Unknown error — treat as transient so the user can retry without
          // losing the bootstrap token.
          if (import.meta.env.DEV) console.error("[useSettings] unknown error:", e);
          setError("unavailable");
        }
      }
    };

    void run();
    return () => {
      active = false;
      cancelledRef.current = true;
    };
  }, [tick]);

  const retry = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { ready, error, retry };
}
