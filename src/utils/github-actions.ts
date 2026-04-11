const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_REST = "https://api.github.com";

async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый.");
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}

async function rest(token: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${GITHUB_REST}${path}`, {
    method,
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Read docs from repo ──

export async function listRepoFiles(
  token: string,
  owner: string,
  repo: string,
  path = ""
): Promise<{ name: string; type: string; path: string }[]> {
  const data = await rest(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (!Array.isArray(data)) return [];
  return data.map((f: { name: string; type: string; path: string }) => ({
    name: f.name,
    type: f.type,
    path: f.path,
  }));
}

export async function readRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  const data = await rest(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (data.encoding === "base64" && data.content) {
    const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  throw new Error(`Cannot read file: ${path}`);
}

// ── Code Search ──

export interface CodeSearchHit {
  path: string;
  fragment: string;
}

export class CodeSearchUnavailableError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CodeSearchUnavailableError";
    this.status = status;
  }
}

export class CodeSearchRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeSearchRateLimitError";
  }
}

/**
 * Search for a Python symbol (class/function name) inside a repo using GitHub
 * Code Search. Returns up to `perPage` hits with the first text-match fragment
 * each. Uses the `symbol:` qualifier first, falling back to a bare-term query
 * if that produces nothing.
 *
 * Throws CodeSearchRateLimitError (429) or CodeSearchUnavailableError (403
 * with rate-limit body, 422 for not-indexed repos) so callers can fall back.
 */
export async function searchCodeSymbol(
  token: string,
  owner: string,
  repo: string,
  symbol: string,
  perPage = 10
): Promise<CodeSearchHit[]> {
  const run = async (q: string): Promise<CodeSearchHit[] | null> => {
    const url = `${GITHUB_REST}/search/code?q=${encodeURIComponent(q)}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `bearer ${token}`,
        Accept: "application/vnd.github.text-match+json",
      },
    });
    if (res.status === 401) {
      throw new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый.");
    }
    if (res.status === 429) {
      throw new CodeSearchRateLimitError("GitHub code search rate limited");
    }
    if (res.status === 403) {
      const body = await res.text();
      if (/rate limit/i.test(body)) {
        throw new CodeSearchRateLimitError("GitHub code search rate limited");
      }
      throw new CodeSearchUnavailableError(`GitHub code search forbidden: ${body}`, 403);
    }
    if (res.status === 422) {
      // Repo not indexed by code search.
      throw new CodeSearchUnavailableError("Repository not indexed by GitHub code search", 422);
    }
    if (!res.ok) {
      throw new Error(`GitHub code search error: ${res.status}`);
    }
    const json = (await res.json()) as {
      items?: Array<{
        path: string;
        text_matches?: Array<{ fragment: string }>;
      }>;
    };
    if (!json.items || json.items.length === 0) return null;
    return json.items.map((item) => ({
      path: item.path,
      fragment: item.text_matches?.[0]?.fragment ?? "",
    }));
  };

  const qualified = `symbol:${symbol} repo:${owner}/${repo} language:python`;
  const fallback = `${symbol} repo:${owner}/${repo} language:python`;
  const first = await run(qualified);
  if (first) return first;
  const second = await run(fallback);
  return second ?? [];
}

// ── Issue management ──

export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[] = [],
  milestone?: number
): Promise<{ number: number; url: string }> {
  const data = await rest(token, `/repos/${owner}/${repo}/issues`, "POST", {
    title,
    body,
    labels,
    milestone,
  });
  return { number: data.number, url: data.html_url };
}

export async function closeIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  await rest(token, `/repos/${owner}/${repo}/issues/${issueNumber}`, "PATCH", {
    state: "closed",
  });
}

export async function addLabels(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<{ added: string[]; created: string[] }> {
  const created: string[] = [];

  for (const label of labels) {
    // Check if label exists, create if not
    try {
      await rest(token, `/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`);
    } catch {
      // Label doesn't exist — create it
      const colors: Record<string, string> = {
        "p1-critical": "B60205", "p2-high": "D93F0B", "p3-medium": "E4E669",
        "bug": "D73A4A", "feature": "0075CA", "security": "B60205",
        "tech-debt": "FBCA04", "code-review": "5319E7", "blocked": "D93F0B",
      };
      await rest(token, `/repos/${owner}/${repo}/labels`, "POST", {
        name: label,
        color: colors[label.toLowerCase()] ?? "EDEDED",
      });
      created.push(label);
    }
  }

  // Now add all labels to issue
  await rest(token, `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, "POST", {
    labels,
  });

  return { added: [...labels], created };
}

export async function addComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await rest(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, "POST", {
    body,
  });
}

export async function listMilestones(
  token: string,
  owner: string,
  repo: string
): Promise<{ number: number; title: string; state: string; due_on: string | null; open_issues: number; closed_issues: number }[]> {
  const data = await rest(token, `/repos/${owner}/${repo}/milestones?state=all&per_page=100`);
  return data.map((m: { number: number; title: string; state: string; due_on: string | null; open_issues: number; closed_issues: number }) => ({
    number: m.number,
    title: m.title,
    state: m.state,
    due_on: m.due_on,
    open_issues: m.open_issues,
    closed_issues: m.closed_issues,
  }));
}

export async function createMilestone(
  token: string,
  owner: string,
  repo: string,
  title: string,
  description: string,
  dueOn?: string // ISO date like "2026-04-15T00:00:00Z"
): Promise<{ number: number; title: string; url: string }> {
  const body: Record<string, string> = { title, description };
  if (dueOn) body.due_on = dueOn;
  const data = await rest(token, `/repos/${owner}/${repo}/milestones`, "POST", body);
  return { number: data.number, title: data.title, url: data.html_url };
}

export async function updateMilestone(
  token: string,
  owner: string,
  repo: string,
  milestoneNumber: number,
  updates: { title?: string; description?: string; due_on?: string; state?: "open" | "closed" }
): Promise<void> {
  await rest(token, `/repos/${owner}/${repo}/milestones/${milestoneNumber}`, "PATCH", updates);
}

export async function setIssueMilestone(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  milestoneNumber: number | null
): Promise<void> {
  await rest(token, `/repos/${owner}/${repo}/issues/${issueNumber}`, "PATCH", {
    milestone: milestoneNumber,
  });
}

interface RepoIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  milestone: string | null;
  closed_at: string | null;
  created_at: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  milestone: { title: string } | null;
  closed_at: string | null;
  created_at: string;
  pull_request?: unknown;
}

export async function listRepoIssues(
  token: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
): Promise<RepoIssue[]> {
  const allIssues: RepoIssue[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= 10) { // safety limit: max 1000 issues
    const data: RawIssue[] = await rest(
      token,
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}&sort=updated&direction=desc`
    );

    const issues = data
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        labels: i.labels.map((l) => l.name),
        milestone: i.milestone?.title ?? null,
        closed_at: i.closed_at,
        created_at: i.created_at,
      }));

    allIssues.push(...issues);

    if (data.length < perPage) break; // no more pages
    page++;
  }

  return allIssues;
}

// ── Add issue to GitHub Project ──

const ADD_TO_PROJECT_MUTATION = `
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}
`;

const GET_PROJECT_ID_QUERY = `
query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
    }
  }
}
`;

const GET_ISSUE_NODE_ID_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
    }
  }
}
`;

export async function addIssueToProject(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  projectNumber: number
): Promise<void> {
  const projectData = await graphql<{ user: { projectV2: { id: string } } }>(
    token, GET_PROJECT_ID_QUERY, { owner, number: projectNumber }
  );
  const issueData = await graphql<{ repository: { issue: { id: string } } }>(
    token, GET_ISSUE_NODE_ID_QUERY, { owner, repo, number: issueNumber }
  );
  await graphql(token, ADD_TO_PROJECT_MUTATION, {
    projectId: projectData.user.projectV2.id,
    contentId: issueData.repository.issue.id,
  });
}
