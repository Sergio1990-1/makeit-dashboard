/** API client for the makeit-pipeline local server (port 8766). */

import { PIPELINE_BASE_URL } from "./config";
import type { components } from "../types/generated/pipeline";

// Backend wire-contract schemas (makeit-pipeline FastAPI/Pydantic, source
// of truth per #447). Deriving the client's types from the committed
// generated snapshot makes `tsc`/CI fail on backend↔frontend drift instead
// of letting it surface in production. Mirrors the #483 auditor migration.
type StartRequest = components["schemas"]["StartRequest"];
type BackendComplexityFilter = NonNullable<StartRequest["complexity_filter"]>;

/**
 * UI selection for the complexity filter. `auto`/`assisted`/`manual` are
 * the backend's literals (`StartRequest.complexity_filter`, derived from the
 * generated schema); `all` is a UI-only sentinel meaning "no filter" — it is
 * never sent on the wire (the send sites map it to `undefined`). Modelled as
 * `BackendEnum | "all"` so a backend enum change is caught by `tsc` while the
 * deliberate frontend-only `"all"` value is preserved (same intent as the
 * auditor `description_hash` deliberate-frontend-addition pattern in #483).
 */
export type ComplexityFilter = BackendComplexityFilter | "all";

/**
 * Caller-facing input for `startPipeline`. This is a deliberate frontend
 * input shape, NOT the wire body: every field is optional here because the
 * UI omits unset filters, and the send site (`startPipeline`) assembles a
 * `StartRequest`-typed body (backend = source of truth). Drift reconciled
 * toward the backend: the backend `StartRequest` requires `labels`/`limit`
 * (pydantic defaults) and types the rest as `T | null`; the frontend keeps
 * them optional-and-omitted. Runtime is byte-identical — `JSON.stringify`
 * already drops `undefined` keys, and the backend applies the same defaults
 * it declares in its schema.
 */
export interface PipelineStartRequest {
  project?: string;
  labels?: string[];
  limit?: number;
  /** Backend `Literal["auto","assisted","manual"] | None` (derived from
   *  the generated `StartRequest`). The UI-only `"all"` is stripped to
   *  `undefined` before the request is built. */
  complexity_filter?: BackendComplexityFilter;
  /** Open-milestone title to filter issues by (AND with labels). Backend
   * accepts the title string, normalises whitespace-only to "no filter", and
   * passes through the special tokens `*` and `none` unchanged. */
  milestone?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 * `/pipeline/status` rich shapes — DELIBERATE FRONTEND-ONLY TYPES (#447).
 *
 * The backend `PipelineStatusResponse` (generated `components["schemas"]
 * ["PipelineStatusResponse"]`) serializes `results`, `queue`, `issue_stages`
 * and `last_abort_reason` as *untyped dicts* — `{ [k: string]: unknown }[]`
 * etc. The pipeline backend builds those payloads from plain Python dicts,
 * NOT Pydantic models, so the OpenAPI snapshot legitimately has no detailed
 * schema for `PipelineResult` / `PipelineQueueItem` / `PipelineStageEntry` /
 * `PipelineAbortReason`. These are therefore the dashboard's own structural
 * model of an intentionally loosely-typed payload — they have NO backend
 * schema counterpart by design. This is the "legitimately frontend-only"
 * case (#447 rule 3): keep + document, do NOT fabricate a generated alias
 * (there is none) and do NOT refresh the snapshot to invent one. Field
 * names mirror the backend's dict keys; the runtime is unchanged.
 * ────────────────────────────────────────────────────────────────────────── */

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

/**
 * `/pipeline/status` — the dashboard's structural refinement of the backend
 * `PipelineStatusResponse`. The backend types `results`/`queue`/
 * `issue_stages`/`last_abort_reason` as untyped `unknown` dicts (see the
 * frontend-only block above), so this richer shape cannot be a plain alias
 * and is kept frontend-only by design. Top-level field names mirror the
 * backend `PipelineStatusResponse`; `batch_summary` exists on the backend
 * response but is unused by the dashboard — intentionally not surfaced, not
 * drift.
 */
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
 * `/pipeline/limits`. Backend wire contract (`GitHubRateLimitBucket`,
 * source of truth #447); structurally identical to the old hand-written
 * `{limit;remaining;reset_at;reset_seconds}` — no drift.
 */
export type GitHubRateLimitBucket = components["schemas"]["GitHubRateLimitBucket"];

/**
 * `GET /pipeline/limits` — backend `LimitsResponse` wire contract (source
 * of truth #447). One reconciliation toward the backend: the old
 * hand-written `github` field named its keys explicitly (`{ graphql?;
 * rest? }`), whereas the backend serializes it as a generic
 * `{ [bucket: string]: GitHubRateLimitBucket | null } | null` dict. The
 * generated index-signature shape is the truth and still supports the
 * dashboard's `.graphql`/`.rest` access (the dict only ever carries those
 * two keys). No runtime change — same JSON, same access pattern.
 */
export type PipelineLimits = components["schemas"]["LimitsResponse"];

// Backend wire contract for the complexity breakdown (source of truth).
// The generated schema marks every field required-with-default (`0`), which
// is structurally identical to the old hand-written `{auto;assisted;manual;
// unclassified}` — no drift.
export type ComplexityBreakdown = components["schemas"]["ComplexityBreakdown"];

export interface ModelUsage {
  model: string;
  count: number;
}

/**
 * Normalized `/pipeline/stats` shape the dashboard UI consumes. This is a
 * deliberate frontend-derived type, NOT the wire contract: `fetchPipelineStats`
 * adapts the raw backend `AgentStatsResponse` (see `BackendPipelineStats`) at
 * the boundary — `model_usage` is reshaped from a `{model: count}` map to a
 * `ModelUsage[]` the UI iterates, and `first_pass_rate` is converted from the
 * backend's 0–1 fraction to the 0–100 percentage the UI renders. The
 * normalization layer and its runtime are intentionally preserved.
 */
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
 * Raw `GET /pipeline/stats` payload — the backend `AgentStatsResponse` wire
 * contract (source of truth, #447), derived from the generated snapshot so
 * any backend change is caught by `tsc`. Two fields differ in representation
 * from the dashboard's normalized `PipelineStats` and are converted at the
 * boundary in `fetchPipelineStats`:
 *   - `model_usage` is a `{model: count}` map, not a `ModelUsage[]`.
 *   - `first_pass_rate` is a 0–1 fraction (`round(fp/len, 3)`), not the
 *     0–100 percentage the UI renders.
 * (The backend also carries `avg_phase_seconds`, which the normalized UI
 * shape does not surface — intentionally dropped, not drift.)
 */
type BackendPipelineStats = components["schemas"]["AgentStatsResponse"];

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

   DELIBERATE FRONTEND-ONLY TYPES (#447). The backend `GET /issue/{repo}/
   {issue}/context` operation declares its 200 body as `application/json:
   unknown` in the generated snapshot — the pipeline serializes the
   `IssueContext` from a plain dict, NOT a Pydantic model, so there is NO
   `components["schemas"]["IssueContext*"]` to alias. These types are the
   dashboard's own structural model of an intentionally untyped response
   (legitimately frontend-only, #447 rule 3): keep + document, do NOT
   fabricate a generated alias and do NOT refresh the snapshot. Field names
   mirror the backend's dict keys; runtime is unchanged.
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
 * DELIBERATE FRONTEND-ONLY TYPE (#447): the `/pipeline/budget/{owner}/{repo}`
 * endpoint is NOT present in the generated OpenAPI snapshot at all (the
 * pipeline does not register it on the documented app / returns a raw dict),
 * so there is NO `components["schemas"][...]` to alias. Kept + documented as
 * legitimately frontend-only — not fabricated, snapshot not refreshed.
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
  // `rest` still carries `avg_phase_seconds` (part of `AgentStatsResponse`
  // but unused by the normalized UI shape) — harmless: it is spread into
  // the returned object and simply ignored by every consumer. Not drift;
  // the normalization layer never surfaced it.
  const {
    model_usage,
    first_pass_rate,
    complexity_breakdown,
    avg_duration_seconds,
    cost_per_task_usd,
    ...rest
  } = raw;
  return {
    ...rest,
    // Drift reconciled toward the backend (#447): the backend
    // `AgentStatsResponse` types `complexity_breakdown` / `avg_duration_seconds`
    // / `cost_per_task_usd` as `… | null`, while the dashboard's normalized
    // `PipelineStats` uses `undefined` for "absent" (consistent with
    // `model_usage` / `first_pass_rate` below). Normalize `null → undefined`
    // here. Runtime is byte-identical: every consumer guards these fields with
    // truthiness / `!= null` / optional chaining (`stats?.complexity_breakdown
    // && …`, `?? 0`, `stats.avg_duration_seconds != null`), so `null` and
    // `undefined` were already indistinguishable downstream.
    complexity_breakdown: complexity_breakdown ?? undefined,
    avg_duration_seconds: avg_duration_seconds ?? undefined,
    cost_per_task_usd: cost_per_task_usd ?? undefined,
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
  // Drift reconciled toward the backend (#447): the generated `StartRequest`
  // marks `labels`/`limit` required (pydantic defaults) and types
  // `project`/`complexity_filter`/`milestone` as `T | null`. The dashboard
  // omits unset filters instead of sending them, so the wire body is a
  // `Partial<StartRequest>`: every key is optional (the backend applies the
  // exact defaults it declares for any key the UI omits) and `T | null`
  // accepts the `T | undefined` the UI passes. `Partial` (not `any`/cast)
  // keeps the field NAMES and VALUE types checked against the backend, so a
  // genuine rename/retyping still fails `tsc`. Runtime is byte-identical:
  // `JSON.stringify` already drops `undefined` keys exactly as before.
  const body: Partial<StartRequest> = req;
  console.log("[pipeline] starting:", JSON.stringify(body));
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

/**
 * Caller-facing input for `startResearchAgent`. Deliberate frontend input
 * shape: `region` is optional here even though the backend
 * `ResearchStartRequest` schema marks it required (it carries a pydantic
 * default of `"KG"`, which openapi-typescript renders as a required key).
 * Drift reconciled toward the backend at the send boundary — the wire body
 * is typed `Partial<ResearchStartRequest>` so an omitted `region` lets the
 * backend apply its declared default. `project`/`product_description` stay
 * required (backend requires both; `product_description` is
 * `Field(..., min_length=1)`). Runtime byte-identical: `JSON.stringify`
 * drops the omitted `region`, exactly as before.
 */
export interface ResearchStartRequest {
  project: string;
  /** Backend requires a non-empty description (Field(..., min_length=1)). */
  product_description: string;
  region?: string;
}

// Backend wire contract for POST /research/start (source of truth #447).
type BackendResearchStartRequest = components["schemas"]["ResearchStartRequest"];

// `ResearchAgentKind` / `ResearchAgentStatusValue` / `ResearchAgentStatus` /
// `ResearchHistoryItem` are the dashboard's NORMALIZED projections of the
// raw backend `AgentStatusResponse` / `AgentListItem` (both now aliased to
// the generated snapshot above/below). `fetchResearchStatus` /
// `fetchResearchHistory` adapt the raw wire shapes into these — deliberate
// frontend-derived types, kept separate from the contract; runtime unchanged.

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

/**
 * Raw shape returned by GET /research/status and /discovery/status —
 * backend `AgentStatusResponse` wire contract (source of truth #447),
 * derived from the generated snapshot. Drift reconciled toward the
 * backend: the old hand-written type marked `stage`/`progress`/`error`/
 * `project`/`created_at`/`started_at` optional, but the backend declares
 * them required (each with a pydantic default — `""`/`0`). The adapter in
 * `fetchResearchStatus` already guards every field with `??`/`||`, so
 * those guards are now harmless defensive no-ops — runtime unchanged.
 */
type AgentStatusResponse = components["schemas"]["AgentStatusResponse"];

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
  // Drift reconciled toward the backend (#447): the wire body must match
  // the generated `ResearchStartRequest`. `Partial<…>` (not `any`/cast)
  // keeps every field NAME and VALUE type checked against the backend while
  // allowing the UI to omit `region` (backend applies its `"KG"` default).
  // Runtime byte-identical: `JSON.stringify` drops omitted keys as before.
  const body: Partial<BackendResearchStartRequest> = req;
  const res = await fetch(`${PIPELINE_BASE_URL}/research/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = (() => { try { return JSON.parse(body); } catch { return { detail: `HTTP ${res.status}` }; } })();
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function startDiscoveryAgent(project: string): Promise<{ id: string }> {
  // Wire body checked against the backend `DiscoveryStartRequest` (#447):
  // `research_path` carries a server default, so the UI omits it and the
  // backend fills it in. `Partial<…>` keeps `project`'s name/type verified.
  // Runtime byte-identical (same `{project}` payload as before).
  const body: Partial<components["schemas"]["DiscoveryStartRequest"]> = { project };
  const res = await fetch(`${PIPELINE_BASE_URL}/discovery/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
//
// DELIBERATE FRONTEND-ONLY RESPONSE TYPES (#447): `POST /pipeline/classify`
// streams an NDJSON progress/result feed; its generated 200 body is
// `application/json: unknown` (no Pydantic response model). So
// `ClassifyResult`/`ClassifyResponse`/`ClassifyProgress` have NO backend
// schema counterpart by design — keep + document, do not fabricate aliases.
// The REQUEST body, however, IS modeled (`ClassifyRequest`) and is derived
// from the generated snapshot below so a backend rename is caught by `tsc`.
// ---------------------------------------------------------------------------

/** Backend wire contract for the POST /pipeline/classify request body. */
type ClassifyRequest = components["schemas"]["ClassifyRequest"];

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
  // Wire body checked against the backend `ClassifyRequest` (#447). The
  // `issue_numbers` key is still set only when non-empty, so the serialized
  // JSON is byte-identical to before; `Partial<…>` just makes `tsc` fail if
  // the backend renames/retypes a field.
  const body: Partial<ClassifyRequest> = { project };
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

/**
 * Normalized timeline entry the dashboard's `IssueTimeline` consumes. This
 * is a deliberate frontend-derived shape, NOT the wire contract:
 * `fetchTimeline` adapts each raw backend timeline entry (the generated
 * `TimelineResponse["entries"][number]`) — `phase` → `stage`, ISO-8601
 * `timestamp` → Unix seconds `ts`, and `event`/`status` collapsed into the
 * small `status` vocabulary via `normalizeTimelineStatus`. Normalization
 * runtime preserved.
 */
export interface TimelineEntry {
  stage: string;
  status: string;
  ts: number;
  detail?: string;
  cost_usd?: number;
  duration_seconds?: number;
}

/**
 * Raw `GET /pipeline/timeline/{repo:path}/{issue}` envelope — the backend
 * `TimelineResponse` wire contract (source of truth #447), derived from the
 * generated snapshot. Identical to the old hand-written
 * `{repo;issue_number;entries}`, and `entries` carries the backend
 * `TimelineEntry` shape (`timestamp`/`phase`/`event` required;
 * `status`/`cost_usd`/`duration_seconds`/`detail` `T | null` optional) —
 * no drift. `fetchTimeline` adapts each entry to the dashboard's normalized
 * `TimelineEntry`.
 */
type BackendTimelineResponse = components["schemas"]["TimelineResponse"];

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

/**
 * Backend list-item shape returned by /research/list and /discovery/list —
 * the `AgentListItem` wire contract (source of truth #447), derived from
 * the generated snapshot. Structurally identical to the old hand-written
 * `{job_id;status;project;created_at;agent_type}` — no drift.
 */
type AgentListItem = components["schemas"]["AgentListItem"];

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
