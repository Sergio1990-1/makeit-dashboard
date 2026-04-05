/** API client for the makeit-pipeline transcript processor. */

const PIPELINE_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { PIPELINE_URL?: string } }).__MAKEIT_CONFIG__?.PIPELINE_URL
  ?? "http://127.0.0.1:8766";

export interface TranscriptUploadResponse {
  task_id: string;
  status: string;
}

export async function uploadTranscript(
  file: File,
  project: string,
): Promise<TranscriptUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("project", project);

  const res = await fetch(`${PIPELINE_BASE_URL}/api/transcripts/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function getTranscriptApiUrl(): string {
  return PIPELINE_BASE_URL;
}
