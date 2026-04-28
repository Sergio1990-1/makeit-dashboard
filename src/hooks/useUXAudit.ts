import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchUXStatus,
  fetchUXResults,
  startUXAudit,
  cancelUXAudit,
} from "../utils/ux-auditor";
import { isAuditorRunning, fetchAuditProjects } from "../utils/auditor";
import type { AuditProjectStatus, UXAuditRunStatus, UXAuditResults } from "../types";
import { usePolling } from "./usePolling";

const POLL_INTERVAL_MS = 3000;

export function useUXAudit() {
  const [projects, setProjects] = useState<AuditProjectStatus[]>([]);
  const [statuses, setStatuses] = useState<Record<string, UXAuditRunStatus>>({});
  const [results, setResults] = useState<Record<string, UXAuditResults>>({});
  const [auditorAvailable, setAuditorAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      const available = await isAuditorRunning();
      if (!mountedRef.current) return;
      setAuditorAvailable(available);
      if (!available) {
        setLoading(false);
        return;
      }

      const data = await fetchAuditProjects();
      if (!mountedRef.current) return;
      setProjects(data);

      const initialStatuses: Record<string, UXAuditRunStatus> = {};
      for (const p of data) {
        try {
          initialStatuses[p.name] = await fetchUXStatus(p.name);
        } catch {
          // ignore
        }
      }
      if (!mountedRef.current) return;
      setStatuses(initialStatuses);

      const initialResults: Record<string, UXAuditResults> = {};
      for (const [name, status] of Object.entries(initialStatuses)) {
        if (status.state === "completed") {
          try {
            initialResults[name] = await fetchUXResults(name);
          } catch {
            // ignore
          }
        }
      }
      if (mountedRef.current) setResults(initialResults);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const poll = useCallback(async () => {
    const running = Object.entries(statusesRef.current)
      .filter(([, s]) => s.state === "running")
      .map(([n]) => n);

    if (running.length === 0) return;

    for (const name of running) {
      try {
        const status = await fetchUXStatus(name);
        if (!mountedRef.current) return;

        setStatuses((prev) => {
          const cur = prev[name];
          if (cur && JSON.stringify(cur) === JSON.stringify(status)) return prev;
          return { ...prev, [name]: status };
        });

        if (status.state === "completed") {
          try {
            const res = await fetchUXResults(name);
            if (!mountedRef.current) return;
            setResults((prev) => ({ ...prev, [name]: res }));
          } catch {
            // ignore
          }
        }
      } catch (e) {
        console.error(`UX status check failed for ${name}:`, e);
      }
    }
  }, []);

  const { start: startPoll, stop: stopPoll } = usePolling(poll, POLL_INTERVAL_MS);

  useEffect(() => {
    const anyRunning = Object.values(statuses).some((s) => s.state === "running");
    if (anyRunning) startPoll();
    else stopPoll();
  }, [statuses, startPoll, stopPoll]);

  const startRun = async (projectName: string) => {
    try {
      await startUXAudit(projectName);
      const status = await fetchUXStatus(projectName);
      if (!mountedRef.current) return;
      setStatuses((prev) => ({ ...prev, [projectName]: status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const cancelRun = async (projectName: string) => {
    try {
      await cancelUXAudit(projectName);
      const status = await fetchUXStatus(projectName);
      if (!mountedRef.current) return;
      setStatuses((prev) => ({ ...prev, [projectName]: status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  return {
    projects,
    statuses,
    results,
    auditorAvailable,
    loading,
    error,
    refresh: loadProjects,
    startRun,
    cancelRun,
  };
}
