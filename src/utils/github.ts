import type { Issue, IssueStatus, Priority, Phase, ProjectData } from "../types";
import { PROJECTS, GITHUB_OWNER, GITHUB_PROJECT_NUMBER } from "./config";

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
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content {
            ... on Issue {
              title
              url
              createdAt
              updatedAt
              state
              labels(first: 20) {
                nodes { name }
              }
              repository { name }
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
  content: {
    title?: string;
    url?: string;
    createdAt?: string;
    updatedAt?: string;
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

  while (hasNext) {
    const data: ProjectItemsResponse = await graphql<ProjectItemsResponse>(token, PROJECT_ITEMS_QUERY, {
      owner: GITHUB_OWNER,
      number: GITHUB_PROJECT_NUMBER,
      cursor,
    });

    const items: ProjectItemsResponse["user"]["projectV2"]["items"] = data.user.projectV2.items;

    for (const node of items.nodes) {
      if (!node.content?.title) continue;

      const labels: string[] = node.content.labels?.nodes.map((l: { name: string }) => l.name) ?? [];
      const statusField = getStatusFromNode(node);
      const status = parseStatus(statusField);

      issues.push({
        id: node.id,
        title: node.content.title,
        url: node.content.url ?? "",
        status,
        priority: parsePriority(labels),
        labels,
        repo: node.content.repository?.name ?? "unknown",
        isBlocked: labels.some((l: string) => l.toLowerCase() === "blocked"),
        createdAt: node.content.createdAt ?? "",
        updatedAt: node.content.updatedAt ?? "",
      });
    }

    hasNext = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  return issues;
}

const LAST_COMMIT_QUERY = `
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
  }
}
`;

interface RepoInfoResponse {
  repository: {
    defaultBranchRef: {
      target: { committedDate: string };
    } | null;
    description: string | null;
  };
}

async function fetchRepoInfo(token: string, owner: string, repo: string) {
  try {
    const data = await graphql<RepoInfoResponse>(token, LAST_COMMIT_QUERY, { owner, repo });
    return {
      lastCommitDate: data.repository.defaultBranchRef?.target.committedDate ?? null,
      description: data.repository.description ?? "",
    };
  } catch {
    return { lastCommitDate: null, description: "" };
  }
}

export async function fetchDashboardData(token: string): Promise<ProjectData[]> {
  const allIssues = await fetchAllProjectItems(token);

  const projectDataPromises = PROJECTS.map(async (project) => {
    const repoIssues = allIssues.filter((i) => i.repo === project.repo);
    const repoInfo = await fetchRepoInfo(token, project.owner, project.repo);

    const priorityCounts: Record<Priority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const issue of repoIssues) {
      if (issue.priority) priorityCounts[issue.priority]++;
    }

    const doneCount = repoIssues.filter((i) => i.status === "Done").length;
    const totalCount = repoIssues.length;
    const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    return {
      repo: project.repo,
      client: project.client,
      phase: determinePhase(repoIssues),
      issues: repoIssues,
      priorityCounts,
      progress,
      lastCommitDate: repoInfo.lastCommitDate,
      description: repoInfo.description,
      openCount: totalCount - doneCount,
      doneCount,
      totalCount,
    };
  });

  return Promise.all(projectDataPromises);
}
