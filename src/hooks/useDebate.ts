import { useState, useEffect, useCallback } from "react";
import { listDebates } from "../utils/debate";
import type { DebateListItem } from "../types/debate";

export function useDebate() {
  const [debates, setDebates] = useState<DebateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listDebates();
      setDebates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки дебатов");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { debates, loading, error, refresh: load };
}
