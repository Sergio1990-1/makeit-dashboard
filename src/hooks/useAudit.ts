import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchAuditProjects,
  fetchAuditStatus,
  isAuditorRunning,
  startAuditRun,
  cancelAuditRun,
} from "../utils/auditor";
import type { AuditProjectStatus, AuditRunStatus } from "../types";
import { usePolling } from "./usePolling";

const POLL_INTERVAL_MS = 3000;

export function useAudit() {
  const [projects, setProjects] = useState<AuditProjectStatus[]>([]);
  const [runStatuses, setRunStatuses] = useState<Record<string, AuditRunStatus>>({});
  const [auditorAvailable, setAuditorAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  // Keep latest runStatuses readable from poll callback without re-creating it
  const runStatusesRef = useRef(runStatuses);
  runStatusesRef.current = runStatuses;
  // Avoid stacking concurrent loadProjects() invocations when several
  // projects finish in the same tick.
  const loadingProjectsRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const checkAvailability = useCallback(async () => {
    const isRunning = await isAuditorRunning();
    if (mountedRef.current) setAuditorAvailable(isRunning);
    return isRunning;
  }, []);

  const loadProjects = useCallback(async () => {
    if (loadingProjectsRef.current) return;
    loadingProjectsRef.current = true;
    try {
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      const available = await checkAvailability();
      if (!available) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      const data = await fetchAuditProjects();
      if (!mountedRef.current) return;
      setProjects(data);

      const initialStatuses: Record<string, AuditRunStatus> = {};
      for (const p of data) {
        try {
          initialStatuses[p.name] = await fetchAuditStatus(p.name);
        } catch {
          // ignore individual status failures
        }
      }
      if (mountedRef.current) setRunStatuses(initialStatuses);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      }
    } finally {
      loadingProjectsRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [checkAvailability]);

  const loadProjectsRef = useRef(loadProjects);
  loadProjectsRef.current = loadProjects;

  // Initial load
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // Polling — single ref-based interval; callback reads latest state via ref
  // and writes via functional updater.
  const poll = useCallback(async () => {
    const running = Object.entries(runStatusesRef.current)
      .filter(([, s]) => s.state === "running")
      .map(([n]) => n);

    if (running.length === 0) return;

    let needProjectReload = false;
    for (const name of running) {
      try {
        const status = await fetchAuditStatus(name);
        if (!mountedRef.current) return;
        setRunStatuses((prev) => {
          const cur = prev[name];
          if (cur && JSON.stringify(cur) === JSON.stringify(status)) return prev;
          return { ...prev, [name]: status };
        });
        if (status.state === "completed" || status.state === "failed") {
          needProjectReload = true;
        }
      } catch (e) {
        console.error(`Status check failed for ${name}:`, e);
      }
    }
    if (needProjectReload && mountedRef.current) {
      void loadProjectsRef.current();
    }
  }, []);

  const { start: startPoll, stop: stopPoll } = usePolling(poll, POLL_INTERVAL_MS);

  useEffect(() => {
    const anyRunning = Object.values(runStatuses).some((s) => s.state === "running");
    if (anyRunning) startPoll();
    else stopPoll();
  }, [runStatuses, startPoll, stopPoll]);

  const startRun = async (projectName: string) => {
    try {
      await startAuditRun(projectName);
      // Optimistically mark as running so the polling effect engages
      // immediately. The backend worker may take a moment to flip its
      // own state to "running"; without this, fetchAuditStatus can
      // return the previous "idle"/"completed" state and polling never
      // starts until the user manually reloads.
      const optimistic: AuditRunStatus = {
        state: "running",
        stage: "Starting...",
        progress: 0,
        message: null,
        started_at: new Date().toISOString(),
        error: null,
      };
      setRunStatuses((prev) => ({ ...prev, [projectName]: optimistic }));
      // Fire-and-forget real status fetch; polling will keep it fresh.
      fetchAuditStatus(projectName)
        .then((status) => {
          if (!mountedRef.current) return;
          setRunStatuses((prev) => {
            // Don't overwrite a "running" with a stale non-running reply.
            const current = prev[projectName];
            if (current?.state === "running" && status.state !== "running") {
              return prev;
            }
            return { ...prev, [projectName]: status };
          });
        })
        .catch(() => {
          // ignore — polling will retry
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const cancelRun = async (projectName: string) => {
    try {
      await cancelAuditRun(projectName);
      const status = await fetchAuditStatus(projectName);
      if (!mountedRef.current) return;
      setRunStatuses((prev) => ({ ...prev, [projectName]: status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  return {
    projects,
    runStatuses,
    auditorAvailable,
    loading,
    error,
    refresh: loadProjects,
    startRun,
    cancelRun,
  };
}
