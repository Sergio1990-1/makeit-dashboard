/**
 * Metric calculations — ported from github.ts lines 466-558.
 * Every formula is preserved exactly to ensure metric correctness.
 */

import type { Issue, Priority, Phase, ProjectData, ProjectConfig, RepoInfo, CommitActivity } from "./types";
import { buildActivity } from "./github";

// Ported from github.ts lines 139-143
function determinePhase(issues: Issue[]): Phase {
  if (issues.length === 0) return "pre-dev";
  const hasOpen = issues.some((i) => i.status !== "Done");
  return hasOpen ? "development" : "support";
}

/**
 * Recalculate time-sensitive fields from raw byDate data.
 * Called on every API response to ensure today/thisWeek/thisMonth are fresh.
 */
export function refreshCommitActivity(raw: CommitActivity): CommitActivity {
  return buildActivity(raw.byDate);
}

/**
 * Recalculate daysSinceActivity from raw dates.
 * Called on every API response for freshness.
 */
export function calcDaysSinceActivity(
  lastCommitDate: string | null,
  issues: Issue[]
): { daysSinceActivity: number | null; lastActivityDate: string | null } {
  // Ported from github.ts lines 483-492
  const dates = [
    lastCommitDate,
    ...issues.map((i) => i.updatedAt),
  ].filter(Boolean) as string[];

  const lastActivityDate = dates.length > 0
    ? dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  const daysSinceActivity = lastActivityDate
    ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / 86400000)
    : null;

  return { daysSinceActivity, lastActivityDate };
}

/**
 * Build a single ProjectData from config, board issues, and repo info.
 * Ported from github.ts lines 466-558.
 */
export function buildProjectData(
  project: ProjectConfig,
  repoIssues: Issue[],
  repoInfo: RepoInfo
): ProjectData {
  // Priority counts — only for non-Done issues (line 470-473)
  const priorityCounts: Record<Priority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const issue of repoIssues) {
    if (issue.priority && issue.status !== "Done") priorityCounts[issue.priority]++;
  }

  // Use real GitHub issue counts (lines 477-480)
  const openCount = repoInfo.openIssueCount;
  const doneCount = repoInfo.closedIssueCount;
  const totalCount = openCount + doneCount;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Last activity (lines 483-492)
  const { daysSinceActivity, lastActivityDate } = calcDaysSinceActivity(
    repoInfo.lastCommitDate,
    repoIssues
  );

  // Velocity: issues per ACTIVE day (lines 499-511)
  const now = Date.now();
  const closedWithDates = repoIssues.filter((i) => i.closedAt);

  function calcVelocity(periodMs: number): number {
    const items = closedWithDates.filter((i) => now - new Date(i.closedAt!).getTime() < periodMs);
    if (items.length === 0) return 0;
    const activeDays = new Set(items.map((i) => new Date(i.closedAt!).toISOString().split("T")[0]));
    return items.length / activeDays.size;
  }

  const velocity7d = calcVelocity(7 * 86400000);
  const velocity14d = calcVelocity(14 * 86400000);

  // ETA (lines 512-517)
  const bestVelocity = Math.max(velocity7d, velocity14d, 0.001);
  const rawEtaDays = openCount > 0 ? Math.ceil(openCount / bestVelocity * 1.25) : null;
  const etaDays = rawEtaDays !== null ? Math.min(rawEtaDays, 365) : null;
  const etaDate = etaDays !== null
    ? new Date(now + etaDays * 86400000).toISOString()
    : null;

  // Cycle time: median days open→close, last 28 days (lines 519-531)
  const cutoff28d = now - 28 * 86400000;
  const recentlyClosed = repoIssues.filter(
    (i) => i.closedAt && new Date(i.closedAt).getTime() > cutoff28d
  );
  let cycleTimeDays: number | null = null;
  if (recentlyClosed.length > 0) {
    const times = recentlyClosed
      .map((i) => (new Date(i.closedAt!).getTime() - new Date(i.createdAt).getTime()) / 86400000)
      .sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    cycleTimeDays = times.length % 2 === 0 ? (times[mid - 1] + times[mid]) / 2 : times[mid];
  }

  return {
    repo: project.repo,
    client: project.client,
    phase: determinePhase(repoIssues),
    issues: repoIssues,
    priorityCounts,
    progress,
    lastCommitDate: repoInfo.lastCommitDate,
    description: repoInfo.description,
    openCount,
    doneCount,
    totalCount,
    milestones: repoInfo.milestones,
    // Financial data is client-side only; backend returns zeros
    budget: 0,
    paid: 0,
    remaining: 0,
    daysSinceActivity,
    lastActivityDate,
    velocity7d,
    velocity14d,
    etaDays,
    etaDate,
    cycleTimeDays,
    commitActivity: repoInfo.commitActivity,
  };
}
