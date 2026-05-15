/**
 * GitHub Contents REST API wrapper (Epic-011 Task-01, FR-23).
 *
 * Read/write small repo files (≤1 MiB) for Project Hub state that lives
 * directly in the project repo: decision logs, risk register, manual
 * commitments and renewals YAML. Uses base64 + sha-based ETag like
 * GitHub natively does.
 *
 * Failure model:
 *   - 404 from GET → `null` (caller treats absence as "no data yet").
 *   - 409 from PUT → `ConflictError` (caller refreshes sha and retries).
 *   - Other non-2xx → throws with the response status in the message.
 *
 * Token: read via `getToken()` (browser localStorage). 401 dispatches
 * the standard auth-lost event so SettingsPanel can prompt for rotation.
 *
 * Bonus helper `listRecentCommits` lives here because every Hub feature
 * needs commit subjects and the Contents API neighbour is the natural
 * place to keep small REST helpers.
 */

import yaml from "js-yaml";
import { GITHUB_OWNER, getToken } from "./config";
import { dispatchExternalAuthLost } from "./external-auth-events";

const GITHUB_REST = "https://api.github.com";

/** Thrown by `writeYaml` when the server reports an ETag/sha mismatch. */
export class ConflictError extends Error {
  constructor(message = "GitHub Contents write conflict (sha mismatch)") {
    super(message);
    this.name = "ConflictError";
  }
}

/** Information about a single commit, suitable for decision-log mining. */
export interface CommitInfo {
  /** 40-char commit sha. */
  sha: string;
  /** First line of the commit message (subject). */
  subject: string;
  /** Full commit message (subject + body), useful when the body matters. */
  message: string;
  /** Author display name (falls back to login if missing). */
  author: string;
  /** ISO-8601 commit author date. */
  date: string;
  /** HTML URL on github.com. */
  url: string;
}

interface ContentsResponse {
  content?: string;
  encoding?: string;
  sha: string;
}

/** Build the standard Authorization headers, throwing if no token. */
function authHeaders(): HeadersInit {
  const token = getToken();
  if (!token) throw new Error("GitHub token не настроен");
  return {
    Authorization: `bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };
}

/**
 * Resolve a repo argument to `owner/repo`. Accepts either bare
 * `repo-name` (assumes the dashboard's `GITHUB_OWNER`) or a fully
 * qualified `owner/repo` string. Centralised so call sites don't each
 * re-implement the split.
 */
function resolveRepoSlug(repo: string): string {
  return repo.includes("/") ? repo : `${GITHUB_OWNER}/${repo}`;
}

/**
 * Decode a base64 string into UTF-8. The Contents API returns base64
 * even for short text files, so we always have to decode. We use
 * `atob` + manual UTF-8 reassembly because `atob` returns latin1 and
 * silently mangles multi-byte characters otherwise.
 */
function base64DecodeUtf8(b64: string): string {
  // Strip whitespace — GitHub wraps base64 at 60-char lines.
  const clean = b64.replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Encode a UTF-8 string into base64 (PUT body). Mirror of the decoder. */
function base64EncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Internal: fetch a file and return its raw text + sha. `null` on 404.
 * Other non-2xx responses throw — callers don't usually expect them.
 */
async function readContent(
  repo: string,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  const slug = resolveRepoSlug(repo);
  const url = `${GITHUB_REST}/repos/${slug}/contents/${encodeURI(path)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) dispatchExternalAuthLost("github");
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub Contents GET ${slug}/${path} failed: ${res.status}`);
  }
  const body = (await res.json()) as ContentsResponse;
  // The Contents API can return a directory listing (array) when the
  // path is a folder — guard so callers don't get JSON garbage.
  if (typeof body.content !== "string") {
    throw new Error(
      `GitHub Contents GET ${slug}/${path} returned no content (is it a directory?)`,
    );
  }
  // Files >1 MiB come back with `content === ""` and `encoding === "none"`.
  // Surface as null so caller can fall back; the proper API for big files
  // is the blobs endpoint, which we intentionally don't pull in here.
  if (body.encoding && body.encoding !== "base64") {
    return null;
  }
  return { content: base64DecodeUtf8(body.content), sha: body.sha };
}

/** Read a file as plain text. `null` on 404. */
export async function readMarkdown(
  repo: string,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  return readContent(repo, path);
}

/**
 * Read a YAML file and parse it into `T`. Returns `null` on 404 so
 * callers can treat "file doesn't exist yet" as a normal empty state.
 *
 * Parse errors throw — a corrupt YAML file is a real problem the user
 * needs to see, not a silent empty-state fallback.
 */
export async function readYaml<T>(
  repo: string,
  path: string,
): Promise<{ data: T; sha: string } | null> {
  const raw = await readContent(repo, path);
  if (raw === null) return null;
  const parsed = yaml.load(raw.content) as T;
  return { data: parsed, sha: raw.sha };
}

/**
 * Create or update a YAML file. Pass `sha` to update an existing file
 * (omit it for first-time creation). On a 409 the call throws
 * `ConflictError` so the caller can re-read, merge, and retry.
 */
export async function writeYaml<T>(
  repo: string,
  path: string,
  data: T,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const slug = resolveRepoSlug(repo);
  const url = `${GITHUB_REST}/repos/${slug}/contents/${encodeURI(path)}`;
  // `lineWidth: -1` disables yaml-load's automatic line-folding so
  // round-tripping a value never silently mutates whitespace.
  const yamlText = yaml.dump(data, { lineWidth: -1, noRefs: true });
  const body: Record<string, string> = {
    message,
    content: base64EncodeUtf8(yamlText),
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) dispatchExternalAuthLost("github");
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) {
    throw new Error(`GitHub Contents PUT ${slug}/${path} failed: ${res.status}`);
  }
  const responseBody = (await res.json()) as { content?: { sha?: string } };
  const newSha = responseBody.content?.sha ?? sha ?? "";
  return { sha: newSha };
}

/** Raw JSON shape returned by GitHub's `/repos/{}/commits` endpoint. */
interface RawCommit {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
    committer?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
}

/**
 * Fetch the most-recent commits on the repo's default branch.
 * Returns at most `limit` (default 50) commits in newest-first order.
 *
 * On any failure (auth, network, parse) returns `[]` rather than
 * throwing — Hub views render an empty state better than they handle
 * an exception cascade.
 */
export async function listRecentCommits(
  repo: string,
  limit = 50,
): Promise<CommitInfo[]> {
  const slug = resolveRepoSlug(repo);
  // Cap to GitHub's per-page max so a single request covers the
  // common case. Clamp `limit` defensively — a caller passing 1000 is
  // a bug we'd rather paper over than hammer the API.
  const perPage = Math.min(Math.max(1, limit), 100);
  try {
    const res = await fetch(
      `${GITHUB_REST}/repos/${slug}/commits?per_page=${perPage}`,
      { headers: authHeaders() },
    );
    if (res.status === 401) dispatchExternalAuthLost("github");
    if (!res.ok) return [];
    const raw = (await res.json()) as RawCommit[];
    if (!Array.isArray(raw)) return [];
    return raw.map((c) => {
      const message = c.commit?.message ?? "";
      const subject = message.split("\n", 1)[0] ?? "";
      // Prefer the GitHub login (stable handle) over the commit's
      // `author.name` (free-text, often a real name) when both exist;
      // commit views in the Hub already show real names, the log
      // benefits from a consistent identifier.
      const author = c.author?.login ?? c.commit?.author?.name ?? "";
      const date =
        c.commit?.author?.date ?? c.commit?.committer?.date ?? "";
      return {
        sha: c.sha,
        subject,
        message,
        author,
        date,
        url: c.html_url ?? "",
      };
    });
  } catch {
    return [];
  }
}
