import { useState, useCallback, useEffect, useRef } from "react";
import {
  fetchQualitySnapshot,
  fetchQualityTrends,
  fetchQualityFindings,
  fetchQualityErrors,
  fetchPendingChanges,
  fetchTuningHistory,
  fetchRetroList,
  fetchRetroDetail,
  applyChange,
  rejectChange,
  rollbackChange,
  runRetro,
} from "../utils/quality";
import { isPipelineRunning } from "../utils/pipeline";
import type {
  QualitySnapshot,
  QualityTrends,
  QualityFindingsDistribution,
  QualityErrorsDistribution,
  PendingChange,
  RetroSummary,
  RetroDetail,
} from "../types";

export function useQuality() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // KPI data
  const [snapshot, setSnapshot] = useState<QualitySnapshot | null>(null);
  const [trends, setTrends] = useState<QualityTrends | null>(null);
  const [findings, setFindings] = useState<QualityFindingsDistribution | null>(null);
  const [errors, setErrors] = useState<QualityErrorsDistribution | null>(null);

  // AutoTuner
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [tuningHistory, setTuningHistory] = useState<PendingChange[]>([]);

  // Retros
  const [retros, setRetros] = useState<RetroSummary[]>([]);
  const [selectedRetro, setSelectedRetro] = useState<RetroDetail | null>(null);
  const [retroRunning, setRetroRunning] = useState(false);

  // Action in-progress flags
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Cleanup ref for retro setTimeout
  const retroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAvailability = useCallback(async () => {
    const ok = await isPipelineRunning();
    setAvailable(ok);
    return ok;
  }, []);

  const loadAll = useCallback(async (project?: string) => {
    try {
      setLoading(true);
      setError(null);

      const ok = await checkAvailability();
      if (!ok) {
        setLoading(false);
        return;
      }

      const [snap, trendData, findingsData, errorsData, pending, history, retroList] =
        await Promise.all([
          fetchQualitySnapshot(project).catch(() => null),
          fetchQualityTrends(12, project).catch(() => null),
          fetchQualityFindings(4, project).catch(() => null),
          fetchQualityErrors(4, project).catch(() => null),
          fetchPendingChanges().catch(() => [] as PendingChange[]),
          fetchTuningHistory().catch(() => [] as PendingChange[]),
          fetchRetroList().catch(() => [] as RetroSummary[]),
        ]);

      setSnapshot(snap);
      setTrends(trendData);
      setFindings(findingsData);
      setErrors(errorsData);
      setPendingChanges(pending);
      setTuningHistory(history);
      setRetros(retroList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quality data");
    } finally {
      setLoading(false);
    }
  }, [checkAvailability]);

  useEffect(() => {
    loadAll();
    return () => {
      if (retroTimerRef.current !== null) {
        clearTimeout(retroTimerRef.current);
      }
    };
  }, [loadAll]);

  // ── Shared tuning action helper ────────────────────────────────────

  const tuningAction = useCallback(async (
    changeId: string,
    action: (id: string) => Promise<unknown>,
    errorMsg: string,
  ) => {
    setActionLoading(changeId);
    setError(null);
    try {
      await action(changeId);
      const [pending, history] = await Promise.all([
        fetchPendingChanges().catch(() => [] as PendingChange[]),
        fetchTuningHistory().catch(() => [] as PendingChange[]),
      ]);
      setPendingChanges(pending);
      setTuningHistory(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMsg);
      throw err;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────

  const approve = useCallback(
    (changeId: string) => tuningAction(changeId, applyChange, "Failed to apply change"),
    [tuningAction],
  );

  const reject = useCallback(
    (changeId: string) => tuningAction(changeId, rejectChange, "Failed to reject change"),
    [tuningAction],
  );

  const rollback = useCallback(
    (changeId: string) => tuningAction(changeId, rollbackChange, "Failed to rollback change"),
    [tuningAction],
  );

  const startRetro = useCallback(async (period?: string) => {
    setRetroRunning(true);
    setError(null);
    try {
      await runRetro(period);
      // Refresh retro list after a short delay (retro runs in background)
      retroTimerRef.current = setTimeout(async () => {
        retroTimerRef.current = null;
        const retroList = await fetchRetroList().catch(() => [] as RetroSummary[]);
        setRetros(retroList);
        setRetroRunning(false);
      }, 2000);
    } catch (err) {
      setRetroRunning(false);
      setError(err instanceof Error ? err.message : "Failed to start retro");
      throw err;
    }
  }, []);

  const loadRetroDetail = useCallback(async (period: string) => {
    setError(null);
    try {
      const detail = await fetchRetroDetail(period);
      setSelectedRetro(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load retro detail");
      throw err;
    }
  }, []);

  const clearRetroDetail = useCallback(() => {
    setSelectedRetro(null);
  }, []);

  return {
    // State
    available,
    loading,
    error,
    snapshot,
    trends,
    findings,
    errors,
    pendingChanges,
    tuningHistory,
    retros,
    selectedRetro,
    retroRunning,
    actionLoading,

    // Actions
    refresh: loadAll,
    approve,
    reject,
    rollback,
    startRetro,
    loadRetroDetail,
    clearRetroDetail,
  };
}
