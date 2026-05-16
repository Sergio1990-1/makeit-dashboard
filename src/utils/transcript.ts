/** API client for the makeit-pipeline transcript processor. */

import { PIPELINE_BASE_URL } from "./config";

export interface TranscriptUploadResponse {
  task_id: string;
  status: string;
}

/** 5 backend pipeline stages + done. */
export type TranscriptStage = "intake" | "stt" | "enrichment" | "structuring" | "synthesis" | "done";

export interface TranscriptStatus {
  task_id: string;
  stage: TranscriptStage;
  stage_detail: string;
  progress: number; // 0–100
  error: string | null;
  result_url: string | null;
  file_name: string;
  started_at: string | null;
  duration_seconds: number;
  speaker_count: number;
}

/** Map backend `status` (queued|transcribing|processing|done|error) to the
 *  frontend TranscriptStage. The backend `TranscriptStatusResponse` exposes
 *  `status` + `stage`/`stage_detail` only — there is no per-stage progress
 *  field, so the stepper is driven entirely off the coarse status string
 *  (`stage` is used only to refine the bucket on error). */
function mapStatusToStage(status: string, backendStage?: string): TranscriptStage {
  switch (status) {
    case "queued":
      return "intake";
    case "transcribing":
      return "stt";
    case "processing":
      return "structuring";
    case "done":
      return "done";
    case "error": {
      const s = (backendStage || "").toLowerCase();
      if (s.includes("транскрипц") || s.includes("stt")) return "stt";
      if (s.includes("enrichment")) return "enrichment";
      if (s.includes("synthesis")) return "synthesis";
      return "structuring";
    }
    default:
      return "intake";
  }
}

export async function fetchTranscriptStatus(taskId: string): Promise<TranscriptStatus> {
  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/status/${encodeURIComponent(taskId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Status check failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    task_id: data.job_id,
    stage: mapStatusToStage(data.status, data.stage),
    stage_detail: data.stage_detail || data.stage || "",
    progress: data.progress ?? 0,
    error: data.error || null,
    result_url: null,
    file_name: data.file_name || "",
    started_at: data.started_at || null,
    duration_seconds: data.duration_seconds ?? 0,
    speaker_count: data.speaker_count ?? 0,
  };
}

export type TranscriptQuality = "pass" | "warning" | "needs_review";

export interface QualityCheck {
  name: string;
  status: "pass" | "warning" | "fail";
  message: string;
}

export interface QualityReport {
  checks: QualityCheck[];
  score: number;
}

const QUALITY_VERDICTS = new Set<TranscriptQuality>(["pass", "warning", "needs_review"]);

/** Pull the overall quality verdict out of the backend `quality_report.json`.
 * The result endpoint (`TranscriptResultResponse`) carries no standalone
 * `quality` field — the verdict lives at `quality_report.status`
 * (`pass`/`warning`/`needs_review`, see `_build_quality_report_dict` in
 * makeit-pipeline). Returns null when absent/unknown. */
function extractQuality(raw: unknown): TranscriptQuality | null {
  if (!raw || typeof raw !== "object") return null;
  const s = (raw as { status?: unknown }).status;
  return typeof s === "string" && QUALITY_VERDICTS.has(s as TranscriptQuality)
    ? (s as TranscriptQuality)
    : null;
}

/** Backend `quality_report.json` ships `checks` as a dict keyed by check
 * name (per SPEC-012 / task-05 in makeit-pipeline). Convert to the array
 * shape the renderers expect, deriving a human-readable message from
 * value/threshold/empty fields. */
function adaptQualityReport(raw: unknown): QualityReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { score?: number; checks?: unknown };
  if (!r.checks || typeof r.checks !== "object") return null;
  const entries = Object.entries(r.checks as Record<string, unknown>);
  const checks: QualityCheck[] = entries.map(([name, raw]) => {
    if (!raw || typeof raw !== "object") {
      return { name, status: "warning", message: "" };
    }
    const e = raw as { status?: string; value?: number; threshold?: number; empty?: number };
    const status: QualityCheck["status"] =
      e.status === "pass" || e.status === "warning" || e.status === "fail"
        ? e.status
        : "warning";
    const parts: string[] = [];
    if (typeof e.value === "number") parts.push(`value=${e.value}`);
    if (typeof e.threshold === "number") parts.push(`threshold=${e.threshold}`);
    if (typeof e.empty === "number") parts.push(`empty=${e.empty}`);
    return { name, status, message: parts.join(", ") };
  });
  return {
    checks,
    score: typeof r.score === "number" ? r.score : 0,
  };
}

export interface TranscriptResult {
  task_id: string;
  brief: string;       // BRIEF.md content (markdown)
  transcript: string;  // cleaned transcript text
  quality: TranscriptQuality | null;
  quality_report: QualityReport | null;
}

export async function fetchTranscriptResult(taskId: string): Promise<TranscriptResult> {
  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/result/${encodeURIComponent(taskId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load result (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    task_id: data.job_id,
    brief: data.brief_content || "",
    transcript: data.transcript_text || "",
    quality: extractQuality(data.quality_report),
    quality_report: adaptQualityReport(data.quality_report),
  };
}

export type TranscriptionModel = "fast" | "quality";

export interface TranscriptListItem {
  task_id: string;
  project: string;
  filename: string;
  status: "done" | "queued" | "transcribing" | "processing" | "error";
  created_at: string; // ISO timestamp
  transcription_model?: TranscriptionModel;
  quality?: TranscriptQuality;
  current_stage?: string; // for error display: stage where job failed
}

export async function fetchTranscriptList(): Promise<TranscriptListItem[]> {
  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/list`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load history (${res.status}): ${text}`);
  }
  const data: Array<Record<string, string>> = await res.json();
  return data.map((item) => ({
    task_id: item.job_id,
    project: item.project || "",
    filename: item.file_name || "",
    status: item.status as TranscriptListItem["status"],
    created_at: item.created_at || "",
    transcription_model: (item.transcription_model as TranscriptionModel) || undefined,
    quality: (item.quality as TranscriptQuality) || undefined,
    current_stage: item.current_stage || undefined,
  }));
}

export async function saveTranscriptBrief(
  taskId: string,
  brief: string,
): Promise<void> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/result/${encodeURIComponent(taskId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    },
  );
  if (!res.ok) {
    if (res.status === 409) {
      // Backend PUT /transcript/result/{id} rejects edits while the job is
      // not yet `done` (api.py: status != "done" → 409). Surface a clear,
      // actionable message instead of a raw status code.
      throw new Error(
        "Бриф можно сохранить только когда транскрипция завершена (статус «done»). Дождитесь окончания обработки и повторите.",
      );
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Save failed (${res.status}): ${text}`);
  }
}

export async function uploadTranscript(
  file: File,
  project: string,
  transcriptionModel: TranscriptionModel = "fast",
  resumeJobId?: string,
): Promise<TranscriptUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("project_context", project);
  form.append("transcription_model", transcriptionModel);
  if (resumeJobId) {
    form.append("resume", resumeJobId);
  }

  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { task_id: data.job_id, status: data.status };
}

/** Retry a failed transcript job. Backend resumes from saved state by job id;
 *  the empty file blob is a multipart placeholder — backend uses the original
 *  file already on disk. The original model and project_context MUST be
 *  passed through so the retry is parameter-equivalent to the failed job —
 *  hardcoding `fast` / empty context downgraded settings and could trip
 *  backend validation that requires a non-empty context (issue #218).
 *  Caller is responsible for plumbing these from the stored job state
 *  (`TranscriptListItem.transcription_model` and `TranscriptListItem.project`). */
export async function retryTranscript(
  jobId: string,
  transcriptionModel: TranscriptionModel,
  projectContext: string,
): Promise<TranscriptUploadResponse> {
  const form = new FormData();
  form.append("resume", jobId);
  form.append("file", new Blob([], { type: "application/octet-stream" }), "retry");
  form.append("project_context", projectContext);
  form.append("transcription_model", transcriptionModel);

  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Retry failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { task_id: data.job_id, status: data.status };
}

export async function deleteTranscript(taskId: string): Promise<void> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete failed (${res.status}): ${text}`);
  }
}
