import { useState, useEffect, useCallback } from "react";
import {
  fetchUXStatus,
  fetchUXResults,
  startUXAudit,
  cancelUXAudit,
} from "../utils/ux-auditor";
import { isAuditorRunning, fetchAuditProjects } from "../utils/auditor";
import type { AuditProjectStatus, UXAuditRunStatus, UXAuditResults } from "../types";

export function useUXAudit() {
  const [projects, setProjects] = useState<AuditProjectStatus[]>([]);
  const [statuses, setStatuses] = useState<Record<string, UXAuditRunStatus>>({});
  const [results, setResults] = useState<Record<string, UXAuditResults>>({});
  const [auditorAvailable, setAuditorAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const available = await isAuditorRunning();
      setAuditorAvailable(available);
      if (!available) {
        setLoading(false);
        return;
      }

      const data = await fetchAuditProjects();
      setProjects(data);

      // Load initial statuses
      const initialStatuses: Record<string, UXAuditRunStatus> = {};
      for (const p of data) {
        try {
          initialStatuses[p.name] = await fetchUXStatus(p.name);
        } catch {
          // ignore
        }
      }
      setStatuses(initialStatuses);

      // Load results for completed projects
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
      setResults(initialResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Poll running projects
  useEffect(() => {
    const running = Object.entries(statuses)
      .filter(([, s]) => s.state === "running")
      .map(([name]) => name);

    if (running.length === 0) return;

    const interval = setInterval(async () => {
      const updated = { ...statuses };
      let changed = false;

      for (const name of running) {
        try {
          const status = await fetchUXStatus(name);
          if (JSON.stringify(status) !== JSON.stringify(statuses[name])) {
            updated[name] = status;
            changed = true;

            if (status.state === "completed") {
              try {
                const res = await fetchUXResults(name);
                setResults((prev) => ({ ...prev, [name]: res }));
              } catch {
                // ignore
              }
            }
          }
        } catch (e) {
          console.error(`UX status check failed for ${name}:`, e);
        }
      }

      if (changed) setStatuses(updated);
    }, 3000);

    return () => clearInterval(interval);
  }, [statuses]);

  const startRun = async (projectName: string) => {
    try {
      await startUXAudit(projectName);
      const status = await fetchUXStatus(projectName);
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
