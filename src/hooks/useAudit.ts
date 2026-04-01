import { useState, useEffect, useCallback } from "react";
import { 
  fetchAuditProjects, 
  fetchAuditStatus, 
  isAuditorRunning,
  startAuditRun,
  cancelAuditRun 
} from "../utils/auditor";
import type { AuditProjectStatus, AuditRunStatus } from "../types";

export function useAudit() {
  const [projects, setProjects] = useState<AuditProjectStatus[]>([]);
  const [runStatuses, setRunStatuses] = useState<Record<string, AuditRunStatus>>({});
  const [auditorAvailable, setAuditorAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAvailability = useCallback(async () => {
    const isRunning = await isAuditorRunning();
    setAuditorAvailable(isRunning);
    return isRunning;
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const available = await checkAvailability();
      if (!available) {
        setLoading(false);
        return;
      }
      
      const data = await fetchAuditProjects();
      setProjects(data);
      
      // Load initial statuses
      const initialStatuses: Record<string, AuditRunStatus> = {};
      for (const p of data) {
         try {
           const status = await fetchAuditStatus(p.name);
           initialStatuses[p.name] = status;
         } catch {
            // ignore individual status failures
         }
      }
      setRunStatuses(initialStatuses);
      
    } catch (err: any) {
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [checkAvailability]);

  // Initial load
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Phase 2: Polling logic
  useEffect(() => {
    const activeProjects = Object.entries(runStatuses)
      .filter(([_, status]) => status.state === "running")
      .map(([name]) => name);

    if (activeProjects.length === 0) return;

    const interval = setInterval(async () => {
      const newStatuses = { ...runStatuses };
      let changed = false;

      for (const name of activeProjects) {
        try {
          const status = await fetchAuditStatus(name);
          if (JSON.stringify(status) !== JSON.stringify(runStatuses[name])) {
            newStatuses[name] = status;
            changed = true;
            
            // If finished, refresh projects to get the new report summary
            if (status.state === "completed" || status.state === "failed") {
               loadProjects();
            }
          }
        } catch (e) {
          console.error(`Status check failed for ${name}:`, e);
        }
      }

      if (changed) {
        setRunStatuses(newStatuses);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runStatuses, loadProjects]);

  const startRun = async (projectName: string) => {
    try {
      await startAuditRun(projectName);
      const status = await fetchAuditStatus(projectName);
      setRunStatuses(prev => ({ ...prev, [projectName]: status }));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const cancelRun = async (projectName: string) => {
    try {
      await cancelAuditRun(projectName);
      const status = await fetchAuditStatus(projectName);
      setRunStatuses(prev => ({ ...prev, [projectName]: status }));
    } catch (err: any) {
      setError(err.message);
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
