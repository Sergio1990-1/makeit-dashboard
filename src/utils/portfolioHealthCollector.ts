/**
 * portfolioHealthCollector — collects per-project health grades into the
 * map the portfolio grid (`ProjectsView` → `ProjectScorecard`) renders
 * (#456).
 *
 * Per-project health (classification + A–F grade) is real but computing it
 * is async per project and every miss is a GitHub-API health-check run.
 * Doing that for the whole portfolio on every render would be an N+1 the
 * Scorecard explicitly forbids. So collection is a single render-path read:
 *
 *   `collectCachedHealthGrades(repos)` — RENDER PATH, zero cost. A pure
 *   synchronous read of the health hook's own per-repo sessionStorage
 *   cache (`makeit_health_{repo}`). Those entries are populated for free
 *   as the user opens project hubs (`useProjectHealth` already runs the
 *   health pipeline and persists the full `HealthReport`). No network, no
 *   fetch — just `sessionStorage.getItem` per repo. Projects without a
 *   cached report simply don't contribute (the card stays at the muted
 *   "—" it shows today — strictly better than always "—", never a false
 *   signal). This mirrors the proven `portfolioNbaCollector` precedent.
 *
 * `useProjectHealth` does not export its cache-key constant, so the
 * read-only reader mirrors it here (`makeit_health_{repo}` —
 * `SESSION_PREFIX` in useProjectHealth.ts, underscore separator). Kept as
 * the single mirror-point with a comment so a future rename has one place
 * to update.
 */

import type { HealthGrade } from "../components/v4/portfolio/ProjectScorecard";
import type { HealthReport } from "../types/health";

/**
 * Health hook per-project cache-key prefix. Mirrors `SESSION_PREFIX` in
 * useProjectHealth.ts (`makeit_health_`, underscore — NOT a colon); the
 * hook does not export it. If the hook renames it, update here.
 */
const HEALTH_SESSION_PREFIX = "makeit_health_";

const VALID_GRADES: ReadonlySet<HealthGrade> = new Set<HealthGrade>([
  "A",
  "B",
  "C",
  "D",
  "F",
]);

function healthCacheKey(repo: string): string {
  return `${HEALTH_SESSION_PREFIX}${repo}`;
}

/**
 * Read-only peek at one project's cached health report. Returns its
 * letter `grade` if a well-formed report is cached, else null. Returns
 * null for a missing / corrupt / unparsable / unexpected-shape entry so a
 * bad cache degrades to "this project has no grade yet" (card shows "—")
 * instead of throwing.
 */
function readHealthGrade(repo: string): HealthGrade | null {
  if (typeof sessionStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(healthCacheKey(repo));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const report = JSON.parse(raw) as Partial<HealthReport>;
    if (
      report === null ||
      typeof report !== "object" ||
      report.score === null ||
      typeof report.score !== "object"
    ) {
      return null;
    }
    const grade = (report.score as Partial<HealthReport["score"]>).grade;
    if (typeof grade !== "string" || !VALID_GRADES.has(grade as HealthGrade)) {
      return null;
    }
    return grade as HealthGrade;
  } catch {
    return null;
  }
}

/**
 * RENDER PATH — pure synchronous collection of whatever per-project health
 * grades the health hook already cached. One `sessionStorage` read per
 * repo, no network. Returns a `repo → grade` map; repos with no fresh
 * cache are simply absent from the map (caller passes `null` for those, so
 * the Scorecard renders its existing muted "—"). An all-empty portfolio
 * (nothing visited yet) yields an empty map, never a crash or false grade.
 */
export function collectCachedHealthGrades(
  repos: string[],
): Record<string, HealthGrade> {
  const out: Record<string, HealthGrade> = {};
  for (const repo of repos) {
    const grade = readHealthGrade(repo);
    if (grade !== null) out[repo] = grade;
  }
  return out;
}
