import { useEffect, useState, useCallback, useMemo } from "react";
import type { QualityPayload, Annotation } from "../types/quality";
import { fetchQualityData, fetchAnnotations, forceQualityRefresh } from "../utils/codex-quality";

const STALE_HOURS = 30;

export function useCodexQuality() {
  const [data, setData] = useState<QualityPayload | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [q, a] = await Promise.all([
        force ? forceQualityRefresh() : fetchQualityData(),
        fetchAnnotations(),
      ]);
      setData(q);
      setAnnotations(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadAnnotations = useCallback(async () => {
    try {
      setAnnotations(await fetchAnnotations());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const isStale = useMemo(() => {
    if (!data) return false;
    const ageHours = (Date.now() - new Date(data.generated_at).getTime()) / 3.6e6;
    return ageHours > STALE_HOURS;
  }, [data]);

  return {
    data,
    annotations,
    loading,
    error,
    isStale,
    refresh: () => load(true),
    reloadAnnotations,
  };
}
