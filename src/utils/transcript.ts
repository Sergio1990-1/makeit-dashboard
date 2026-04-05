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
  progress: number; // 0–100
  error: string | null;
  result_url: string | null;
}

export async function fetchTranscriptStatus(taskId: string): Promise<TranscriptStatus> {
  const res = await fetch(`${getBaseUrl()}/transcript/status/${encodeURIComponent(taskId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Status check failed (${res.status}): ${text}`);
  }
  return res.json();
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
  return res.json();
}

export interface TranscriptListItem {
  task_id: string;
  project: string;
  filename: string;
  status: "done" | "processing" | "failed";
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
  return res.json();
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
  return res.json();
}
