/** API client for the makeit-pipeline transcript processor. */

function getBaseUrl(): string {
  return (
    (window as unknown as { __MAKEIT_CONFIG__?: { PIPELINE_URL?: string } }).__MAKEIT_CONFIG__?.PIPELINE_URL
    ?? "http://127.0.0.1:8766"
  );
}

export interface TranscriptUploadResponse {
  task_id: string;
  status: string;
}

export type TranscriptStage = "upload" | "transcription" | "processing" | "done";

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

/** Map backend status string to frontend stage.
 *  For errors, use the backend `stage` field to determine where the failure occurred. */
function mapStatusToStage(status: string, backendStage?: string): TranscriptStage {
  switch (status) {
    case "queued":
      return "upload";
    case "transcribing":
      return "transcription";
    case "processing":
      return "processing";
    case "done":
      return "done";
    case "error": {
      // Determine which stage the error occurred in
      const s = (backendStage || "").toLowerCase();
      if (s.includes("транскрипц")) return "transcription";
      return "processing";
    }
    default:
      return "upload";
  }
}

export async function fetchTranscriptStatus(taskId: string): Promise<TranscriptStatus> {
  const res = await fetch(`${getBaseUrl()}/transcript/status/${encodeURIComponent(taskId)}`, {
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

export interface TranscriptResult {
  task_id: string;
  brief: string;       // BRIEF.md content (markdown)
  transcript: string;  // cleaned transcript text
}

export async function fetchTranscriptResult(taskId: string): Promise<TranscriptResult> {
  const res = await fetch(`${getBaseUrl()}/transcript/result/${encodeURIComponent(taskId)}`, {
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
  };
}

export interface TranscriptListItem {
  task_id: string;
  project: string;
  filename: string;
  status: "done" | "queued" | "transcribing" | "processing" | "error";
  created_at: string; // ISO timestamp
}

export async function fetchTranscriptList(): Promise<TranscriptListItem[]> {
  const res = await fetch(`${getBaseUrl()}/transcript/list`, {
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
  }));
}

export async function saveTranscriptBrief(
  taskId: string,
  brief: string,
): Promise<void> {
  const res = await fetch(
    `${getBaseUrl()}/transcript/result/${encodeURIComponent(taskId)}`,
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
): Promise<TranscriptUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("project_context", project);

  const res = await fetch(`${getBaseUrl()}/transcript/upload`, {
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
