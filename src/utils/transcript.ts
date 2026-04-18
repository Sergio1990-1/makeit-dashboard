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
  current_stage: string | null;
  stages_completed: string[];
}

const VALID_STAGES = new Set<TranscriptStage>(["intake", "stt", "enrichment", "structuring", "synthesis", "done"]);

/** Map backend status/current_stage to frontend TranscriptStage.
 *  If `currentStage` is provided (new pipeline), use it directly.
 *  Otherwise fall back to legacy status string mapping. */
function mapStatusToStage(status: string, backendStage?: string, currentStage?: string): TranscriptStage {
  // New pipeline: use current_stage directly if valid
  if (currentStage && VALID_STAGES.has(currentStage as TranscriptStage)) {
    return currentStage as TranscriptStage;
  }

  // Legacy fallback
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
    stage: mapStatusToStage(data.status, data.stage, data.current_stage),
    stage_detail: data.stage_detail || data.stage || "",
    progress: data.progress ?? 0,
    error: data.error || null,
    result_url: null,
    file_name: data.file_name || "",
    started_at: data.started_at || null,
    duration_seconds: data.duration_seconds ?? 0,
    speaker_count: data.speaker_count ?? 0,
    current_stage: data.current_stage || null,
    stages_completed: Array.isArray(data.stages_completed) ? data.stages_completed : [],
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
    quality: data.quality || null,
    quality_report: data.quality_report || null,
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
 *  file already on disk. */
export async function retryTranscript(jobId: string): Promise<TranscriptUploadResponse> {
  const form = new FormData();
  form.append("resume", jobId);
  form.append("file", new Blob([], { type: "application/octet-stream" }), "retry");
  form.append("project_context", "");
  form.append("transcription_model", "fast");

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
