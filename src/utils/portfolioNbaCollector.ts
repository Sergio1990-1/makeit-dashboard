/**
 * portfolioNbaCollector — collects per-project NBA results into the input
 * the portfolio aggregate (`computePortfolioNBA` / `usePortfolioNba`)
 * expects (#453, was Epic-012 Task-09 / #367 "not done").
 *
 * The per-project engine (`computeProjectNBA`) is real but every miss is a
 * Claude call. Computing it for the whole portfolio on every render would
 * be an N+1 of model calls blocking the Projects view — explicitly
 * forbidden. So collection is split in two:
 *
 *   1. `collectCachedPerProjectNba(repos)` — RENDER PATH, zero cost.
 *      A pure synchronous read of the engine's own per-project week-cache
 *      (`makeit_nba:{repo}`). Those entries are populated for free as the
 *      user opens project hubs (`useProjectHub` already calls
 *      `computeProjectNBA`). No Claude, no network, no fetch — just
 *      `localStorage.getItem` per repo. Projects without a fresh cache
 *      simply don't contribute (graceful, never a false signal).
 *
 *   2. `collectLivePerProjectNba(projects, apiKey)` — REGENERATE PATH,
 *      on-demand only (fires from the user's «Регенерировать» click, never
 *      on render). For each project it derives lightweight NBA signals
 *      from data ProjectsView already holds (blocked / stale-open issues —
 *      no extra fetch) and calls `computeProjectNBA`. Fresh week-cache
 *      hits short-circuit inside the engine, so a regenerate right after a
 *      browse session mostly reuses caches and only spends a Claude call
 *      on projects that actually changed or were never opened.
 *
 * The engine does not export its per-project cache key shape, so the
 * read-only reader mirrors it here (`makeit_nba:{repo}`, `{week, result}`
 * envelope, ISO-week scoped). Kept as the single mirror-point with a
 * comment so a future engine rename has one place to update.
 */

import type { ProjectData } from "../types";
import {
  computeProjectNBA,
  type NbaInputs,
  type NbaResult,
} from "./nextBestActionEngine";

/**
 * Engine per-project cache key prefix. Mirrors
 * `PROJECT_KEY_PREFIX` in nextBestActionEngine.ts (`makeit_nba`); the
 * engine does not export it. If the engine renames it, update here.
 */
const PROJECT_NBA_KEY_PREFIX = "makeit_nba";

/** Cap so a regenerate never fans out an unbounded number of model calls. */
const MAX_LIVE_PROJECTS = 20;

/** Shape the engine writes per project: `{ week, result: NbaResult }`. */
interface RawProjectCacheEnvelope {
  week?: unknown;
  result?: unknown;
}

function projectCacheKey(repo: string): string {
  return `${PROJECT_NBA_KEY_PREFIX}:${repo}`;
}

/**
 * Read-only peek at one project's engine cache. Returns its `NbaResult`
 * regardless of which ISO week wrote it (the portfolio aggregate is
 * itself week-scoped downstream, and a slightly stale per-project entry
 * is still a far better portfolio signal than nothing). Returns null for
 * a missing / corrupt / empty-storage entry so a bad cache degrades to
 * "this project doesn't contribute" instead of throwing.
 */
function readProjectNbaCache(repo: string): NbaResult | null {
  if (typeof localStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(projectCacheKey(repo));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const env = JSON.parse(raw) as RawProjectCacheEnvelope;
    if (
      env === null ||
      typeof env !== "object" ||
      typeof env.week !== "string" ||
      env.result === null ||
      typeof env.result !== "object"
    ) {
      return null;
    }
    const result = env.result as Partial<NbaResult>;
    if (!Array.isArray(result.actions)) return null;
    return {
      actions: result.actions,
      budgetFallback: result.budgetFallback === true,
      warning: typeof result.warning === "string" ? result.warning : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * RENDER PATH — pure synchronous collection of whatever per-project NBA
 * results the engine already cached. One `localStorage` read per repo, no
 * Claude / network. The result is the `perProjectActions` input
 * `usePortfolioNba` aggregates; an all-empty portfolio (nothing cached
 * yet) yields `[]` → the widget's graceful empty state, never a crash or
 * a false badge.
 */
export function collectCachedPerProjectNba(repos: string[]): NbaResult[] {
  const out: NbaResult[] = [];
  for (const repo of repos) {
    const cached = readProjectNbaCache(repo);
    if (cached !== null) out.push(cached);
  }
  return out;
}

/**
 * Derive lightweight per-project NBA signals from data ProjectsView
 * already holds — NO extra fetch. We surface blocked and stale-open
 * issues as `drift` indicators (the engine's free-form norm-violation
 * channel). This is intentionally a coarse signal: the rich per-project
 * inputs (audit findings, risks) belong to the Project Hub
 * (`useProjectHub`), which already computes the high-fidelity per-project
 * NBA cached entries this collector's render path reuses. The live path
 * exists so «Регенерировать» still produces *something* for projects the
 * user never opened.
 */
function deriveProjectSignals(p: ProjectData): NbaInputs {
  const drift: NonNullable<NbaInputs["drift"]> = [];

  const blocked = p.issues.filter((i) => i.isBlocked && i.status !== "Done");
  if (blocked.length > 0) {
    drift.push({
      label: `${blocked.length} заблокированных задач: ${blocked
        .slice(0, 3)
        .map((i) => i.title)
        .join("; ")}`,
      severity: "high",
    });
  }

  const isStaleOpen =
    p.daysSinceActivity !== null &&
    p.daysSinceActivity >= 7 &&
    p.openCount > 0;
  if (isStaleOpen) {
    drift.push({
      label: `Нет активности ${p.daysSinceActivity} дней при ${p.openCount} открытых задачах`,
      severity: "medium",
    });
  }

  const p1 = p.priorityCounts.P1 ?? 0;
  if (p1 > 0) {
    drift.push({
      label: `${p1} задач приоритета P1 в работе`,
      severity: "high",
    });
  }

  return { drift };
}

/**
 * REGENERATE PATH — on-demand per-project collection. For each project
 * (capped at `MAX_LIVE_PROJECTS`) it derives signals and calls
 * `computeProjectNBA`. A fresh per-project week-cache short-circuits
 * inside the engine (no Claude call); projects with no actionable signal
 * also short-circuit to an empty cached result. The engine never throws
 * to us (it degrades to stale cache + warning), but each call is still
 * isolated so one project's failure can't abort the whole collection.
 *
 * Returns the per-project `NbaResult[]` for `computePortfolioNBA` to
 * aggregate. Caller passes this to `usePortfolioNba`, which invalidates
 * the portfolio cache and recomputes — so after this resolves the
 * `makeit_portfolio_nba` cache (sidebar badge) reflects fresh data.
 */
export async function collectLivePerProjectNba(
  projects: ProjectData[],
  apiKey: string,
): Promise<NbaResult[]> {
  const slice = projects.slice(0, MAX_LIVE_PROJECTS);
  const results = await Promise.all(
    slice.map(async (p) => {
      try {
        return await computeProjectNBA(p.repo, deriveProjectSignals(p), apiKey);
      } catch {
        // Engine already degrades internally; this is belt-and-braces so
        // one rejected project never sinks the portfolio regenerate.
        return null;
      }
    }),
  );
  return results.filter((r): r is NbaResult => r !== null);
}
