import { useState, useCallback, useRef, useEffect } from "react";
import {
  isPipelineRunning,
  startResearchAgent,
  startDiscoveryAgent,
  fetchResearchStatus,
  fetchResearchHistory,
} from "../utils/pipeline";
import type {
  ResearchStartRequest,
  ResearchAgentStatus,
  ResearchHistoryItem,
} from "../utils/pipeline";

const POLL_INTERVAL = 3000;

interface UseResearchAgentReturn {
  /** Whether Pipeline API is reachable */
  pipelineAvailable: boolean | null;
  /** Currently active agent run (if any) */
  activeRun: ResearchAgentStatus | null;
  /** History of past runs for a project */
  history: ResearchHistoryItem[];
  /** Loading states */
  starting: boolean;
  /** Error from last operation */
  error: string | null;
  /** Check Pipeline availability */
  checkPipeline: () => Promise<boolean>;
  /** Start a Research agent */
  launchResearch: (req: ResearchStartRequest) => Promise<void>;
  /** Start a Discovery agent */
  launchDiscovery: (project: string) => Promise<void>;
  /** Load history for a project */
  loadHistory: (project: string) => Promise<void>;
  /** Clear active run (after dismissing) */
  clearActiveRun: () => void;
}

export function useResearchAgent(): UseResearchAgentReturn {
  const [pipelineAvailable, setPipelineAvailable] = useState<boolean | null>(null);
  const [activeRun, setActiveRun] = useState<ResearchAgentStatus | null>(null);
  const [history, setHistory] = useState<ResearchHistoryItem[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchResearchStatus(id);
        setActiveRun(status);
        if (status.status === "done" || status.status === "error") {
          stopPolling();
        }
      } catch {
        // Ignore poll errors, will retry
      }
    }, POLL_INTERVAL);
  }, [stopPolling]);

  const checkPipeline = useCallback(async () => {
    const ok = await isPipelineRunning();
    setPipelineAvailable(ok);
    return ok;
  }, []);

  const launchResearch = useCallback(async (req: ResearchStartRequest) => {
    stopPolling();
    setStarting(true);
    setError(null);
    try {
      const { id } = await startResearchAgent(req);
      const status = await fetchResearchStatus(id);
      setActiveRun(status);
      startPolling(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Research agent");
    } finally {
      setStarting(false);
    }
  }, [startPolling, stopPolling]);

  const launchDiscovery = useCallback(async (project: string) => {
    stopPolling();
    setStarting(true);
    setError(null);
    try {
      const { id } = await startDiscoveryAgent(project);
      const status = await fetchResearchStatus(id);
      setActiveRun(status);
      startPolling(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Discovery agent");
    } finally {
      setStarting(false);
    }
  }, [startPolling, stopPolling]);

  const loadHistory = useCallback(async (project: string) => {
    try {
      const items = await fetchResearchHistory(project);
      setHistory(items);
    } catch {
      setHistory([]);
    }
  }, []);

  const clearActiveRun = useCallback(() => {
    stopPolling();
    setActiveRun(null);
  }, [stopPolling]);

  return {
    pipelineAvailable,
    activeRun,
    history,
    starting,
    error,
    checkPipeline,
    launchResearch,
    launchDiscovery,
    loadHistory,
    clearActiveRun,
  };
}
