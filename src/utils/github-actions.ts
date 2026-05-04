const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_REST = "https://api.github.com";

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый.");
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}

async function rest(token: string, path: string, method = "GET", body?: unknown, signal?: AbortSignal) {
  const res = await fetch(`${GITHUB_REST}${path}`, {
    method,
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый.");
  }
  if (!res.ok) {
    // Log the full body to console for diagnostics, but don't surface it
    // through the thrown Error — error messages bubble up to the chat
    // tool-call output and we don't want raw GitHub response payloads
    // (which can include private repo metadata) ending up there.
    if (import.meta.env.DEV) {
      const text = await res.text().catch(() => "");
      console.error(`[github-actions] HTTP ${res.status}:`, text);
    }
    throw new Error(`GitHub API ${res.status}`);
  }
  return res.json();
}

// ── Read docs from repo ──

export async function listRepoFiles(
  token: string,
  owner: string,
  repo: string,
  path = "",
  signal?: AbortSignal,
): Promise<{ name: string; type: string; path: string }[]> {
  const data = await rest(token, `/repos/${owner}/${repo}/contents/${path}`, "GET", undefined, signal);
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
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await rest(token, `/repos/${owner}/${repo}/contents/${path}`, "GET", undefined, signal);
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

// Look up an existing open issue with the exact title under the `tech-debt`
// label. Used by the health → issue flow to dedup before creating duplicates.
//
// Returns `null` only when no open `tech-debt` issue with this exact title is
// found within the scanned pages. `rest()` throws on auth/network/HTTP errors
// (4xx/5xx) — those bubble up so the caller can decide whether to retry or
// proceed without dedup.
//
// Title comparison is exact (case-sensitive). We paginate up to MAX_PAGES so
// repos with >100 open tech-debt issues still get correctly deduped instead of
// silently creating duplicates for issues pushed off page 1. Sorted by
// `updated` desc so freshly-touched dups land first and we can short-circuit.
export async function findOpenIssueByTitle(
  token: string,
  owner: string,
  repo: string,
  title: string,
): Promise<{ number: number; url: string } | null> {
  const PER_PAGE = 100;
  const MAX_PAGES = 5; // 500 issues max — enough for any realistic health surface area
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/issues?state=open&per_page=${PER_PAGE}&labels=tech-debt&sort=updated&direction=desc&page=${page}`,
    );
    if (!Array.isArray(data)) return null;
    for (const issue of data as Array<{
      number: number;
      title: string;
      html_url: string;
      pull_request?: unknown;
    }>) {
      if (issue.pull_request) continue;
      if (issue.title === title) {
        return { number: issue.number, url: issue.html_url };
      }
    }
    if (data.length < PER_PAGE) return null; // last page reached
  }
  return null;
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
  repo: string,
  signal?: AbortSignal,
): Promise<{ number: number; title: string; state: string; due_on: string | null; open_issues: number; closed_issues: number }[]> {
  const data = await rest(token, `/repos/${owner}/${repo}/milestones?state=all&per_page=100`, "GET", undefined, signal);
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

// ── Project Health helpers ─────────────────────────────────────────────
// REST endpoints used by the health-engine. Kept here so all GitHub access
// goes through one auth/error path.

export interface RepoMeta {
  created_at: string;
  pushed_at: string;
  default_branch: string;
  open_issues_count: number;
}

export async function getRepoMeta(token: string, owner: string, repo: string, signal?: AbortSignal): Promise<RepoMeta> {
  const data = await rest(token, `/repos/${owner}/${repo}`, "GET", undefined, signal);
  return {
    created_at: data.created_at,
    pushed_at: data.pushed_at,
    default_branch: data.default_branch,
    open_issues_count: data.open_issues_count,
  };
}

// Flat list of all blob paths in a repo tree (recursive). One REST call —
// preferred over multiple `listRepoFiles` recursions when a check needs the
// full file inventory (e.g. ai_claude_md_freshness verifying that every path
// mentioned in CLAUDE.md still exists).
//
// GitHub truncates trees with >100k entries; in that case `data.truncated` is
// true and the listing is partial. We surface the partial list anyway and let
// the caller decide whether the truncation matters — for our scale (≤ a few
// thousand files) it never trips. Only `blob` (file) entries are returned;
// `tree` (directory) entries are omitted because the typical caller wants
// "is this path a real file" semantics.
export async function getRepoTreeFlat(
  token: string,
  owner: string,
  repo: string,
  treeSha: string,
  signal?: AbortSignal,
): Promise<{ paths: string[]; truncated: boolean }> {
  const data = await rest(
    token,
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    "GET",
    undefined,
    signal,
  );
  if (!Array.isArray(data?.tree)) return { paths: [], truncated: false };
  const paths = (data.tree as Array<{ type: string; path: string }>)
    .filter((e) => e.type === "blob")
    .map((e) => e.path);
  return { paths, truncated: Boolean(data.truncated) };
}

/** Resolve `{commitSha, treeSha}` for a branch. Falls back to `default_branch` when omitted. */
export async function getRepoTreeSha(
  token: string,
  owner: string,
  repo: string,
  branch?: string,
): Promise<{ commitSha: string; treeSha: string }> {
  let ref = branch;
  if (!ref) {
    const meta = await getRepoMeta(token, owner, repo);
    ref = meta.default_branch || "main";
  }
  // Encode each path segment so branch names with reserved chars (e.g. `#`)
  // don't break the URL. Slash-separated branch names like `feat/x` keep their
  // slashes — GitHub's git/refs/heads endpoint accepts the suffix as a path.
  const refPath = ref.split("/").map(encodeURIComponent).join("/");
  const refData = await rest(token, `/repos/${owner}/${repo}/git/refs/heads/${refPath}`);
  const commitSha: string | undefined = refData?.object?.sha;
  if (!commitSha) throw new Error(`getRepoTreeSha: missing object.sha for ${owner}/${repo}@${ref}`);
  const commitData = await rest(token, `/repos/${owner}/${repo}/git/commits/${commitSha}`);
  const treeSha: string | undefined = commitData?.tree?.sha;
  if (!treeSha) throw new Error(`getRepoTreeSha: missing tree.sha for commit ${commitSha}`);
  return { commitSha, treeSha };
}

export async function listRepoLabels(token: string, owner: string, repo: string, signal?: AbortSignal): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = await rest(token, `/repos/${owner}/${repo}/labels?per_page=100&page=${page}`, "GET", undefined, signal);
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data.map((l: { name: string }) => l.name));
    if (data.length < 100) break;
  }
  return out;
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export async function listWorkflows(token: string, owner: string, repo: string, signal?: AbortSignal): Promise<Workflow[]> {
  try {
    const data = await rest(token, `/repos/${owner}/${repo}/actions/workflows?per_page=100`, "GET", undefined, signal);
    return Array.isArray(data.workflows) ? data.workflows : [];
  } catch (err) {
    // Re-throw AbortError so callers higher up the stack can distinguish a
    // cancelled scan from a transient API failure (which is what the broad
    // `catch → []` was designed for). DOMException with `name === "AbortError"`
    // is what fetch raises when its signal aborts.
    if (err instanceof Error && err.name === "AbortError") throw err;
    return [];
  }
}

export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
}

export async function getLatestWorkflowRun(
  token: string,
  owner: string,
  repo: string,
  workflowId: number,
  signal?: AbortSignal,
): Promise<WorkflowRun | null> {
  try {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=1`,
      "GET",
      undefined,
      signal,
    );
    const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    return runs[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return null;
  }
}

// Last commit that touched a path. Used by doc_freshness checks (when
// implemented) and to verify a file actually exists when we want commit
// metadata as well as content.
export async function getLatestCommitForPath(
  token: string,
  owner: string,
  repo: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ sha: string; date: string } | null> {
  try {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
      "GET",
      undefined,
      signal,
    );
    const commit = Array.isArray(data) ? data[0] : null;
    if (!commit) return null;
    return { sha: commit.sha, date: commit.commit.author?.date ?? commit.commit.committer?.date };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return null;
  }
}

// Count issues closed since `since` (ISO date). Excludes PRs.
export async function countClosedIssuesSince(
  token: string,
  owner: string,
  repo: string,
  since: string,
  signal?: AbortSignal,
): Promise<number> {
  let count = 0;
  for (let page = 1; page <= 10; page++) {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/issues?state=closed&since=${encodeURIComponent(since)}&per_page=100&page=${page}`,
      "GET",
      undefined,
      signal,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    for (const i of data as Array<{ pull_request?: unknown; closed_at: string | null }>) {
      if (i.pull_request) continue;
      if (i.closed_at && new Date(i.closed_at) >= new Date(since)) count++;
    }
    if (data.length < 100) break;
  }
  return count;
}

// Detail for a single commit — additions/deletions for each touched file.
// Used by doc_freshness to find the last "meaningful" edit (typo fixes do
// not reset the freshness clock).
export async function getCommitFiles(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  signal?: AbortSignal,
): Promise<Array<{ filename: string; additions: number; deletions: number }>> {
  try {
    const data = await rest(token, `/repos/${owner}/${repo}/commits/${sha}`, "GET", undefined, signal);
    return Array.isArray(data.files)
      ? data.files.map((f: { filename: string; additions: number; deletions: number }) => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
        }))
      : [];
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return [];
  }
}

// Up to `limit` most-recent commits touching path. Used by doc_freshness.
export async function listCommitsForPath(
  token: string,
  owner: string,
  repo: string,
  path: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<Array<{ sha: string; date: string }>> {
  try {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=${limit}`,
      "GET",
      undefined,
      signal,
    );
    if (!Array.isArray(data)) return [];
    return data.map((c: { sha: string; commit: { author?: { date?: string }; committer?: { date?: string } } }) => ({
      sha: c.sha,
      date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
    })).filter((c) => c.date);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return [];
  }
}

export interface MergedPR {
  number: number;
  merged_at: string;
}

// Merged PRs in the last N days (descending by updated_at). Excludes still-open.
export async function listMergedPRsInWindow(
  token: string,
  owner: string,
  repo: string,
  windowDays: number,
  hardLimit = 50,
  signal?: AbortSignal,
): Promise<MergedPR[]> {
  const cutoff = Date.now() - windowDays * 86400000;
  const out: MergedPR[] = [];
  for (let page = 1; page <= 5 && out.length < hardLimit; page++) {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/pulls?state=closed&per_page=30&page=${page}&sort=updated&direction=desc`,
      "GET",
      undefined,
      signal,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    let any = false;
    for (const pr of data as Array<{ number: number; merged_at: string | null; updated_at: string }>) {
      const upd = new Date(pr.updated_at).getTime();
      if (upd < cutoff) {
        // List is sorted by updated desc; once we cross the window, stop
        // pagination too — older pages can only be older.
        return out;
      }
      any = true;
      if (!pr.merged_at) continue;
      const merged = new Date(pr.merged_at).getTime();
      if (merged < cutoff) continue;
      out.push({ number: pr.number, merged_at: pr.merged_at });
      if (out.length >= hardLimit) return out;
    }
    if (!any) break;
  }
  return out;
}

// Returns the full list of changed file paths for a PR.
//
// Pagination: GitHub silently caps `per_page` at 100 for the
// `/pulls/{n}/files` endpoint, and the REST API itself returns at most 3000
// files per PR. We loop up to MAX_PAGES (30 × 100 = 3000) so PRs touching
// many files don't get truncated — previously the helper grabbed only the
// first page, which made `pr_touches_code_not_docs` mis-classify large PRs
// as "code without docs" when the doc changes happened to land on later
// pages, skewing the project health score.
//
// Error handling: callers treat an empty list as "unknown set of files" and
// skip the related health check, so on any non-Abort failure mid-stream we
// return `[]` (NOT a partial list) to preserve that conservative semantic.
// AbortError is re-thrown so cancellation propagates to the orchestrator.
export async function getPRFiles(
  token: string,
  owner: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const PER_PAGE = 100;
  const MAX_PAGES = 30; // 3000 files — GitHub's hard cap for this endpoint
  const out: string[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await rest(
        token,
        `/repos/${owner}/${repo}/pulls/${number}/files?per_page=${PER_PAGE}&page=${page}`,
        "GET",
        undefined,
        signal,
      );
      if (!Array.isArray(data)) return []; // unexpected shape — treat as unknown
      for (const f of data as Array<{ filename: string }>) {
        out.push(f.filename);
      }
      if (data.length < PER_PAGE) break; // last page reached
    }
    return out;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return [];
  }
}

// All open issues that have no milestone assigned. Returns issue numbers.
export async function listIssuesWithoutMilestone(
  token: string,
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const out: number[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/issues?state=open&milestone=none&per_page=100&page=${page}`,
      "GET",
      undefined,
      signal,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    for (const i of data as Array<{ number: number; pull_request?: unknown; milestone: unknown }>) {
      if (i.pull_request) continue;
      if (i.milestone == null) out.push(i.number);
    }
    if (data.length < 100) break;
  }
  return out;
}

// Same query as listIssuesWithoutMilestone, but returns the metadata callers
// need to plot a 30-day orphan trend (created_at + originating repo). Kept as
// a separate function so existing call-sites keep their compact `number[]`
// shape.
//
// Pagination caps at 5 pages × 100 = 500 orphans per repo — same envelope as
// findOpenIssueByTitle. If a project ever exceeds that, the chart will
// undercount but never crash.
export interface OrphanIssueMeta {
  number: number;
  created_at: string;
  repo: string;
}

export async function listOrphanIssuesWithMeta(
  token: string,
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<OrphanIssueMeta[]> {
  const PER_PAGE = 100;
  const MAX_PAGES = 5;
  const out: OrphanIssueMeta[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await rest(
      token,
      `/repos/${owner}/${repo}/issues?state=open&milestone=none&per_page=${PER_PAGE}&page=${page}`,
      "GET",
      undefined,
      signal,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    for (const i of data as Array<{
      number: number;
      pull_request?: unknown;
      milestone: unknown;
      created_at: string;
    }>) {
      // The /issues endpoint returns PRs interleaved — drop them or the
      // count balloons with merged-but-milestone-less PRs.
      if (i.pull_request) continue;
      // GitHub's `milestone=none` filter is server-side, but we re-check on
      // the client too: defence-in-depth against an API quirk where the
      // filter occasionally ships an issue with a stale milestone object.
      if (i.milestone != null) continue;
      out.push({ number: i.number, created_at: i.created_at, repo });
    }
    if (data.length < PER_PAGE) break;
  }
  return out;
}
