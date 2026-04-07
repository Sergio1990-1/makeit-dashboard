import { useState, useCallback } from "react";
import { readRepoFile } from "../utils/github-actions";
import { parseResearchMd, parseDiscoveryMd } from "../utils/research-parser";
import { getToken } from "../utils/config";
import type { ProjectResearch, ResearchData, DiscoveryData } from "../types";

const OWNER = "Sergio1990-1";

interface UseResearchReturn {
  projects: ProjectResearch[];
  loading: boolean;
  refresh: (repos: string[]) => Promise<void>;
}

async function loadFileOrNull(token: string, repo: string, path: string): Promise<string | null> {
  try {
    return await readRepoFile(token, OWNER, repo, path);
  } catch {
    return null;
  }
}

export function useResearch(): UseResearchReturn {
  const [projects, setProjects] = useState<ProjectResearch[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (repos: string[]) => {
    const token = getToken();
    if (!token) return;

    setLoading(true);

    // Initialize all as loading
    setProjects(repos.map((repo) => ({ repo, research: null, discovery: null, loading: true, error: null })));

    const results = await Promise.allSettled(
      repos.map(async (repo): Promise<ProjectResearch> => {
        const [researchMd, discoveryMd] = await Promise.all([
          loadFileOrNull(token, repo, "RESEARCH.md"),
          loadFileOrNull(token, repo, "DISCOVERY.md"),
        ]);

        let research: ResearchData | null = null;
        let discovery: DiscoveryData | null = null;

        if (researchMd) research = parseResearchMd(researchMd);
        if (discoveryMd) discovery = parseDiscoveryMd(discoveryMd);

        if (!research && !discovery) {
          return { repo, research: null, discovery: null, loading: false, error: "Нет RESEARCH.md / DISCOVERY.md" };
        }
        return { repo, research, discovery, loading: false, error: null };
      })
    );

    setProjects(
      results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return { repo: repos[i], research: null, discovery: null, loading: false, error: String(r.reason) };
      })
    );

    setLoading(false);
  }, []);

  return { projects, loading, refresh };
}
