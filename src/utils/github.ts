import type { Issue, IssueStatus, Priority, Complexity, Phase, ProjectData, Milestone, CommitActivity } from "../types";
import { getProjects, GITHUB_OWNER, GITHUB_PROJECT_NUMBER, DEFAULT_PROJECTS, loadFinances, getToken } from "./config";
import { dispatchExternalAuthLost } from "./external-auth-events";
import { toLocalDay } from "./date";

function getCacheUrl(): string {
  return (window as unknown as { __MAKEIT_CONFIG__?: { CACHE_URL?: string } }).__MAKEIT_CONFIG__?.CACHE_URL ?? "";
}

const GITHUB_REST = "https://api.github.com";

async function restGet<T>(token: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GITHUB_REST}${path}`, {
      headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (res.status === 401) {
      // FR-8: signal that the GitHub PAT was rejected so App.tsx can prompt
      // the user to rotate it via SettingsPanel.
      dispatchExternalAuthLost("github");
    }
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// GitHub Stats API — 1 request per repo, no pagination, covers up to 52 weeks
// Returns 202 while stats are being computed → retry up to 3 times
export interface CommitWeekStat {
  days: number[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  total: number;
  week: number;   // Unix timestamp (seconds) of the Sunday that starts this week (UTC)
}

/**
 * Convert GitHub's weekly commit-activity stats into a `CommitActivity`.
 *
 * `week.week` is the Unix-seconds timestamp for the Sunday that starts the
 * week (GitHub anchors it at UTC 00:00); `days[0]=Sun … days[6]=Sat`.
 *
 * Day keys are bucketed by the **browser's local day** (`toLocalDay`) so the
 * producer matches every consumer (heatmap axis, `getLast7Days`, etc.) that
 * keys on local days. Keying on UTC here caused commits near midnight to land
 * on the wrong heatmap cell for users west/east of UTC.
 */
export function commitActivityFromWeeks(weeks: CommitWeekStat[]): CommitActivity {
  const byDate: Record<string, number> = {};
  for (const week of weeks) {
    for (let d = 0; d < 7; d++) {
      const count = week.days[d];
      if (count === 0) continue;
      const date = toLocalDay(new Date((week.week + d * 86400) * 1000));
      byDate[date] = (byDate[date] ?? 0) + count;
    }
  }
  return buildActivity(byDate);
}

async function fetchCommitActivity(token: string, owner: string, repo: string): Promise<CommitActivity> {
  // Primary: stats/commit_activity — 1 request, covers 52 weeks, no pagination cap.
  // GitHub computes these asynchronously and may return 202 on first call.
  // Retry up to 3 times, then fall back to commits pagination.
  let weeks: CommitWeekStat[] | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await restGet<CommitWeekStat[]>(
      token,
      `/repos/${owner}/${repo}/stats/commit_activity`
    );
    if (Array.isArray(result) && result.length > 0) {
      weeks = result;
      break;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
  }

  if (weeks) {
    // Convert weekly stats to byDate map (keyed by local day — see helper).
    return commitActivityFromWeeks(weeks);
  }

  // Fallback: commits endpoint with pagination (up to 5 pages = 500 commits)
  // Used when stats API is still warming up for the repo
  const since = new Date(Date.now() - 84 * 86400000).toISOString();
  const byDate: Record<string, number> = {};
  for (let page = 1; page <= 5; page++) {
    const commits = await restGet<Array<{ commit: { committer?: { date?: string }; author?: { date?: string } } }>>(
      token,
      `/repos/${owner}/${repo}/commits?since=${since}&per_page=100&page=${page}`
    );
    if (!Array.isArray(commits) || commits.length === 0) break;
    for (const c of commits) {
      const dateStr = c.commit?.committer?.date ?? c.commit?.author?.date ?? "";
      if (!dateStr) continue;
      // Key by the browser's local day to match the heatmap axis / consumers
      // (toLocalDay), not the UTC calendar day the ISO string encodes.
      const date = toLocalDay(new Date(dateStr));
      byDate[date] = (byDate[date] ?? 0) + 1;
    }
    if (commits.length < 100) break;
  }
  return buildActivity(byDate);
}

export function buildActivity(byDate: Record<string, number>): CommitActivity {
  const now = Date.now();
  // Derive boundaries in LOCAL days so they line up with the local-day keys
  // in `byDate` (and the heatmap axis). Using UTC here would mis-bucket the
  // today/thisWeek/thisMonth windows for users east/west of UTC.
  const todayStr = toLocalDay(new Date());
  const weekAgo = toLocalDay(new Date(now - 7 * 86400000));
  const monthAgo = toLocalDay(new Date(now - 30 * 86400000));
  const period84dAgo = toLocalDay(new Date(now - 84 * 86400000));
  return {
    byDate,
    today: byDate[todayStr] ?? 0,
    thisWeek: Object.entries(byDate).filter(([d]) => d >= weekAgo).reduce((s, [, v]) => s + v, 0),
    thisMonth: Object.entries(byDate).filter(([d]) => d >= monthAgo).reduce((s, [, v]) => s + v, 0),
    total84d: Object.entries(byDate).filter(([d]) => d >= period84dAgo).reduce((s, [, v]) => s + v, 0),
  };
}

/**
 * Whole-repo completion percentage (0–100).
 *
 * Only reaches 100 when every issue is closed (`done === total`); an
 * incomplete repo that would otherwise round up (e.g. 199/200 = 99.5%) is
 * capped at 99 so "almost done" never reads as "done". Returns 0 when there
 * are no issues at all (guarded `total > 0`).
 */
export function computeProgress(doneCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  if (doneCount === totalCount) return 100;
  return Math.min(99, Math.round((doneCount / totalCount) * 100));
}

/**
 * #519: derive open/done/total from the Project #1 board subset (`repoIssues`)
 * so they reconcile with `priorityCounts`/`velocity`/`etaDays`/`bugRatio`,
 * which all iterate the same board population. Previously open/done came from
 * the repo-wide `issues().totalCount`, which double-counts issues that aren't
 * on the board — making the parts fail to sum to the whole.
 *
 * An issue counts as **done** iff `closedAt` is set — the same closed-signal
 * used by velocity, cycle time, and milestone hydration. `openCount` is the
 * remainder and `totalCount` is the board size, so `open + done === total` by
 * construction.
 */
export function boardIssueCounts(
  issues: ReadonlyArray<Pick<Issue, "closedAt">>
): { openCount: number; doneCount: number; totalCount: number } {
  let doneCount = 0;
  for (const issue of issues) {
    if (issue.closedAt) doneCount++;
  }
  const totalCount = issues.length;
  return { openCount: totalCount - doneCount, doneCount, totalCount };
}

export interface OpenMilestone {
  number: number;
  title: string;
  due_on: string | null;
}

interface RestMilestone {
  number: number;
  title: string;
  due_on: string | null;
}

/** Fetch open milestones for a single repo via REST.
 *
 * Returns:
 *   - `OpenMilestone[]` (possibly empty) on success — empty means "repo has no
 *     open milestones", which is a legitimate steady state worth caching.
 *   - `null` on auth/network failure — the caller should NOT cache this,
 *     otherwise a transient 401 permanently breaks the dropdown until reload. */
export async function fetchOpenMilestones(
  token: string,
  owner: string,
  repo: string,
): Promise<OpenMilestone[] | null> {
  const items = await restGet<RestMilestone[]>(
    token,
    `/repos/${owner}/${repo}/milestones?state=open&sort=due_on&direction=asc&per_page=100`,
  );
  if (items === null) return null;
  if (!Array.isArray(items)) return [];
  return items.map((m) => ({ number: m.number, title: m.title, due_on: m.due_on }));
}

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 || res.status === 403) {
    // FR-8: surface the auth-lost event in addition to the thrown error so
    // App.tsx can show an actionable toast pointing to SettingsPanel.
    dispatchExternalAuthLost("github");
    throw new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый.");
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

function parsePriority(labels: string[]): Priority | null {
  for (const label of labels) {
    const match = label.match(/^P([1-4])/i);
    if (match) return `P${match[1]}` as Priority;
  }
  return null;
}

// Mirror of parsePriority for the pipeline complexity bucket. The pipeline
// writes one of `complexity-auto` / `complexity-assisted` / `complexity-manual`;
// projects where classify never ran carry no such label → null (rendered as
// "unclassified" in the Hub task matrix, which is correct, not a bug).
function parseComplexity(labels: string[]): Complexity | null {
  for (const label of labels) {
    const match = label.match(/^complexity-(auto|assisted|manual)$/i);
    if (match) return match[1].toLowerCase() as Complexity;
  }
  return null;
}

function parseStatus(statusField: string | null): IssueStatus {
  if (!statusField) return "Todo";
  const lower = statusField.toLowerCase();
  if (lower.includes("done") || lower.includes("closed")) return "Done";
  if (lower.includes("review")) return "Review";
  if (lower.includes("progress")) return "In Progress";
  return "Todo";
}

function determinePhase(issues: Issue[]): Phase {
  if (issues.length === 0) return "pre-dev";
  const hasOpen = issues.some((i) => i.status !== "Done");
  return hasOpen ? "development" : "support";
}

const PROJECT_ITEMS_QUERY = `
query($owner: String!, $number: Int!, $cursor: String) {
  user(login: $owner) {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          content {
            ... on Issue {
              number
              title
              url
              createdAt
              updatedAt
              closedAt
              state
              milestone { title }
              labels(first: 20) {
                nodes { name }
              }
              repository { name }
            }
            ... on DraftIssue {
              title
              createdAt
              updatedAt
            }
          }
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
            }
          }
        }
      }
    }
  }
}
`;

interface ProjectItemNode {
  id: string;
  type: string;
  content: {
    number?: number;
    title?: string;
    url?: string;
    createdAt?: string;
    updatedAt?: string;
    closedAt?: string | null;
    state?: string;
    milestone?: { title: string } | null;
    labels?: { nodes: { name: string }[] };
    repository?: { name: string };
  } | null;
  fieldValues: {
    nodes: Array<{
      name?: string;
      field?: { name?: string };
    }>;
  };
}

interface ProjectItemsResponse {
  user: {
    projectV2: {
      items: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ProjectItemNode[];
      };
    };
  };
}

function getStatusFromNode(node: ProjectItemNode): string | null {
  for (const fv of node.fieldValues.nodes) {
    if (fv.field?.name === "Status" && fv.name) {
      return fv.name;
    }
  }
  return null;
}

export async function fetchAllProjectItems(token: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let page = 0;

  // Sanity guard against runaway pagination — trust hasNextPage as the
  // real stop condition. Projects V2 returns items oldest-first, so any
  // numeric cap silently drops the most recently added issues (we hit
  // this twice: cap 30 with 3000 items, cap 60 with 6000+ items, every
  // time freshly-created audit/QA milestones disappeared from modals
  // while the count headers stayed correct via REPO_INFO_QUERY).
  const MAX_PAGES = 500;
  while (hasNext && page < MAX_PAGES) {
    const data: ProjectItemsResponse = await graphql<ProjectItemsResponse>(token, PROJECT_ITEMS_QUERY, {
      owner: GITHUB_OWNER,
      number: GITHUB_PROJECT_NUMBER,
      cursor,
    });

    const items: ProjectItemsResponse["user"]["projectV2"]["items"] = data.user.projectV2.items;
    page++;
    let skipped = 0;
    const skippedTypes: Record<string, number> = {};
    for (const node of items.nodes) {
      if (!node.content?.title) {
        skipped++;
        const t = node.type ?? "unknown";
        skippedTypes[t] = (skippedTypes[t] ?? 0) + 1;
        continue;
      }

      const labels: string[] = node.content.labels?.nodes.map((l: { name: string }) => l.name) ?? [];
      const statusField = getStatusFromNode(node);
      // If GitHub issue state is CLOSED, force Done regardless of project board status
      const issueState = node.content.state;
      const status = issueState === "CLOSED" ? "Done" as IssueStatus : parseStatus(statusField);

      // DraftIssue has no repository — use "draft" as repo name
      const repo = node.content.repository?.name ?? "draft";

      issues.push({
        id: node.id,
        number: node.content.number ?? null,
        title: node.content.title,
        url: node.content.url ?? "",
        status,
        priority: parsePriority(labels),
        complexity: parseComplexity(labels),
        labels,
        repo,
        milestoneTitle: node.content.milestone?.title ?? null,
        isBlocked: labels.some((l: string) => l.toLowerCase() === "blocked"),
        createdAt: node.content.createdAt ?? "",
        updatedAt: node.content.updatedAt ?? "",
        closedAt: node.content.closedAt ?? null,
      });
    }

    if (skipped > 0) {
      console.log(`[Dashboard] Page ${page}: ${items.nodes.length} received, ${skipped} skipped (no content)`, skippedTypes);
    } else {
      console.log(`[Dashboard] Page ${page}: ${items.nodes.length} received, all have content`);
    }

    hasNext = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  if (hasNext) {
    console.warn(`[Dashboard] Pagination limit hit: showed ${page * 100} items but more remain. Bump MAX_PAGES.`);
  }

  console.log(`[Dashboard] Total fetched: ${issues.length}`);

  // Show breakdown by repo
  const byRepo: Record<string, number> = {};
  for (const i of issues) {
    byRepo[i.repo] = (byRepo[i.repo] ?? 0) + 1;
  }
  console.log(`[Dashboard] By repo:`, byRepo);

  return issues;
}

// Milestone caps match the cache backend (server/src/github.ts uses 100/50) so
// the portfolio milestone count is path-independent — whether the dashboard
// reads from the cache backend or hits GitHub directly, the per-repo arrays
// (and thus their `.length`) line up. Not paginated: the caps are high enough
// for every MakeIT repo's milestone set in practice.
export const REPO_INFO_QUERY = `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    defaultBranchRef {
      target {
        ... on Commit {
          committedDate
        }
      }
    }
    description
    openMilestones: milestones(first: 100, states: OPEN, orderBy: {field: DUE_DATE, direction: ASC}) {
      nodes {
        title
        description
        dueOn
        url
        state
        createdAt
        closedAt
        closedIssues: issues(states: CLOSED) { totalCount }
        openIssues: issues(states: OPEN) { totalCount }
      }
    }
    closedMilestones: milestones(first: 50, states: CLOSED, orderBy: {field: DUE_DATE, direction: DESC}) {
      nodes {
        title
        description
        dueOn
        url
        state
        createdAt
        closedAt
        closedIssues: issues(states: CLOSED) { totalCount }
        openIssues: issues(states: OPEN) { totalCount }
      }
    }
  }
}
`;

interface MilestoneNode {
  title: string;
  description: string | null;
  dueOn: string | null;
  url: string;
  state: "OPEN" | "CLOSED";
  createdAt: string | null;
  closedAt: string | null;
  closedIssues: { totalCount: number };
  openIssues: { totalCount: number };
}

interface RepoInfoResponse {
  repository: {
    defaultBranchRef: {
      target: { committedDate: string };
    } | null;
    description: string | null;
    openMilestones: { nodes: MilestoneNode[] };
    closedMilestones: { nodes: MilestoneNode[] };
  };
}

interface RepoInfo {
  lastCommitDate: string | null;
  description: string;
  milestones: Milestone[];
  commitActivity: CommitActivity;
  /** True when REPO_INFO_QUERY failed (auth/network) and the milestones /
   * description below are placeholder empties, NOT a genuine empty repo. Lets
   * downstream distinguish "fetch failed" from "really nothing here". */
  fetchError: boolean;
}

async function fetchRepoInfo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  const [graphqlResult, commitActivity] = await Promise.all([
    graphql<RepoInfoResponse>(token, REPO_INFO_QUERY, { owner, repo }).catch(() => null),
    fetchCommitActivity(token, owner, repo),
  ]);

  if (!graphqlResult) {
    // Transient failure: surface a flag instead of silently masquerading as a
    // real "0 issues / no milestones" repo (which would render a healthy-but-
    // empty card). The zeros below are placeholders; `fetchError` marks them.
    console.warn(`[Dashboard] REPO_INFO_QUERY failed for ${owner}/${repo} — rendering placeholder zeros (fetchError)`);
    return { lastCommitDate: null, description: "", milestones: [], commitActivity, fetchError: true };
  }

  const allMs = [
    ...graphqlResult.repository.openMilestones.nodes,
    ...graphqlResult.repository.closedMilestones.nodes,
  ];
  return {
    lastCommitDate: graphqlResult.repository.defaultBranchRef?.target.committedDate ?? null,
    description: graphqlResult.repository.description ?? "",
    milestones: allMs.map((m) => ({
      title: m.title,
      description: m.description ?? "",
      dueOn: m.dueOn,
      url: m.url,
      state: m.state,
      createdAt: m.createdAt,
      closedAt: m.closedAt,
      openIssues: m.openIssues.totalCount,
      closedIssues: m.closedIssues.totalCount,
      repo,
      // Issue list is hydrated client-side in fetchDashboardData by grouping
      // PROJECT_ITEMS_QUERY results — keeps REPO_INFO_QUERY cheap.
      issues: [],
    })),
    commitActivity,
    fetchError: false,
  };
}

const CACHE_KEY = "makeit_dashboard_cache";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  data: ProjectData[];
  // Wall-clock time the entry was written (used for TTL expiration only).
  timestamp: number;
  // ISO timestamp of the upstream sync that produced `data` — preserved
  // separately so the UI can show "когда реально синхронизировались с GitHub",
  // not the moment we happened to read the cache. Optional for back-compat
  // with entries written by older builds.
  lastSyncIso?: string;
}

export interface DashboardFetchResult {
  projects: ProjectData[];
  /** When the upstream data was last synced with GitHub (cache backend's
   * `lastSync`). Null when we hit GitHub directly — in that case the caller
   * should treat "now" as the sync time. */
  lastSync: Date | null;
}

function readLocalCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (
      !entry ||
      !Array.isArray(entry.data) ||
      typeof entry.timestamp !== "number"
    ) return null;
    if (entry.data.length > 0) {
      const first = entry.data[0] as Partial<ProjectData> | null;
      if (!first || typeof first !== "object" || !("repo" in first)) return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeLocalCache(data: ProjectData[], lastSync: Date | null = null): void {
  try {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      lastSyncIso: lastSync ? lastSync.toISOString() : undefined,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* ignore quota errors */ }
}

function localCacheToResult(entry: CacheEntry): DashboardFetchResult {
  const lastSync = entry.lastSyncIso ? new Date(entry.lastSyncIso) : null;
  return {
    projects: entry.data,
    lastSync: lastSync && !Number.isNaN(lastSync.getTime()) ? lastSync : null,
  };
}

// ── Backend-first fetch with fallback to direct GitHub API ──

function mergeFinancialData(projects: ProjectData[]): ProjectData[] {
  const finances = loadFinances();
  return projects.map((p) => {
    const f = finances[p.repo];
    const d = DEFAULT_PROJECTS.find((dp) => dp.repo === p.repo);
    const budget = f?.budget ?? d?.budget ?? 0;
    const paid = f?.paid ?? d?.paid ?? 0;
    return { ...p, budget, paid, remaining: budget - paid };
  });
}

async function fetchFromCache(forceRefresh: boolean): Promise<{ projects: ProjectData[]; lastSync: Date | null } | null> {
  const cacheUrl = getCacheUrl();
  console.log(`[Dashboard] Cache URL: "${cacheUrl}", forceRefresh: ${forceRefresh}`);
  if (!cacheUrl) return null;

  try {
    // Force refresh: trigger blocking sync (waits for completion on server)
    if (forceRefresh) {
      const syncRes = await fetch(`${cacheUrl}/api/sync`, {
        method: "POST",
        signal: AbortSignal.timeout(120000), // 2 min timeout for full sync
      }).catch(() => null);
      if (syncRes && syncRes.ok) {
        // Sync completed, fetch fresh data
      }
    }

    const res = await fetch(`${cacheUrl}/api/projects`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) return null;

    console.log(`[Dashboard] Using cache backend (synced: ${json.lastSync}, ${Math.round(json.syncDuration / 1000)}s)`);
    const lastSync = typeof json.lastSync === "string" ? new Date(json.lastSync) : null;
    return {
      projects: mergeFinancialData(json.data),
      lastSync: lastSync && !Number.isNaN(lastSync.getTime()) ? lastSync : null,
    };
  } catch {
    console.log("[Dashboard] Cache backend unavailable, falling back to direct API");
    return null;
  }
}

export async function fetchDashboardData(
  token: string,
  forceRefresh = false,
  onFreshData?: (result: DashboardFetchResult) => void
): Promise<DashboardFetchResult> {
  // 1. Stale-while-revalidate: if not a manual refresh and local cache is fresh,
  //    return it instantly and refresh in the background via onFreshData.
  if (!forceRefresh) {
    const local = readLocalCache();
    if (local && Date.now() - local.timestamp < CACHE_TTL) {
      console.log("[Dashboard] SWR: serving local cache, refreshing in background");
      if (onFreshData) {
        void (async () => {
          try {
            const fresh = await fetchFromCache(false);
            // Skip empty payloads — they'd clobber good local data with [].
            // Wait for the next refresh cycle when the backend has results.
            if (fresh && fresh.projects.length > 0) {
              writeLocalCache(fresh.projects, fresh.lastSync);
              onFreshData({ projects: fresh.projects, lastSync: fresh.lastSync });
            }
          } catch { /* background refresh failed — keep stale data */ }
        })();
      }
      return localCacheToResult(local);
    }
  }

  // 2. No fresh local cache — fetch from cache backend
  const cached = await fetchFromCache(forceRefresh);
  if (cached && cached.projects.length > 0) {
    writeLocalCache(cached.projects, cached.lastSync);
    return { projects: cached.projects, lastSync: cached.lastSync };
  }

  // 3. Fallback: stale local cache. Triggered when the backend either
  //    failed (cached === null) OR returned an empty payload (e.g. cache
  //    container was just recreated and hasn't synced yet). Showing the
  //    last known dashboard beats showing nothing — the next refresh
  //    will reconcile once the backend has data.
  const stale = readLocalCache();
  if (stale && stale.data.length > 0) {
    console.log("[Dashboard] Backend empty/unreachable, using stale local cache");
    return localCacheToResult(stale);
  }

  // 3b. Backend returned a valid-but-empty payload AND we have nothing
  //     local to fall back on. Surface the empty result honestly so the
  //     UI can render its empty state.
  if (cached) {
    return { projects: cached.projects, lastSync: cached.lastSync };
  }

  // 4. Fallback: direct GitHub API (original logic)
  console.log("[Dashboard] Fetching directly from GitHub API");
  const allIssues = await fetchAllProjectItems(token);

  const projectDataPromises = getProjects().map(async (project) => {
    const repoIssues = allIssues.filter((i) => i.repo === project.repo);
    const repoInfo = await fetchRepoInfo(token, project.owner, project.repo);

    // Hydrate milestone.issues from PROJECT_ITEMS_QUERY data instead of pulling
    // them inside REPO_INFO_QUERY (which previously cost ~10× more per repo).
    const issuesByMilestone = new Map<string, Issue[]>();
    for (const i of repoIssues) {
      if (!i.milestoneTitle) continue;
      const arr = issuesByMilestone.get(i.milestoneTitle);
      if (arr) arr.push(i); else issuesByMilestone.set(i.milestoneTitle, [i]);
    }
    const hydratedMilestones = repoInfo.milestones.map((m) => ({
      ...m,
      // Sort by createdAt ASC to match the previous REPO_INFO_QUERY ordering
      // (orderBy: {field: CREATED_AT, direction: ASC}) so consumers that
      // depended on insertion order keep behaving the same.
      issues: (issuesByMilestone.get(m.title) ?? [])
        .filter((i) => i.number !== null)
        .slice()
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
        .map((i) => ({
          number: i.number as number,
          title: i.title,
          state: (i.closedAt ? "CLOSED" : "OPEN") as "OPEN" | "CLOSED",
          labels: i.labels,
          url: i.url,
          createdAt: i.createdAt,
          closedAt: i.closedAt,
        })),
    }));

    const priorityCounts: Record<Priority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const issue of repoIssues) {
      if (issue.priority && issue.status !== "Done") priorityCounts[issue.priority]++;
    }

    // #519: board (Project #1) is the single source of truth for these counts.
    // Derived from repoIssues so they reconcile with priorityCounts/velocity/
    // etaDays/bugRatio (which all iterate the same board subset). The repo-wide
    // issue counts REPO_INFO_QUERY used to return were dropped — repoInfo now
    // supplies only milestones / commitActivity / description.
    const { openCount, doneCount, totalCount } = boardIssueCounts(repoIssues);
    const progress = computeProgress(doneCount, totalCount);

    const dates = [
      repoInfo.lastCommitDate,
      ...repoIssues.map((i) => i.updatedAt),
    ].filter(Boolean) as string[];
    const lastActivityDate = dates.length > 0
      ? dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;
    const daysSinceActivity = lastActivityDate
      ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / 86400000)
      : null;

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
    const bestVelocity = Math.max(velocity7d, velocity14d, 0.001);
    const rawEtaDays = openCount > 0 ? Math.ceil(openCount / bestVelocity * 1.25) : null;
    const etaDays = rawEtaDays !== null ? Math.min(rawEtaDays, 365) : null;
    const etaDate = etaDays !== null
      ? new Date(now + etaDays * 86400000).toISOString()
      : null;

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
      milestones: hydratedMilestones,
      budget: project.budget,
      paid: project.paid,
      remaining: project.budget - project.paid,
      daysSinceActivity,
      lastActivityDate,
      velocity7d,
      velocity14d,
      etaDays,
      etaDate,
      cycleTimeDays,
      commitActivity: repoInfo.commitActivity,
      // G3: true when REPO_INFO_QUERY failed; the counts above are placeholder
      // zeros, not a genuinely empty repo. Consumers can distinguish the two.
      fetchError: repoInfo.fetchError,
    };
  });

  const result = await Promise.all(projectDataPromises);

  // Direct GitHub fetch happens "now", so sync time and write time match.
  const now = new Date();
  writeLocalCache(result, now);
  return { projects: result, lastSync: now };
}

// ── Open Pull Requests (Epic-011 Task-07: ActivityTab) ─────────────────────
//
// The Activity tab lists a project's currently-open PRs. This is a focused,
// single-repo GraphQL query (≤ 20 newest open PRs) — distinct from the bulk
// Projects-V2 sync above and from the REST `/events` feed the Pulse
// aggregator uses (events surface *activity*, this surfaces *open state*).

const OPEN_PRS_QUERY = `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: 20, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        url
        isDraft
        updatedAt
        author { login }
      }
    }
  }
}
`;

interface OpenPrsResponse {
  repository: {
    pullRequests: {
      nodes: Array<{
        number: number;
        title: string;
        url: string;
        isDraft: boolean;
        updatedAt: string;
        author: { login: string } | null;
      }>;
    };
  } | null;
}

/** One open PR as surfaced on the Activity tab. */
export interface OpenPullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string; // ISO
  /** Login of the PR author, or `null` for a deleted/ghost account. */
  author: string | null;
}

/**
 * Open PRs for one repo, newest-updated first (≤ 20). Accepts either a
 * bare `repo-name` (resolved against the dashboard `GITHUB_OWNER`) or a
 * fully-qualified `owner/name` slug, matching the convention used by the
 * other Hub utils (github-contents, activityPulseAggregator).
 *
 * Best-effort: with no token, or on any GraphQL/network failure, resolves
 * to `[]` so the caller renders an empty state rather than crashing the
 * tab (PRD-008 §"Каскадирование ошибок").
 */
export async function fetchOpenPullRequests(
  repo: string,
): Promise<OpenPullRequest[]> {
  const token = getToken();
  if (!token) return [];

  const [owner, name] = repo.includes("/")
    ? (repo.split("/") as [string, string])
    : [GITHUB_OWNER, repo];

  try {
    const data = await graphql<OpenPrsResponse>(token, OPEN_PRS_QUERY, {
      owner,
      repo: name,
    });
    const nodes = data.repository?.pullRequests.nodes ?? [];
    return nodes.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
      author: pr.author?.login ?? null,
    }));
  } catch {
    // Auth-lost is already dispatched inside `graphql()`; here we degrade
    // to an empty list so the Activity tab shows its empty state.
    return [];
  }
}
