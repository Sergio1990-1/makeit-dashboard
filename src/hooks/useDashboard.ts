import { useState, useCallback, useMemo, useRef } from "react";
import type { ProjectData, SummaryMetrics, Filters, Issue } from "../types";
import { fetchDashboardData } from "../utils/github";
import { getToken } from "../utils/config";

export function useDashboard() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filters, setFilters] = useState<Filters>({ project: null, priority: null, status: null });
  const projectsRef = useRef<ProjectData[]>([]);

  const refresh = useCallback(async (forceRefresh = true) => {
    const token = getToken();
    if (!token) {
      setError("GitHub token не указан");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchDashboardData(token, forceRefresh);
      projectsRef.current = data;
      setProjects(data);
      setLastUpdated(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
      // On rate limit — try to use cached data if we have nothing
      if (msg.includes("rate limit") && projectsRef.current.length === 0) {
        try {
          const cached = sessionStorage.getItem("makeit_dashboard_cache");
          if (cached) {
            const entry = JSON.parse(cached);
            setProjects(entry.data);
            setError("Rate limit — показаны кэшированные данные");
            setLastUpdated(new Date(entry.timestamp));
            return;
          }
        } catch { /* no cache */ }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredProjects = useMemo(() =>
    projects.filter((p) => {
      if (filters.project && p.repo !== filters.project) return false;
      return true;
    }),
    [projects, filters.project]
  );

  const filteredIssues = useCallback((project: ProjectData): Issue[] => {
    return project.issues.filter((i) => {
      if (filters.priority && i.priority !== filters.priority) return false;
      if (filters.status && i.status !== filters.status) return false;
      return true;
    });
  }, [filters.priority, filters.status]);

  const summary: SummaryMetrics = useMemo(() => ({
    totalIssues: projects.reduce((s, p) => s + p.totalCount, 0),
    openCount: projects.reduce((s, p) => s + p.openCount, 0),
    todoCount: projects.reduce((s, p) => s + p.issues.filter((i) => i.status === "Todo").length, 0),
    inProgressCount: projects.reduce((s, p) => s + p.issues.filter((i) => i.status === "In Progress").length, 0),
    reviewCount: projects.reduce((s, p) => s + p.issues.filter((i) => i.status === "Review").length, 0),
    doneCount: projects.reduce((s, p) => s + p.doneCount, 0),
    projectCount: projects.length,
    totalBudget: projects.reduce((s, p) => s + p.budget, 0),
    totalPaid: projects.reduce((s, p) => s + p.paid, 0),
    totalRemaining: projects.reduce((s, p) => s + p.remaining, 0),
  }), [projects]);

  const blockedIssues: Issue[] = useMemo(() =>
    projects.flatMap((p) => p.issues.filter((i) => i.isBlocked)),
    [projects]
  );

  return {
    projects: filteredProjects,
    filteredIssues,
    summary,
    blockedIssues,
    loading,
    error,
    lastUpdated,
    filters,
    setFilters,
    refresh,
  };
}
