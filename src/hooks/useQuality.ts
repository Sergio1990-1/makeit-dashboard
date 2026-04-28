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
  fetchQualityConfig,
  updateQualityConfig,
  fetchLessons,
  previewPendingChange,
  bulkRejectChanges,
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
  QualityConfig,
  QualityConfigUpdate,
  LessonsFileResponse,
  ApplyPreview,
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

  // Phase F2: config panel + lessons viewer + filters + preview
  const [qualityConfig, setQualityConfig] = useState<QualityConfig | null>(null);
  const [lessonsByProject, setLessonsByProject] = useState<
    Record<string, LessonsFileResponse>
  >({});
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<number | null>(null);

  // Cleanup ref for retro setTimeout
  const retroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const checkAvailability = useCallback(async () => {
    const ok = await isPipelineRunning();
    if (mountedRef.current) setAvailable(ok);
    return ok;
  }, []);

  const loadAll = useCallback(
    async () => {
      try {
        setLoading(true);
        setError(null);

        const ok = await checkAvailability();
        if (!ok) {
          setLoading(false);
          return;
        }

        const effectiveProject = projectFilter ?? undefined;
        const effectiveTier = tierFilter ?? undefined;

        const [
          snap,
          trendData,
          findingsData,
          errorsData,
          pending,
          history,
          retroList,
          cfg,
        ] = await Promise.all([
          fetchQualitySnapshot(effectiveProject).catch(() => null),
          fetchQualityTrends(12, effectiveProject).catch(() => null),
          fetchQualityFindings(4, effectiveProject).catch(() => null),
          fetchQualityErrors(4, effectiveProject).catch(() => null),
          fetchPendingChanges({ project: effectiveProject, tier: effectiveTier }).catch(
            () => [] as PendingChange[],
          ),
          fetchTuningHistory(50, { project: effectiveProject, tier: effectiveTier }).catch(
            () => [] as PendingChange[],
          ),
          fetchRetroList().catch(() => [] as RetroSummary[]),
          fetchQualityConfig().catch(() => null),
        ]);

        setSnapshot(snap);
        setTrends(trendData);
        setFindings(findingsData);
        setErrors(errorsData);
        setPendingChanges(pending);
        setTuningHistory(history);
        setRetros(retroList);
        setQualityConfig(cfg);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quality data");
      } finally {
        setLoading(false);
      }
    },
    [checkAvailability, projectFilter, tierFilter],
  );

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
      if (!mountedRef.current) return;
      // Refresh retro list after a short delay (retro runs in background).
      // Clear any prior timer to avoid stacking; check mount state inside
      // the callback so we don't setState on an unmounted component.
      if (retroTimerRef.current !== null) {
        clearTimeout(retroTimerRef.current);
      }
      retroTimerRef.current = setTimeout(async () => {
        retroTimerRef.current = null;
        try {
          const retroList = await fetchRetroList().catch(() => [] as RetroSummary[]);
          if (!mountedRef.current) return;
          setRetros(retroList);
          setRetroRunning(false);
        } catch {
          if (mountedRef.current) setRetroRunning(false);
        }
      }, 2000);
    } catch (err) {
      if (mountedRef.current) setRetroRunning(false);
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

  // ── Phase F2: config, lessons, preview, bulk, filters ────────────────

  const saveQualityConfig = useCallback(
    async (update: QualityConfigUpdate) => {
      setError(null);
      try {
        const cfg = await updateQualityConfig(update);
        setQualityConfig(cfg);
        return cfg;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update quality config");
        throw err;
      }
    },
    [],
  );

  const loadLessons = useCallback(async (projectSlug: string) => {
    setError(null);
    try {
      const data = await fetchLessons(projectSlug);
      setLessonsByProject((prev) => ({ ...prev, [projectSlug]: data }));
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lessons");
      throw err;
    }
  }, []);

  const previewChange = useCallback(async (changeId: string): Promise<ApplyPreview> => {
    return previewPendingChange(changeId);
  }, []);

  const bulkReject = useCallback(
    async (ids: string[], reason = "bulk_manual") => {
      setError(null);
      try {
        const result = await bulkRejectChanges(ids, reason);
        const [pending, history] = await Promise.all([
          fetchPendingChanges({
            project: projectFilter ?? undefined,
            tier: tierFilter ?? undefined,
          }).catch(() => [] as PendingChange[]),
          fetchTuningHistory(50, {
            project: projectFilter ?? undefined,
            tier: tierFilter ?? undefined,
          }).catch(() => [] as PendingChange[]),
        ]);
        setPendingChanges(pending);
        setTuningHistory(history);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to bulk reject");
        throw err;
      }
    },
    [projectFilter, tierFilter],
  );

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
    qualityConfig,
    lessonsByProject,
    projectFilter,
    tierFilter,

    // Actions
    refresh: loadAll,
    approve,
    reject,
    rollback,
    startRetro,
    loadRetroDetail,
    clearRetroDetail,
    saveQualityConfig,
    loadLessons,
    previewChange,
    bulkReject,
    setProjectFilter,
    setTierFilter,
  };
}
