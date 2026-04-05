/**
 * In-memory cache with periodic GitHub sync.
 */

import type { ProjectData } from "./types";
import { PROJECTS, SYNC_INTERVAL } from "./config";
import { fetchAllProjectItems, fetchRepoInfo } from "./github";
import { buildProjectData, refreshCommitActivity, calcDaysSinceActivity } from "./transform";

interface CacheState {
  data: ProjectData[];
  lastSync: string | null;       // ISO timestamp of last successful sync
  syncDuration: number;          // ms of last sync
  syncing: boolean;
  error: string | null;
}

const state: CacheState = {
  data: [],
  lastSync: null,
  syncDuration: 0,
  syncing: false,
  error: null,
};

// Waiters for in-progress sync (used by syncAndWait)
let syncWaiters: Array<() => void> = [];

/**
 * Full sync: fetch all data from GitHub, compute metrics, store in memory.
 */
export async function sync(): Promise<void> {
  if (state.syncing) {
    console.log("[Cache] Sync already running, skipping");
    return;
  }

  state.syncing = true;
  state.error = null;
  const start = Date.now();

  try {
    console.log("[Cache] Starting sync...");

    // 1. Fetch all project board items (paginated)
    const allIssues = await fetchAllProjectItems();

    // 2. Fetch repo info for all projects in parallel
    const projectDataPromises = PROJECTS.map(async (project) => {
      const repoIssues = allIssues.filter((i) => i.repo === project.repo);
      const repoInfo = await fetchRepoInfo(project.owner, project.repo);
      return buildProjectData(project, repoIssues, repoInfo);
    });

    const result = await Promise.all(projectDataPromises);

    state.data = result;
    state.lastSync = new Date().toISOString();
    state.syncDuration = Date.now() - start;

    console.log(`[Cache] Sync complete: ${result.length} projects, ${Math.round(state.syncDuration / 1000)}s`);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    state.syncDuration = Date.now() - start;
    console.error(`[Cache] Sync failed (${Math.round(state.syncDuration / 1000)}s):`, state.error);
    // Keep old data on failure
  } finally {
    state.syncing = false;
    // Notify anyone waiting for sync to complete
    for (const resolve of syncWaiters) resolve();
    syncWaiters = [];
  }
}

/**
 * Wait for an in-progress sync, or start a new one and wait.
 * Used by POST /api/sync?wait=true for blocking refresh.
 */
export async function syncAndWait(): Promise<void> {
  if (state.syncing) {
    // Wait for current sync to finish
    await new Promise<void>((resolve) => syncWaiters.push(resolve));
    return;
  }
  await sync();
}

/**
 * Get cached data with refreshed time-sensitive fields.
 * today/thisWeek/thisMonth and daysSinceActivity are recalculated on every request.
 */
export function getData(): ProjectData[] {
  return state.data.map((p) => ({
    ...p,
    commitActivity: refreshCommitActivity(p.commitActivity),
    ...calcDaysSinceActivity(p.lastCommitDate, p.issues),
  }));
}

export function getStatus() {
  return {
    lastSync: state.lastSync,
    syncDuration: state.syncDuration,
    syncing: state.syncing,
    error: state.error,
    projectCount: state.data.length,
    issueCount: state.data.reduce((sum, p) => sum + p.issues.length, 0),
  };
}

export function isSyncing(): boolean {
  return state.syncing;
}

/**
 * Start periodic sync. Runs immediately, then every SYNC_INTERVAL.
 */
export function startCron(): void {
  // Immediate first sync
  sync().catch((err) => console.error("[Cache] Initial sync error:", err));

  // Periodic sync
  setInterval(() => {
    sync().catch((err) => console.error("[Cache] Periodic sync error:", err));
  }, SYNC_INTERVAL);

  console.log(`[Cache] Cron started: syncing every ${SYNC_INTERVAL / 1000}s`);
}
