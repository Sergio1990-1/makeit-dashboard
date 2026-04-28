import { useState, useCallback, useEffect, useRef } from "react";
import type { Monitor } from "../types";
import { fetchMonitors } from "../utils/betterstack";
import { getWorkerUrl } from "../utils/config";

const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface UseMonitorsResult {
  monitors: Monitor[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMonitors(): UseMonitorsResult {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const url = getWorkerUrl();
    if (!url) {
      setError("Worker URL not set");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMonitors(url);
      setMonitors(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getWorkerUrl()) return;
    void refresh(); // immediate load — don't wait for first interval tick
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { monitors, loading, error, refresh };
}
