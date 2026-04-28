import type { Issue, IssueStatus, Priority, Phase, ProjectData, Milestone, CommitActivity } from "../types";
import { getProjects, GITHUB_OWNER, GITHUB_PROJECT_NUMBER, DEFAULT_PROJECTS, loadFinances } from "./config";

function getCacheUrl(): string {
  return (window as unknown as { __MAKEIT_CONFIG__?: { CACHE_URL?: string } }).__MAKEIT_CONFIG__?.CACHE_URL ?? "";
}

const GITHUB_REST = "https://api.github.com";

async function restGet<T>(token: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GITHUB_REST}${path}`, {
      headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// GitHub Stats API — 1 request per repo, no pagination, covers up to 52 weeks
// Returns 202 while stats are being computed → retry up to 3 times
interface CommitWeekStat {
  days: number[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  total: number;
  week: number;   // Unix timestamp (seconds) of the Sunday that starts this week (UTC)
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
    // Convert weekly stats to byDate map
    // week.week = Unix seconds for the Sunday that starts this week (UTC 00:00)
    // days[0]=Sun … days[6]=Sat
    const byDate: Record<string, number> = {};
    for (const week of weeks) {
      for (let d = 0; d < 7; d++) {
        const count = week.days[d];
        if (count === 0) continue;
        const date = new Date((week.week + d * 86400) * 1000).toISOString().split("T")[0];
        byDate[date] = count;
      }
    }
    return buildActivity(byDate);
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
      const date = dateStr.split("T")[0];
      if (date) byDate[date] = (byDate[date] ?? 0) + 1;
    }
    if (commits.length < 100) break;
  }
  return buildActivity(byDate);
}

function buildActivity(byDate: Record<string, number>): CommitActivity {
  const now = Date.now();
  const todayStr = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(now - 7 * 86400000).toISOString().split("T")[0];
  const monthAgo = new Date(now - 30 * 86400000).toISOString().split("T")[0];
  const period84dAgo = new Date(now - 84 * 86400000).toISOString().split("T")[0];
  return {
    byDate,
    today: byDate[todayStr] ?? 0,
    thisWeek: Object.entries(byDate).filter(([d]) => d >= weekAgo).reduce((s, [, v]) => s + v, 0),
    thisMonth: Object.entries(byDate).filter(([d]) => d >= monthAgo).reduce((s, [, v]) => s + v, 0),
    total84d: Object.entries(byDate).filter(([d]) => d >= period84dAgo).reduce((s, [, v]) => s + v, 0),
  };
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
              title
              url
              createdAt
              updatedAt
              closedAt
              state
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
    title?: string;
    url?: string;
    createdAt?: string;
    updatedAt?: string;
    closedAt?: string | null;
    state?: string;
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

  // Hard ceiling guards against infinite paging on a runaway tracker.
  // GitHub Projects V2 returns items in insertion order (oldest first),
  // so when this cap was 30 and the tracker held >3000 items, the most
  // recently added issues — including freshly pipeline-closed ones —
  // were silently dropped. Bumped well above the current 3441 with
  // headroom; add a single warning if we ever truly exhaust it.
  const MAX_PAGES = 60; // 60 × 100 = 6000 items
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
        title: node.content.title,
        url: node.content.url ?? "",
        status,
        priority: parsePriority(labels),
        labels,
        repo,
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

const REPO_INFO_QUERY = `
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
    openIssueCount: issues(states: OPEN) { totalCount }
    closedIssueCount: issues(states: CLOSED) { totalCount }
    openMilestones: milestones(first: 20, states: OPEN, orderBy: {field: DUE_DATE, direction: ASC}) {
      nodes {
        title
        description
        dueOn
        url
        state
        closedIssues: issues(states: CLOSED) { totalCount }
        openIssues: issues(states: OPEN) { totalCount }
        allIssues: issues(first: 50, orderBy: {field: CREATED_AT, direction: ASC}) {
          nodes {
            number
            title
            state
            url
            labels(first: 10) { nodes { name } }
          }
        }
      }
    }
    closedMilestones: milestones(first: 10, states: CLOSED, orderBy: {field: DUE_DATE, direction: DESC}) {
      nodes {
        title
        description
        dueOn
        url
        state
        closedIssues: issues(states: CLOSED) { totalCount }
        openIssues: issues(states: OPEN) { totalCount }
        allIssues: issues(first: 50, orderBy: {field: CREATED_AT, direction: ASC}) {
          nodes {
            number
            title
            state
            url
            labels(first: 10) { nodes { name } }
          }
        }
      }
    }
  }
}
`;

interface MilestoneIssueNode {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  url: string;
  labels: { nodes: { name: string }[] };
}

interface MilestoneNode {
  title: string;
  description: string | null;
  dueOn: string | null;
  url: string;
  state: "OPEN" | "CLOSED";
  closedIssues: { totalCount: number };
  openIssues: { totalCount: number };
  allIssues: { nodes: MilestoneIssueNode[] };
}

interface RepoInfoResponse {
  repository: {
    defaultBranchRef: {
      target: { committedDate: string };
    } | null;
    description: string | null;
    openIssueCount: { totalCount: number };
    closedIssueCount: { totalCount: number };
    openMilestones: { nodes: MilestoneNode[] };
    closedMilestones: { nodes: MilestoneNode[] };
  };
}

interface RepoInfo {
  lastCommitDate: string | null;
  description: string;
  milestones: Milestone[];
  commitActivity: CommitActivity;
  openIssueCount: number;
  closedIssueCount: number;
}

async function fetchRepoInfo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  const [graphqlResult, commitActivity] = await Promise.all([
    graphql<RepoInfoResponse>(token, REPO_INFO_QUERY, { owner, repo }).catch(() => null),
    fetchCommitActivity(token, owner, repo),
  ]);

  if (!graphqlResult) {
    return { lastCommitDate: null, description: "", milestones: [], commitActivity, openIssueCount: 0, closedIssueCount: 0 };
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
      openIssues: m.openIssues.totalCount,
      closedIssues: m.closedIssues.totalCount,
      repo,
      issues: m.allIssues.nodes.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        labels: i.labels.nodes.map((l) => l.name),
        url: i.url,
      })),
    })),
    commitActivity,
    openIssueCount: graphqlResult.repository.openIssueCount.totalCount,
    closedIssueCount: graphqlResult.repository.closedIssueCount.totalCount,
  };
}

const CACHE_KEY = "makeit_dashboard_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: ProjectData[];
  timestamp: number;
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

async function fetchFromCache(forceRefresh: boolean): Promise<ProjectData[] | null> {
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
    return mergeFinancialData(json.data);
  } catch {
    console.log("[Dashboard] Cache backend unavailable, falling back to direct API");
    return null;
  }
}

export async function fetchDashboardData(token: string, forceRefresh = false): Promise<ProjectData[]> {
  // 1. Try cache backend first
  const cached = await fetchFromCache(forceRefresh);
  if (cached) {
    // Save to session storage for offline/fast reload
    try {
      const entry: CacheEntry = { data: cached, timestamp: Date.now() };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch { /* ignore quota errors */ }
    return cached;
  }

  // 2. Fallback: check session storage cache
  if (!forceRefresh) {
    try {
      const sessionCached = sessionStorage.getItem(CACHE_KEY);
      if (sessionCached) {
        const entry: CacheEntry = JSON.parse(sessionCached);
        if (Date.now() - entry.timestamp < CACHE_TTL) {
          console.log("[Dashboard] Using session cached data");
          return entry.data;
        }
      }
    } catch { /* ignore cache errors */ }
  }

  // 3. Fallback: direct GitHub API (original logic)
  console.log("[Dashboard] Fetching directly from GitHub API");
  const allIssues = await fetchAllProjectItems(token);

  const projectDataPromises = getProjects().map(async (project) => {
    const repoIssues = allIssues.filter((i) => i.repo === project.repo);
    const repoInfo = await fetchRepoInfo(token, project.owner, project.repo);

    const priorityCounts: Record<Priority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const issue of repoIssues) {
      if (issue.priority && issue.status !== "Done") priorityCounts[issue.priority]++;
    }

    const openCount = repoInfo.openIssueCount;
    const doneCount = repoInfo.closedIssueCount;
    const totalCount = openCount + doneCount;
    const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

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
      milestones: repoInfo.milestones,
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
    };
  });

  const result = await Promise.all(projectDataPromises);

  // Save to cache
  try {
    const entry: CacheEntry = { data: result, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* ignore quota errors */ }

  return result;
}
