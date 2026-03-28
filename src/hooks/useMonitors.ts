import { useState, useCallback } from "react";
import type { Monitor } from "../types";
import { fetchMonitors } from "../utils/betterstack";
import { getBetterStackToken } from "../utils/config";

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

  const refresh = useCallback(async () => {
    const token = getBetterStackToken();
    if (!token) {
      setError("Better Stack token not set");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMonitors(token);
      setMonitors(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { monitors, loading, error, refresh };
}
