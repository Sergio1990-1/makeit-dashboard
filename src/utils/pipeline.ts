/** API client for the makeit-pipeline local server (port 8766). */

import { PIPELINE_BASE_URL } from "./config";

export type ComplexityFilter = "auto" | "assisted" | "all";

export interface PipelineStartRequest {
  project?: string;
  labels?: string[];
  limit?: number;
  complexity_filter?: ComplexityFilter;
}

export interface PipelineStageEntry {
  stage: string;
  status: string;
  ts: number;
  detail?: string;
  elapsed?: number;
  cost_usd?: number;
  duration_seconds?: number;
}

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
  human_summary?: string;
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
}

export interface PipelineStatus {
  running: boolean;
  stopping: boolean;
  current_project: string | null;
  active_tasks: number;
  results: PipelineResult[];
  queue: PipelineQueueItem[];
  issue_stages?: Record<number, PipelineStageEntry[]>;
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
  first_pass_rate?: number;
  avg_duration_seconds?: number;
  cost_per_task_usd?: number;
}

/* ── Shared stage constants ── */

export const STAGE_ORDER = [
  "queued", "dev", "self_check", "pr_opened",
  "in_review", "qa_verifying", "ready_to_merge", "merged",
] as const;

export const STAGE_LABEL: Record<string, string> = {
  queued: "Очередь",
  dev: "Разработка",
  self_check: "Самопроверка",
  pr_opened: "PR создан",
  in_review: "Ревью",
  qa_verifying: "QA",
  ready_to_merge: "К мержу",
  merged: "Замержен",
  needs_human: "Нужен человек",
};

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
    console.error("[pipeline] status failed:", res.status, await res.text().catch(() => ""));
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<PipelineStatus>;
}

export async function fetchPipelineStats(project: string): Promise<PipelineStats> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/stats?project=${encodeURIComponent(project)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PipelineStats>;
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
    console.error("[pipeline] start failed:", res.status, body);
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
  product_description?: string;
  region?: string;
}

export interface ResearchAgentStatus {
  id: string;
  agent: "research" | "discovery";
  project: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  stage: string;
  error?: string;
  started_at: string;
  finished_at?: string;
}

export interface ResearchHistoryItem {
  id: string;
  agent: "research" | "discovery";
  project: string;
  status: "done" | "error";
  started_at: string;
  finished_at: string;
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

export async function fetchResearchStatus(id: string): Promise<ResearchAgentStatus> {
  const res = await fetch(`${PIPELINE_BASE_URL}/research/status/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ResearchAgentStatus>;
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

export async function fetchResearchHistory(project: string): Promise<ResearchHistoryItem[]> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/research/history?project=${encodeURIComponent(project)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ResearchHistoryItem[]>;
}
