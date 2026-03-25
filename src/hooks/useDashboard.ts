import { useState, useCallback } from "react";
import type { ProjectData, SummaryMetrics, Filters, Issue } from "../types";
import { fetchDashboardData } from "../utils/github";
import { getToken } from "../utils/config";

export function useDashboard() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filters, setFilters] = useState<Filters>({ project: null, priority: null, status: null });

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("GitHub token не указан");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchDashboardData(token);
      setProjects(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredProjects = projects.filter((p) => {
    if (filters.project && p.repo !== filters.project) return false;
    return true;
  });

  const filteredIssues = (project: ProjectData): Issue[] => {
    return project.issues.filter((i) => {
      if (filters.priority && i.priority !== filters.priority) return false;
      if (filters.status && i.status !== filters.status) return false;
      return true;
    });
  };

  const summary: SummaryMetrics = {
    totalIssues: projects.reduce((s, p) => s + p.totalCount, 0),
    todoCount: projects.reduce((s, p) => s + p.issues.filter((i) => i.status === "Todo").length, 0),
    inProgressCount: projects.reduce((s, p) => s + p.issues.filter((i) => i.status === "In Progress").length, 0),
    reviewCount: projects.reduce((s, p) => s + p.issues.filter((i) => i.status === "Review").length, 0),
    doneCount: projects.reduce((s, p) => s + p.doneCount, 0),
    projectCount: projects.length,
  };

  const blockedIssues: Issue[] = projects.flatMap((p) => p.issues.filter((i) => i.isBlocked));

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
