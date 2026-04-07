import { useState, useCallback } from "react";
import { listRepoFiles, readRepoFile } from "../utils/github-actions";
import { parsePrdMd, parseEpicMd } from "../utils/specs-parser";
import { getToken } from "../utils/config";
import type { SpecsProject, PrdData, EpicData, SpecStatus } from "../types";

const OWNER = "Sergio1990-1";
const PIPELINE_REPO = "makeit-pipeline";

interface UseSpecsReturn {
  projects: SpecsProject[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

async function readFileOrNull(token: string, path: string): Promise<string | null> {
  try {
    return await readRepoFile(token, OWNER, PIPELINE_REPO, path);
  } catch {
    return null;
  }
}

function computeStatus(prd: PrdData, epics: EpicData[]): SpecStatus {
  if (!epics.length) return "draft";

  const statuses = epics.map((e) => e.epicStatus.toLowerCase());

  // All completed
  if (statuses.every((s) => s === "completed" || s === "done")) return "completed";

  // Any in-progress or development
  if (statuses.some((s) => s.includes("progress") || s.includes("dev"))) return "in_development";

  // PRD approved but epics still planning
  if (prd.status.toLowerCase() === "approved") return "spec_ready";

  return "draft";
}

export function useSpecs(): UseSpecsReturn {
  const [projects, setProjects] = useState<SpecsProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      // 1. List all PRD files
      const prdFiles = await listRepoFiles(token, OWNER, PIPELINE_REPO, "docs/prds");
      const prdNames = prdFiles
        .filter((f) => f.type === "file" && f.name.endsWith(".md"))
        .map((f) => f.name.replace(".md", ""));

      // 2. List all epic files
      const epicFiles = await listRepoFiles(token, OWNER, PIPELINE_REPO, "docs/epics");
      const epicNames = epicFiles
        .filter((f) => f.type === "file" && f.name.endsWith(".md"))
        .map((f) => f.name.replace(".md", ""));

      // 3. Load PRDs and Epics in parallel
      const [prdContents, epicContents] = await Promise.all([
        Promise.all(prdNames.map(async (name) => {
          const md = await readFileOrNull(token, `docs/prds/${name}.md`);
          return md ? parsePrdMd(name.toUpperCase(), md) : null;
        })),
        Promise.all(epicNames.map(async (name) => {
          const md = await readFileOrNull(token, `docs/epics/${name}.md`);
          return md ? parseEpicMd(name, md) : null;
        })),
      ]);

      const prds = prdContents.filter((p): p is PrdData => p !== null);
      const epics = epicContents.filter((e): e is EpicData => e !== null);

      // 4. Group epics by PRD
      const result: SpecsProject[] = prds.map((prd) => {
        const linkedEpics = epics.filter(
          (e) => e.prd.toUpperCase() === prd.id.toUpperCase()
        );
        const totalTasks = linkedEpics.reduce((n, e) => n + e.tasks.length, 0);

        return {
          prd,
          epics: linkedEpics,
          computedStatus: computeStatus(prd, linkedEpics),
          totalTasks,
          completedTasks: 0, // TODO: cross-reference with GitHub Issues if needed
        };
      });

      // Sort: in_development first, then spec_ready, draft, completed
      const ORDER: Record<SpecStatus, number> = {
        in_development: 0,
        spec_ready: 1,
        draft: 2,
        completed: 3,
      };
      result.sort((a, b) => ORDER[a.computedStatus] - ORDER[b.computedStatus]);

      setProjects(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки спецификаций");
    } finally {
      setLoading(false);
    }
  }, []);

  return { projects, loading, error, refresh };
}
