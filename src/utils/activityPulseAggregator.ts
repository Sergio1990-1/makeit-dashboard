// Activity Pulse aggregator (Epic-011 Task-06, PRD-008 FR-42/FR-43).
//
// Merges a unified activity timeline for one project from four independent
// sources:
//   - GitHub events  → REST `GET /repos/{repo}/events` (commits/issues/PRs/releases)
//   - Pipeline runs  → existing `pipeline.ts` client (fetchPipelineStatus)
//   - Transcripts    → existing `transcript.ts` client (fetchTranscriptList)
//   - Audit findings → existing `auditor.ts` client (fetchAuditFindings)
//
// Each source is capped at 100 events over the last 30 days, so the merged
// total is ≤ 400. Sources are fetched in parallel and isolated: a single
// failing source degrades to an empty contribution rather than throwing the
// whole aggregate away (PRD-008 §"Каскадирование ошибок").
//
// Results are de-duplicated by `${source}:${id}`, sorted newest-first, and
// cached in `sessionStorage` for 5 minutes per repo to keep the GitHub API
// load bounded (Epic-011 §"Влияние на существующий код" mitigation).

import type { PulseEvent } from "../types/hub";
import { getToken } from "./config";
import { fetchPipelineStatus } from "./pipeline";
import { fetchTranscriptList } from "./transcript";
import { fetchAuditFindings } from "./auditor";
import type { AuditFinding } from "../types";

const GITHUB_REST = "https://api.github.com";

/** Per-source cap and global window — see module docstring / acceptance criteria. */
const PER_SOURCE_LIMIT = 100;
const WINDOW_DAYS = 30;

/** sessionStorage cache: 5-minute TTL, keyed per repo. */
const CACHE_PREFIX = "makeit_hub_pulse:";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  /** Wall-clock millis the entry was written (TTL expiry only). */
  ts: number;
  events: PulseEvent[];
}

function cacheKey(repo: string): string {
  return CACHE_PREFIX + repo;
}

function readCache(repo: string): PulseEvent[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(repo));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (
      !entry ||
      typeof entry.ts !== "number" ||
      !Array.isArray(entry.events) ||
      Date.now() - entry.ts > CACHE_TTL_MS
    ) {
      return null;
    }
    return entry.events;
  } catch {
    // Corrupt JSON / disabled storage / private mode → treat as miss.
    return null;
  }
}

function writeCache(repo: string, events: PulseEvent[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const entry: CacheEntry = { ts: Date.now(), events };
    sessionStorage.setItem(cacheKey(repo), JSON.stringify(entry));
  } catch {
    // QuotaExceededError / SecurityError — non-fatal, just skip caching.
  }
}

/** Build a `PulseEvent`, keeping `title` and the back-compat `label` in sync. */
function makeEvent(
  source: PulseEvent["source"],
  id: string,
  type: string,
  timestamp: string,
  title: string,
  url?: string,
  meta?: Record<string, unknown>,
): PulseEvent {
  return { id, source, type, timestamp, title, label: title, url, meta };
}

function isWithinWindow(iso: string, cutoffMs: number): boolean {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t >= cutoffMs;
}

// ── Source 1: GitHub events ────────────────────────────────────────────────

interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  payload?: {
    commits?: Array<{ message?: string }>;
    action?: string;
    issue?: { number?: number; title?: string; html_url?: string };
    pull_request?: { number?: number; title?: string; html_url?: string };
    release?: { tag_name?: string; name?: string; html_url?: string };
  };
}

/**
 * `repo` is a GitHub slug `owner/name`. The events endpoint is paginated
 * (30/page); we pull up to 4 pages to comfortably cover the 100-event cap
 * within the 30-day window, then trim by date + count.
 */
async function fetchGitHubEvents(
  repo: string,
  cutoffMs: number,
): Promise<PulseEvent[]> {
  const token = getToken();
  if (!token) return [];

  const headers: HeadersInit = {
    Authorization: `bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  const raw: GitHubEvent[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(
      `${GITHUB_REST}/repos/${repo}/events?per_page=100&page=${page}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) break;
    const batch = (await res.json()) as GitHubEvent[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    raw.push(...batch);
    // The /events endpoint ignores per_page and returns ≤30/page, so we
    // page until the per-source cap is reached, an empty page is hit, or
    // the 4-page bound — never short-circuit on a "small" page.
    if (raw.length >= PER_SOURCE_LIMIT) break;
  }

  const events: PulseEvent[] = [];
  for (const e of raw) {
    if (!e || typeof e.created_at !== "string") continue;
    if (!isWithinWindow(e.created_at, cutoffMs)) continue;

    const repoUrl = `https://github.com/${repo}`;
    switch (e.type) {
      case "PushEvent": {
        const commits = e.payload?.commits ?? [];
        const n = commits.length;
        const first = commits[0]?.message?.split("\n")[0] ?? "(no message)";
        events.push(
          makeEvent(
            "github",
            e.id,
            "commit",
            e.created_at,
            n > 1 ? `${n} commits: ${first}` : first,
            repoUrl,
            { commits: n },
          ),
        );
        break;
      }
      case "PullRequestEvent": {
        const pr = e.payload?.pull_request;
        const action = e.payload?.action ?? "updated";
        events.push(
          makeEvent(
            "github",
            e.id,
            action === "closed" ? "pr_merged" : "pr",
            e.created_at,
            `PR ${action}: ${pr?.title ?? `#${pr?.number ?? "?"}`}`,
            pr?.html_url,
            { number: pr?.number },
          ),
        );
        break;
      }
      case "IssuesEvent": {
        const issue = e.payload?.issue;
        const action = e.payload?.action ?? "updated";
        events.push(
          makeEvent(
            "github",
            e.id,
            action === "closed" ? "issue_closed" : "issue",
            e.created_at,
            `Issue ${action}: ${issue?.title ?? `#${issue?.number ?? "?"}`}`,
            issue?.html_url,
            { number: issue?.number },
          ),
        );
        break;
      }
      case "ReleaseEvent": {
        const rel = e.payload?.release;
        events.push(
          makeEvent(
            "github",
            e.id,
            "release",
            e.created_at,
            `Release: ${rel?.name ?? rel?.tag_name ?? "(untagged)"}`,
            rel?.html_url,
          ),
        );
        break;
      }
      default:
        // Unmapped event types (Watch/Fork/Create/…): skip — the timeline
        // focuses on dev activity, not social signals.
        break;
    }
  }
  return events.slice(0, PER_SOURCE_LIMIT);
}

// ── Source 2: Pipeline runs ────────────────────────────────────────────────

// The Pipeline live-status feed is global (not repo-scoped) and a
// `PipelineResult` carries no timestamp at all. We therefore surface ONLY
// in-flight runs (`status === "running"`): a running task genuinely *is*
// happening now, so anchoring it to a single `anchorTs` captured once per
// aggregation is semantically correct. Completed/historical runs are
// skipped — they have no timestamp and stamping them "now" would float
// stale runs to the top of the timeline as if they just happened.
// Anchoring to one shared `anchorTs` (vs. `new Date()` per row) plus the
// 5-min per-repo cache also keeps `unreadCount` (lastVisitedStore,
// Task-05) from re-flagging the same running run as "new" on each open.
async function fetchPipelineEvents(
  anchorTs: string,
  cutoffMs: number,
): Promise<PulseEvent[]> {
  if (!isWithinWindow(anchorTs, cutoffMs)) return [];
  const status = await fetchPipelineStatus();
  const events: PulseEvent[] = [];
  for (const r of status.results ?? []) {
    if (r.status !== "running") continue;
    const num = r.issue_number;
    const verdict = r.outcome ?? r.phase_status ?? r.status;
    events.push(
      makeEvent(
        "pipeline",
        `run-${num}`,
        "pipeline_run",
        anchorTs,
        `Pipeline #${num}: ${verdict}`,
        r.pr_url ?? undefined,
        { issue: num, status: r.status },
      ),
    );
  }
  return events.slice(0, PER_SOURCE_LIMIT);
}

// ── Source 3: Transcripts ──────────────────────────────────────────────────

/** Match a transcript's `project` field to the repo slug or its bare name. */
function transcriptMatchesRepo(project: string, repo: string): boolean {
  if (!project) return false;
  if (project === repo) return true;
  const bare = repo.includes("/") ? repo.split("/")[1] : repo;
  return project === bare || project.endsWith(`/${bare}`);
}

async function fetchTranscriptEvents(
  repo: string,
  cutoffMs: number,
): Promise<PulseEvent[]> {
  const list = await fetchTranscriptList();
  const events: PulseEvent[] = [];
  for (const t of list) {
    if (!transcriptMatchesRepo(t.project, repo)) continue;
    if (!t.created_at || !isWithinWindow(t.created_at, cutoffMs)) continue;
    events.push(
      makeEvent(
        "transcript",
        t.task_id,
        "transcript",
        t.created_at,
        `Transcript: ${t.filename || t.task_id} (${t.status})`,
        undefined,
        { status: t.status },
      ),
    );
  }
  return events.slice(0, PER_SOURCE_LIMIT);
}

// ── Source 4: Audit findings ───────────────────────────────────────────────

async function fetchAuditEvents(
  repo: string,
  cutoffMs: number,
): Promise<PulseEvent[]> {
  // Auditor keys projects by bare repo name (see auditor.ts callers).
  const project = repo.includes("/") ? repo.split("/")[1] : repo;
  const findings = await fetchAuditFindings(project);

  // A findings report has no per-finding timestamp — the whole run shares
  // `findings.timestamp`. If that run is older than the window, the audit
  // contributes nothing.
  const auditTs = findings.timestamp;
  if (!auditTs || !isWithinWindow(auditTs, cutoffMs)) return [];

  const events: PulseEvent[] = [];
  (findings.findings ?? []).forEach((f: AuditFinding, idx) => {
    // Findings carry no stable id; derive a deterministic one from the
    // run timestamp + position so re-aggregation dedups cleanly.
    const id = `${auditTs}#${idx}`;
    const title =
      f.description.length > 100
        ? `${f.description.slice(0, 100)}…`
        : f.description;
    events.push(
      makeEvent(
        "audit",
        id,
        "audit_finding",
        auditTs,
        `[${f.severity}] ${title}`,
        undefined,
        { severity: f.severity, category: f.category, file: f.file },
      ),
    );
  });
  return events.slice(0, PER_SOURCE_LIMIT);
}

// ── Aggregate ──────────────────────────────────────────────────────────────

/**
 * Merge the four activity sources for `repo` into one timeline.
 *
 * @param repo  GitHub slug `owner/name`.
 * @param since ISO-8601 lower bound. Effective cutoff is
 *   `max(since, now − 30d)` so the per-source 30-day window is always
 *   honoured even if a caller passes an older `since`.
 *
 * Returns events de-duplicated by `${source}:${id}`, sorted newest-first,
 * total ≤ 400. Never throws: a failing source contributes nothing. A
 * complete, non-empty result is cached per repo in sessionStorage for 5
 * minutes; partial (a source failed) or empty results are not cached.
 */
export async function aggregatePulse(
  repo: string,
  since: string,
): Promise<PulseEvent[]> {
  const cached = readCache(repo);
  if (cached) return cached;

  const now = Date.now();
  const windowStart = now - WINDOW_DAYS * 86_400_000;
  const sinceMs = Date.parse(since);
  const cutoffMs = Number.isNaN(sinceMs)
    ? windowStart
    : Math.max(sinceMs, windowStart);

  // Single timestamp shared by all timestamp-less pipeline runs this
  // aggregation (see fetchPipelineEvents docstring).
  const anchorTs = new Date(now).toISOString();

  // Isolate each source: `allSettled` + per-source try/catch means one
  // outage (e.g. Pipeline Mac offline) yields a partial timeline, never
  // an exception. No console noise in the success path.
  const settled = await Promise.allSettled([
    fetchGitHubEvents(repo, cutoffMs),
    fetchPipelineEvents(anchorTs, cutoffMs),
    fetchTranscriptEvents(repo, cutoffMs),
    fetchAuditEvents(repo, cutoffMs),
  ]);

  const merged: PulseEvent[] = [];
  const seen = new Set<string>();
  let anyRejected = false;
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      anyRejected = true;
      continue;
    }
    for (const ev of result.value) {
      const key = `${ev.source}:${ev.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(ev);
    }
  }

  merged.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  // Only cache a result we're confident is complete & non-empty. Caching a
  // partial (a source rejected) or empty timeline would freeze a transient
  // outage / cold-start for the full 5-min TTL even after services recover.
  if (!anyRejected && merged.length > 0) {
    writeCache(repo, merged);
  }
  return merged;
}
