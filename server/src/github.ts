/**
 * GitHub API client — ported from ../src/utils/github.ts
 * All queries and data transformations preserved exactly.
 */

import type { Issue, IssueStatus, Priority, CommitActivity, Milestone, RepoInfo } from "./types";
import { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_PROJECT_NUMBER } from "./config";

const GITHUB_REST = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

// ── REST helper ──

async function restGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GITHUB_REST}${path}`, {
      headers: {
        Authorization: `bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Commit Activity ──
// Ported from github.ts lines 26-93

interface CommitWeekStat {
  days: number[];
  total: number;
  week: number;
}

export async function fetchCommitActivity(owner: string, repo: string): Promise<CommitActivity> {
  let weeks: CommitWeekStat[] | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await restGet<CommitWeekStat[]>(
      `/repos/${owner}/${repo}/stats/commit_activity`
    );
    if (Array.isArray(result) && result.length > 0) {
      weeks = result;
      break;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
  }

  if (weeks) {
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

  // Fallback: commits endpoint (up to 5 pages = 500 commits)
  const since = new Date(Date.now() - 84 * 86400000).toISOString();
  const byDate: Record<string, number> = {};
  for (let page = 1; page <= 5; page++) {
    const commits = await restGet<Array<{ commit: { committer?: { date?: string }; author?: { date?: string } } }>>(
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

// Ported from github.ts lines 80-93
export function buildActivity(byDate: Record<string, number>): CommitActivity {
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

// ── GraphQL helper ──
// Ported from github.ts lines 97-120

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("GitHub token expired or insufficient permissions");
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

// ── Parsing helpers ──
// Ported from github.ts lines 122-137

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

// ── Project Items Query ──
// Copied verbatim from github.ts lines 145-187

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

// Ported from github.ts lines 222-229
function getStatusFromNode(node: ProjectItemNode): string | null {
  for (const fv of node.fieldValues.nodes) {
    if (fv.field?.name === "Status" && fv.name) {
      return fv.name;
    }
  }
  return null;
}

// Ported from github.ts lines 231-301
export async function fetchAllProjectItems(): Promise<Issue[]> {
  const issues: Issue[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let page = 0;

  // Hard ceiling guards against runaway tracker pagination. Project V2
  // returns items in insertion order (oldest first). When the cap was
  // 20, the most recently added 1400+ items (including freshly
  // pipeline-closed ones from today) were silently dropped — the
  // dashboard then showed empty "Закрытые pipeline за неделю". Bumped
  // well above the current ~3444 items with headroom.
  const MAX_PAGES = 60;
  while (hasNext && page < MAX_PAGES) {
    const data: ProjectItemsResponse = await graphql<ProjectItemsResponse>(PROJECT_ITEMS_QUERY, {
      owner: GITHUB_OWNER,
      number: GITHUB_PROJECT_NUMBER,
      cursor,
    });

    const items: ProjectItemsResponse["user"]["projectV2"]["items"] = data.user.projectV2.items;
    page++;
    let skipped = 0;
    for (const node of items.nodes) {
      if (!node.content?.title) {
        skipped++;
        continue;
      }

      const labels: string[] = node.content.labels?.nodes.map((l: { name: string }) => l.name) ?? [];
      const statusField = getStatusFromNode(node);
      // If GitHub issue state is CLOSED, force Done regardless of board status
      const issueState = node.content.state;
      const status: IssueStatus = issueState === "CLOSED" ? "Done" : parseStatus(statusField);
      const repo = node.content.repository?.name ?? "draft";

      issues.push({
        id: node.id,
        title: node.content.title,
        url: node.content.url ?? "",
        status,
        priority: parsePriority(labels),
        labels,
        repo,
        isBlocked: labels.some((l) => l.toLowerCase() === "blocked"),
        createdAt: node.content.createdAt ?? "",
        updatedAt: node.content.updatedAt ?? "",
        closedAt: node.content.closedAt ?? null,
      });
    }

    if (skipped > 0) {
      console.log(`[Cache] Page ${page}: ${items.nodes.length} received, ${skipped} skipped`);
    } else {
      console.log(`[Cache] Page ${page}: ${items.nodes.length} items`);
    }

    hasNext = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  if (hasNext) {
    console.warn(`[Cache] Pagination limit hit: fetched ${issues.length} items but more remain. Bump MAX_PAGES.`);
  }

  console.log(`[Cache] Total fetched: ${issues.length} items`);
  return issues;
}

// ── Repo Info Query ──
// Copied verbatim from github.ts lines 303-358

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

// Ported from github.ts lines 401-439
export async function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const [graphqlResult, commitActivity] = await Promise.all([
    graphql<RepoInfoResponse>(REPO_INFO_QUERY, { owner, repo }).catch(() => null),
    fetchCommitActivity(owner, repo),
  ]);

  if (!graphqlResult) {
    return {
      lastCommitDate: null,
      description: "",
      milestones: [],
      commitActivity,
      openIssueCount: 0,
      closedIssueCount: 0,
    };
  }

  const allMs = [
    ...graphqlResult.repository.openMilestones.nodes,
    ...graphqlResult.repository.closedMilestones.nodes,
  ];

  return {
    lastCommitDate: graphqlResult.repository.defaultBranchRef?.target.committedDate ?? null,
    description: graphqlResult.repository.description ?? "",
    milestones: allMs.map((m): Milestone => ({
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
