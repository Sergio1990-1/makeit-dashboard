/** API client for the makeit-pipeline local server (port 8766). */

import { PIPELINE_BASE_URL } from "./config";

/**
 * UI selection for the complexity filter. `auto`/`assisted`/`manual` are
 * the backend's literals (`StartRequest.complexity_filter`); `all` is a
 * UI-only sentinel meaning "no filter" — it is never sent on the wire
 * (the send sites map it to `undefined`).
 */
export type ComplexityFilter = "auto" | "assisted" | "manual" | "all";

export interface PipelineStartRequest {
  project?: string;
  labels?: string[];
  limit?: number;
  /** Backend `Literal["auto","assisted","manual"] | None` — the UI-only
   *  `"all"` is stripped to `undefined` before the request is built. */
  complexity_filter?: "auto" | "assisted" | "manual";
  /** Open-milestone title to filter issues by (AND with labels). Backend
   * accepts the title string, normalises whitespace-only to "no filter", and
   * passes through the special tokens `*` and `none` unchanged. */
  milestone?: string;
}

export type PhaseStatus =
  | "running"
  | "success"
  | "partial"
  | "failure"
  | "terminal_failure";

export interface PipelineStageEntry {
  phase: string;
  status: PhaseStatus;
  event: string;
  duration_seconds: number;
  cost_usd: number;
  summary: string;
}

export type EscalationCategory =
  | "ci_failed"
  | "ci_infra_blocked"
  | "review_unfixable"
  | "timeout"
  | "parse_failure"
  | "other";

export interface EscalationReason {
  phase: string;
  event: string;
  error: string | null;
  category: EscalationCategory;
}

/**
 * UX-critical: tells the user whether the change actually reached `main`.
 *  - merged_clean         → done, CI green
 *  - merged_with_followup → on main, but post-merge phase (CI/billing) failed → ops, not engineering
 *  - not_merged           → never made it to main → engineering rework
 *  - null                 → legacy record (pre 2026-04-26) → fall back to phase_status
 */
export type Outcome = "merged_clean" | "merged_with_followup" | "not_merged";

export type ComplexityLevel = "auto" | "assisted" | "manual";

export interface PipelineResult {
  issue_number: number;
  status: string;
  branch: string | null;
  pr_url: string | null;
  retries: number;
  error: string | null;
  stages?: PipelineStageEntry[];
  review_verdict?: string;
  review_summary?: string;
  complexity?: ComplexityLevel;
  model_used?: string;
  cost_usd?: number;
  phase_status?: string;
  human_summary?: string | null;
  escalation_reason?: EscalationReason | null;
  outcome?: Outcome | null;
  dev_model?: string | null;
  workflow_type?: string | null;
  qa_passed?: boolean | null;
  qa_findings_count?: number | null;
  total_duration_seconds?: number | null;
  attempt_number?: number;
  max_attempts?: number;
  budget_remaining_usd?: number;
  risk_level?: "low" | "medium" | "high";
  execution_policy?: string;
}

export interface PipelineQueueItem {
  number: number;
  title: string;
  status: string;
  priority: number;
  // V2 fields — issue #797 (Phase-1.4). All optional for back-compat with
  // older Pipeline backends; older builds simply leave the corresponding
  // UI columns / badges off.
  risk_level?: "low" | "medium" | "high";
  complexity?: "auto" | "assisted" | "manual";
  model?: string;
  attempt?: number;
  max_attempts?: number;
  budget_spent_usd?: number;
  budget_cap_usd?: number;
  labels?: string[];
  pr_url?: string | null;
  issue_url?: string | null;
}

/**
 * Phase-0.7 (TD-architect, 2026-04-30) — populated by the pipeline API
 * (`/pipeline/status`) when the previous /pipeline/start aborted before
 * any dev work started.  Lets the dashboard show "next attempt at HH:MM"
 * instead of an opaque ``running=False``.  Empty `{}` = no recent abort.
 *
 * Fields:
 * - category: ``graphql_rate_limit`` (recognised) or ``other``;
 * - message: raw exception text (may be long);
 * - at_ts: unix-seconds when the abort happened;
 * - retry_after_ts: unix-seconds when the underlying constraint clears
 *   (only set for known-recoverable categories, e.g. graphql_rate_limit).
 */
export interface PipelineAbortReason {
  category: "graphql_rate_limit" | "other";
  message: string;
  at_ts: number;
  retry_after_ts: number | null;
}

export interface PipelineStatus {
  running: boolean;
  stopping: boolean;
  current_project: string | null;
  active_tasks: number;
  results: PipelineResult[];
  queue: PipelineQueueItem[];
  issue_stages?: Record<number, PipelineStageEntry[]>;
  /** Phase-0.7: empty `{}` when no recent abort. */
  last_abort_reason?: PipelineAbortReason | Record<string, never>;
}

/**
 * Phase-0.7: GitHub rate-limit bucket (REST or GraphQL) surfaced via
 * `/pipeline/limits`.  Pre-batch ``run_batch`` aborts when GraphQL drops
 * below 500 — surfacing the bucket lets the dashboard warn before the
 * user's Start click bounces.
 */
export interface GitHubRateLimitBucket {
  limit: number;
  remaining: number;
  reset_at: number;       // unix-ts
  reset_seconds: number;  // server-side computed
}

export interface PipelineLimits {
  // Anthropic / Claude CLI rate-limiter (existing).
  paused: boolean;
  call_count: number;
  max_calls: number;
  remaining_pct: number;
  rate_limit_hits: number;
  session_elapsed_hours: number;
  session_hours: number;
  session_expired: boolean;
  api_fallback_enabled: boolean;
  api_fallback_confirmed: boolean;
  /** Phase-0.7: GitHub rate-limit buckets.  `null` = probe unavailable. */
  github?: {
    graphql?: GitHubRateLimitBucket | null;
    rest?: GitHubRateLimitBucket | null;
  } | null;
}

export interface ComplexityBreakdown {
  auto: number;
  assisted: number;
  manual: number;
  unclassified: number;
}

export interface ModelUsage {
  model: string;
  count: number;
}

export interface PipelineStats {
  total_issues: number;
  closed_issues: number;
  agent_completed: number;
  manual_completed: number;
  complexity_breakdown?: ComplexityBreakdown;
  model_usage?: ModelUsage[];
  first_pass_rate?: number;    // 0–100 (percentage, NOT fraction)
  avg_duration_seconds?: number;
  cost_per_task_usd?: number;
}

/**
 * Raw `GET /pipeline/stats` payload (backend `AgentStatsResponse` in
 * makeit-pipeline `api.py`). The backend is the source of truth; two
 * fields differ in representation from the dashboard's `PipelineStats`
 * and are converted at the boundary in `fetchPipelineStats`:
 *   - `model_usage` is a `{model: count}` map, not a `ModelUsage[]`.
 *   - `first_pass_rate` is a 0–1 fraction (`round(fp/len, 3)`), not the
 *     0–100 percentage the UI renders.
 */
interface BackendPipelineStats
  extends Omit<PipelineStats, "model_usage" | "first_pass_rate"> {
  model_usage?: Record<string, number> | null;
  first_pass_rate?: number | null;
}

/* ── Live phase constants (new /pipeline/status format) ── */

export const PHASE_ORDER = [
  "dev", "review", "qa_verify", "merge", "ci_monitor",
] as const;

export const PHASE_LABEL: Record<string, string> = {
  dev: "Разработка",
  review: "Ревью",
  qa_verify: "QA",
  merge: "Мердж",
  ci_monitor: "CI",
};

/* ── Legacy timeline stage constants (used by IssueTimeline) ── */

export const STAGE_ORDER = [
  "queued", "dev", "self_check", "pr_opened",
  "in_review", "qa_verifying", "ready_to_merge", "merged",
] as const;

/** Map pipeline API stage names to dashboard canonical names. */
const STAGE_ALIAS: Record<string, string> = {
  pr: "pr_opened",
  review: "in_review",
  qa_verify: "qa_verifying",
  merge: "merged",
};

/** Normalize a stage name: resolve aliases to canonical dashboard names. */
export function normalizeStage(stage: string): string {
  return STAGE_ALIAS[stage] ?? stage;
}

export const STAGE_LABEL: Record<string, string> = {
  queued: "Очередь",
  dev: "Dev",
  self_check: "Проверка",
  pr_opened: "PR создан",
  in_review: "Ревью",
  qa_verifying: "QA",
  ready_to_merge: "К мержу",
  merged: "Замержен",
  needs_human: "Нужен человек",
  // Aliases for pipeline API names (defense-in-depth)
  pr: "PR создан",
  review: "Ревью",
  qa_verify: "QA",
  merge: "Замержен",
  ci_monitor: "CI",
};

/* ══════════════════════════════════════════
   ISSUE CONTEXT (epic-027)
   ══════════════════════════════════════════ */

// Issue lifecycle status — kept loose (string) so a new pipeline-side enum
// value renders as raw text rather than crashing the panel. The known values
// at the time of writing are listed in IssueStatus on the pipeline side.
export type IssueLifecycleStatus =
  | "queued"
  | "in_dev"
  | "reviewing"
  | "resolving"
  | "qa_verifying"
  | "polishing"
  | "ready_to_merge"
  | "ci_verifying"
  | "merged"
  | "needs_human"
  | "failed"
  | (string & {}); // tolerate unknown enum values added later

export interface IssueContextRetryBudget {
  attempts: number;
  max_attempts: number;
  cost_usd: number;
  max_cost_usd: number;
  exhausted?: boolean;
}

// `structured_result` is a discriminated envelope on the pipeline side
// (DevResult / ReviewResult / QAResult). The dashboard renders it tolerantly,
// so we keep the type open and key off `kind`.
export interface IssueContextStructuredResult {
  kind: string;
  [k: string]: unknown;
}

export interface IssueContextPhaseEntry {
  phase: string;
  status: PhaseStatus | string;
  started_at: string; // ISO 8601
  duration_seconds: number;
  cost_usd: number;
  event: string;
  error?: string | null;
  artifacts?: Record<string, unknown>;
  structured_result?: IssueContextStructuredResult | null;
}

export interface IssueContext {
  repo: string;
  issue_number: number;
  status: IssueLifecycleStatus;
  attempts: number;
  cost_usd: number;
  phase_history: IssueContextPhaseEntry[];
  artifacts: Record<string, unknown>;
  retry_budget: IssueContextRetryBudget;
  created_at: string;
  updated_at: string;
  pr_url?: string | null;
  branch?: string | null;
}

/**
 * Fetch the full IssueContext (phase history, retry budget, status, FSM
 * artifacts) for a given pipeline issue.
 *
 * @param repo "owner/name" — must contain exactly one `/`. The pipeline API
 *   route uses `{repo:path}` so the slash is fine to pass through; we still
 *   validate before sending so a malformed value gets a useful client-side
 *   error instead of a confusing 400 from the server.
 *
 * Throws on HTTP error / network failure; callers should surface the message
 * to the user.
 */
export async function fetchIssueContext(
  repo: string,
  issueNumber: number,
  signal?: AbortSignal,
): Promise<IssueContext> {
  // Reject anything that's not exactly "owner/name" — the prior loose
  // `includes("/")` check accepted "a/b/c" and silently dropped the tail
  // via split, so the request landed on /issue/a/b/.../context. Today's
  // only caller is `${GITHUB_OWNER}/${current_project}` so this is
  // defence-in-depth, not a live bug.
  const repoParts = repo.split("/");
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    throw new Error(`Invalid repo "${repo}" — expected "owner/name"`);
  }
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid issue number ${issueNumber} — must be a positive integer`);
  }
  const [owner, name] = repoParts;
  // Encode each segment separately to keep the slash that the pipeline
  // route's `{repo:path}` converter expects.
  const encodedRepo = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const res = await fetch(
    `${PIPELINE_BASE_URL}/issue/${encodedRepo}/${issueNumber}/context`,
    { cache: "no-store", signal },
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Контекст не найден");
    if (res.status === 400) throw new Error("Неверный формат repo / номера");
    if (res.status === 500) throw new Error("Хранилище контекстов недоступно");
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<IssueContext>;
}

export async function isPipelineRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${PIPELINE_BASE_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    console.error("[pipeline] health check failed:", e);
    return false;
  }
}

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/status`, { cache: "no-store" });
  if (!res.ok) {
    if (import.meta.env.DEV) {
      console.error("[pipeline] status failed:", res.status, await res.text().catch(() => ""));
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<PipelineStatus>;
}

/**
 * Phase-0.7: fetch combined Claude + GitHub rate-limits.  Returns `null`
 * on any error so callers can render a "limits unavailable" state without
 * crashing the panel.
 */
export async function fetchPipelineLimits(): Promise<PipelineLimits | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/limits`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return (await res.json()) as PipelineLimits;
  } catch (e) {
    if (import.meta.env.DEV) console.error("[pipeline] limits fetch failed:", e);
    return null;
  }
}

/**
 * Per-project monthly budget snapshot (epic-035 Task-05).
 *
 * `monthly_cap_usd === null` → cap not configured for this project;
 * `percentage` is also `null` and the widget renders a "cap not set" badge.
 *
 * `status` thresholds: `<60%` ok, `60-80%` warning, `>=80%` exceeded —
 * mirror the pipeline's Telegram alert thresholds so the dashboard's
 * visual state matches the operator's notification stream.
 */
export interface BudgetSummary {
  project: string;
  year_month: string;
  monthly_spent_usd: number;
  monthly_cap_usd: number | null;
  percentage: number | null;
  batches_this_month: number;
  last_alert_at: string | null;
  status: "ok" | "warning" | "exceeded";
}

/**
 * Fetch the per-project budget snapshot. Returns `null` on any failure
 * (404 — pipeline doesn't know the project, 503 — store/config outage,
 * network/timeout) so the widget can render a neutral fallback rather
 * than crash the project card.
 */
export async function fetchBudget(project: string): Promise<BudgetSummary | null> {
  if (!project.includes("/")) {
    if (import.meta.env.DEV) {
      console.warn("[pipeline] fetchBudget: expected owner/repo, got", project);
    }
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // `project` is a GitHub slug `owner/repo` — split + encode each
    // segment so dots/dashes round-trip but a malicious caller can't
    // smuggle a `?` or `#` into the path.
    const [owner, repo] = project.split("/", 2);
    const url = `${PIPELINE_BASE_URL}/pipeline/budget/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return (await res.json()) as BudgetSummary;
  } catch (e) {
    if (import.meta.env.DEV) console.error("[pipeline] budget fetch failed:", e);
    return null;
  }
}

export async function fetchPipelineStats(project: string): Promise<PipelineStats> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/stats?project=${encodeURIComponent(project)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as BackendPipelineStats;
  const { model_usage, first_pass_rate, ...rest } = raw;
  return {
    ...rest,
    // dict → array the UI iterates; absent/null → undefined.
    model_usage:
      model_usage && typeof model_usage === "object"
        ? Object.entries(model_usage).map(([model, count]) => ({
            model,
            count,
          }))
        : undefined,
    // fraction (0–1) → percentage (0–100) the UI renders. Keep 0 (a real
    // 0% rate) distinct from absent — gate on the number type, not truthiness.
    first_pass_rate:
      typeof first_pass_rate === "number"
        ? first_pass_rate * 100
        : undefined,
  };
}

export async function startPipeline(req: PipelineStartRequest): Promise<string> {
  console.log("[pipeline] starting:", JSON.stringify(req));
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (import.meta.env.DEV) {
      console.error("[pipeline] start failed:", res.status, body);
    }
    const err = (() => { try { return JSON.parse(body); } catch { return { detail: `HTTP ${res.status}` }; } })();
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { message: string };
  console.log("[pipeline] start response:", data.message);
  return data.message;
}

export async function stopPipeline(): Promise<string> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/stop`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { message: string };
  return data.message;
}

/* ══════════════════════════════════════════
   RESEARCH / DISCOVERY AGENTS
   ══════════════════════════════════════════ */

export interface ResearchStartRequest {
  project: string;
  /** Backend requires a non-empty description (Field(..., min_length=1)). */
  product_description: string;
  region?: string;
}

/** Job-type discriminator. The backend does NOT expose this on the
 *  status endpoint — only /research/list & /discovery/list carry
 *  `agent_type`. The dashboard threads the known type from the caller. */
export type ResearchAgentKind = "research" | "discovery";

/** Backend AgentStatusResponse status values (api.py): research emits
 *  queued/searching/done/error, discovery emits queued/analyzing/done/error.
 *  Kept loose so an unknown value degrades gracefully instead of crashing. */
export type ResearchAgentStatusValue =
  | "queued"
  | "searching"
  | "analyzing"
  | "done"
  | "error"
  | (string & {});

export interface ResearchAgentStatus {
  id: string;
  /** Set client-side from the launching call — backend status payload
   *  has no agent discriminator. */
  agent: ResearchAgentKind;
  project: string;
  status: ResearchAgentStatusValue;
  progress: number;
  stage: string;
  error?: string;
  started_at: string;
  finished_at?: string;
}

/** Raw shape returned by GET /research/status and /discovery/status. */
interface AgentStatusResponse {
  job_id: string;
  status: string;
  stage?: string;
  progress?: number;
  error?: string;
  project?: string;
  created_at?: string;
  started_at?: string;
}

export interface ResearchHistoryItem {
  id: string;
  agent: "research" | "discovery";
  project: string;
  /** Mirrors backend research_jobs status — includes in-progress states. */
  status: "queued" | "searching" | "analyzing" | "done" | "error";
  started_at: string;
  /** Backend /research/list does not expose a finish timestamp; absent for
   *  jobs that haven't terminated and unknown for jobs that have. */
  finished_at?: string;
}

export async function startResearchAgent(req: ResearchStartRequest): Promise<{ id: string }> {
  const res = await fetch(`${PIPELINE_BASE_URL}/research/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = (() => { try { return JSON.parse(body); } catch { return { detail: `HTTP ${res.status}` }; } })();
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function startDiscoveryAgent(project: string): Promise<{ id: string }> {
  const res = await fetch(`${PIPELINE_BASE_URL}/discovery/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = (() => { try { return JSON.parse(body); } catch { return { detail: `HTTP ${res.status}` }; } })();
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function fetchResearchStatus(
  id: string,
  /** The kind of agent that was launched. Backend status payload has no
   *  discriminator, so the caller (hook) supplies what it already knows.
   *  It also selects the correct endpoint: the backend keeps research and
   *  discovery jobs in separate stores (`/research/status` only knows
   *  research jobs, `/discovery/status` only discovery). */
  agent: ResearchAgentKind = "research",
): Promise<ResearchAgentStatus> {
  const path = agent === "discovery" ? "discovery" : "research";
  const res = await fetch(`${PIPELINE_BASE_URL}/${path}/status/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as AgentStatusResponse;
  // Adapt AgentStatusResponse → ResearchAgentStatus. The backend uses
  // `job_id` and exposes no `agent`/`finished_at`; status is preserved
  // as-is (consumers treat anything other than done/error as in-progress).
  return {
    id: raw.job_id,
    agent,
    project: raw.project ?? "",
    status: raw.status,
    progress: raw.progress ?? 0,
    stage: raw.stage ?? "",
    error: raw.error ? raw.error : undefined,
    started_at: raw.started_at || raw.created_at || "",
    finished_at: undefined,
  };
}

// ---------------------------------------------------------------------------
// Complexity classification
// ---------------------------------------------------------------------------

export interface ClassifyResult {
  number: number;
  category: string;
  score: number;
  reason: string;
}

export interface ClassifyResponse {
  classified: number;
  results: ClassifyResult[];
}

export interface ClassifyProgress {
  done: number;
  total: number;
  current: string;
  error?: string;
  label_failed?: boolean;
  breakdown: { auto: number; assisted: number; manual: number; errors: number };
}

export async function classifyIssues(
  project: string,
  issueNumbers?: number[],
  onProgress?: (p: ClassifyProgress) => void,
): Promise<ClassifyResponse> {
  const body: Record<string, unknown> = { project };
  if (issueNumbers?.length) body.issue_numbers = issueNumbers;

  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }

  // Parse NDJSON stream
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ClassifyResponse = { classified: 0, results: [] };
  const breakdown = { auto: 0, assisted: 0, manual: 0, errors: 0 };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: string;
        done?: number;
        total?: number;
        current?: string;
        error?: string;
        label_failed?: boolean;
        classified?: number;
        results?: ClassifyResult[];
      };
      if (event.type === "progress" && onProgress) {
        // Parse category from "current" field: "#450 → assisted"
        const cat = event.current?.split("→")[1]?.trim();
        if (cat === "auto") breakdown.auto++;
        else if (cat === "assisted") breakdown.assisted++;
        else if (cat === "manual") breakdown.manual++;
        else if (cat === "error") breakdown.errors++;

        onProgress({
          done: event.done!,
          total: event.total!,
          current: event.current!,
          error: event.error,
          label_failed: event.label_failed,
          breakdown: { ...breakdown },
        });
      } else if (event.type === "done") {
        finalResult = { classified: event.classified!, results: event.results! };
      }
    }
  }

  return finalResult;
}

/* ══════════════════════════════════════════
   ISSUE TIMELINE
   ══════════════════════════════════════════ */

export interface TimelineEntry {
  stage: string;
  status: string;
  ts: number;
  detail?: string;
  cost_usd?: number;
  duration_seconds?: number;
}

/**
 * Raw per-entry shape returned by `GET /pipeline/timeline/{repo:path}/{issue}`
 * (backend `TimelineEntry` Pydantic model in makeit-pipeline `api.py`).
 * Field names/types here mirror the backend exactly; `fetchTimeline` adapts
 * them to the dashboard's `TimelineEntry`.
 */
interface BackendTimelineEntry {
  timestamp: string; // ISO-8601
  phase: string;
  event: string; // phase_start | phase_complete | phase_failed | retry | escalation | merge | cleanup
  status?: string | null; // PhaseStatus value or "in_progress"
  cost_usd?: number | null;
  duration_seconds?: number | null;
  detail?: string | null;
}

interface BackendTimelineResponse {
  repo: string;
  issue_number: number;
  entries: BackendTimelineEntry[];
}

/**
 * Map the backend's `event`/`status` pair onto the small status vocabulary
 * `IssueTimeline`'s `dotColor` understands (`completed` / `failed` /
 * `in_progress` / `partial`). The `event` field is the richest signal; the
 * `status` (`PhaseStatus` value or `"in_progress"`) refines completion into
 * success vs. partial.
 */
function normalizeTimelineStatus(event: string, status?: string | null): string {
  if (event === "phase_failed" || event === "escalation") return "failed";
  if (event === "phase_start" || event === "retry") return "in_progress";
  if (event === "phase_complete" || event === "merge" || event === "cleanup") {
    if (status === "partial") return "partial";
    if (
      status === "retryable_failure" ||
      status === "terminal_failure" ||
      status === "blocked" ||
      status === "timeout" ||
      status === "timeout_with_pr"
    ) {
      return "failed";
    }
    return "completed";
  }
  if (status === "in_progress") return "in_progress";
  return status ?? event;
}

export async function fetchTimeline(
  repo: string,
  issue: number,
): Promise<TimelineEntry[]> {
  // `repo` is an `owner/name` slug. The backend route captures it via a
  // FastAPI `{repo:path}` converter (it must keep the `/`), so split + encode
  // each segment — same approach as `fetchBudget` — rather than
  // `encodeURIComponent(repo)` which would emit `%2F` and miss the route.
  const [owner, name] = repo.split("/", 2);
  const repoPath = name
    ? `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    : encodeURIComponent(repo);
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/timeline/${repoPath}/${issue}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as BackendTimelineResponse;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries.map((e) => {
    const parsedMs = Date.parse(e.timestamp);
    return {
      stage: e.phase,
      status: normalizeTimelineStatus(e.event, e.status),
      // Backend sends ISO-8601; the UI expects Unix seconds (it `* 1000`s it).
      ts: Number.isNaN(parsedMs) ? 0 : parsedMs / 1000,
      detail: e.detail ?? undefined,
      cost_usd: e.cost_usd ?? undefined,
      duration_seconds: e.duration_seconds ?? undefined,
    };
  });
}

/** Backend list-item shape returned by /research/list and /discovery/list. */
interface AgentListItem {
  job_id: string;
  status: string;
  project: string;
  created_at: string;
  agent_type: string;
}

export async function fetchResearchHistory(project: string): Promise<ResearchHistoryItem[]> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/research/list?project=${encodeURIComponent(project)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = (await res.json()) as AgentListItem[];
  // Backend returns `{job_id, status, project, created_at, agent_type}` —
  // adapt to ResearchHistoryItem so callers stay stable and the field-name
  // drift between dashboard and pipeline doesn't leak to UI code.
  // Status is preserved as-is (backend emits queued/searching/done/error),
  // and finished_at is left undefined since /research/list doesn't expose it.
  const KNOWN: ResearchHistoryItem["status"][] = ["queued", "searching", "analyzing", "done", "error"];
  return items.map((it) => ({
    id: it.job_id,
    agent: it.agent_type === "discovery" ? "discovery" : "research",
    project: it.project,
    status: KNOWN.includes(it.status as ResearchHistoryItem["status"])
      ? (it.status as ResearchHistoryItem["status"])
      : "error",
    started_at: it.created_at,
    finished_at: undefined,
  }));
}
