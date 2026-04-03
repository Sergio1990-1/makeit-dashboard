/** API client for the makeit-pipeline local server (port 8766). */

const PIPELINE_BASE_URL =
  (window as any).__MAKEIT_CONFIG__?.PIPELINE_URL ?? "http://127.0.0.1:8766";

export interface PipelineStartRequest {
  project?: string;
  labels?: string[];
  limit?: number;
}

export interface PipelineStageEntry {
  stage: string;
  status: string;
  ts: number;
  detail?: string;
}

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

export interface PipelineStats {
  total_issues: number;
  closed_issues: number;
  agent_completed: number;
  manual_completed: number;
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
