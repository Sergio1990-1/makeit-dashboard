/** API client for the makeit-pipeline transcript processor. */

import { PIPELINE_BASE_URL } from "./config";
import type { components } from "../types/generated/pipeline";

// Backend wire-contract schemas (makeit-pipeline FastAPI/Pydantic, source
// of truth per #447). The transcript endpoints live on the same
// makeit-pipeline backend as `pipeline.ts`, so they share the generated
// `pipeline` snapshot. Deriving the raw response/request shapes from the
// committed snapshot makes `tsc`/CI fail on backend↔frontend drift instead
// of letting it surface in production. Mirrors the #483 auditor + #484
// pipeline migrations (this is the last of the three clients under #447).
//
// Every transcript type the ~11 consumers import is a NORMALIZED /
// frontend-derived shape: the client renames `job_id`→`task_id`,
// `file_name`→`filename`, maps the backend's free-text `status`/`stage`
// onto a fixed UI stepper vocabulary, and adapts the untyped
// `quality_report` dict into the array shape the renderers expect. So —
// exactly like pipeline.ts's `TimelineEntry`/`BackendTimelineResponse` and
// `ResearchHistoryItem`/`AgentListItem` pattern — the RAW backend response
// is typed with the generated schema at the `res.json()` boundary, while
// the exported normalized type is kept as a deliberate, documented
// frontend-derived shape (NOT a naive alias). Exported names are unchanged
// so the consumers' imports stay stable.
type BackendTranscriptJobResponse = components["schemas"]["TranscriptJobResponse"];
type BackendTranscriptStatusResponse = components["schemas"]["TranscriptStatusResponse"];
type BackendTranscriptResultResponse = components["schemas"]["TranscriptResultResponse"];
type BackendTranscriptListItem = components["schemas"]["TranscriptListItem"];
type TranscriptBriefUpdateRequest = components["schemas"]["TranscriptBriefUpdateRequest"];
type BackendSpeakersResponse = components["schemas"]["SpeakersResponse"];
type BackendSpeakerInfo = components["schemas"]["SpeakerInfo"];
type SpeakerMergeRequestBody = components["schemas"]["SpeakerMergeRequest"];
type BackendSpeakerMergeResponse = components["schemas"]["SpeakerMergeResponse"];

/**
 * Output mode choice — unlike `TranscriptionModel`, both sides already
 * agree on these exact two string literals (`TranscriptResultResponse.
 * output_mode`/`.primary_artifact`, `Body_upload_..._post.output_mode`
 * are all free-text `string` in the generated snapshot, but the backend
 * Pydantic field only ever produces these two values — see
 * makeit-pipeline's transcript_processor.py). Narrowed via
 * `normalizeOutputMode` rather than cast, so an unrecognized backend
 * value falls back to "brief" instead of silently typing as something
 * invalid.
 */
export type OutputMode = "brief" | "normalized_transcript";

export function normalizeOutputMode(raw: unknown): OutputMode {
  return raw === "normalized_transcript" ? "normalized_transcript" : "brief";
}

/**
 * BRIEF synthesis profile (makeit-pipeline #1300) — orthogonal to
 * `OutputMode`: `output_mode` picks WHICH artifact is generated (brief vs.
 * normalized_transcript), `processing_profile` picks the STRUCTURE/tone of
 * the BRIEF itself once one is generated. Unlike `OutputMode`, the backend
 * `Body_upload_...` field is a real `Literal[...]` enum in the generated
 * schema (see `components["schemas"]["Body_upload_transcript_transcript_upload_post"]["processing_profile"]`),
 * but the two response models (`TranscriptResultResponse`/`TranscriptListItem`)
 * still type it as free-text `string` — normalized the same defensive way
 * as `normalizeOutputMode` so an unrecognized backend value (or an absent
 * field from a pre-#1300 row) falls back to "standard_brief" instead of
 * silently typing as something invalid.
 */
export type ProcessingProfile = "standard_brief" | "dev_handoff";

export function normalizeProcessingProfile(raw: unknown): ProcessingProfile {
  return raw === "dev_handoff" ? "dev_handoff" : "standard_brief";
}

/**
 * Normalized result of `uploadTranscript`/`retryTranscript`. Deliberate
 * frontend-derived shape, NOT the wire contract: the backend returns
 * `TranscriptJobResponse` (`{ job_id, status, brief_url }`); the client
 * renames `job_id`→`task_id` and drops `brief_url` (unused by the UI).
 * Top-level field names mirror the adapted shape; runtime unchanged.
 */
export interface TranscriptUploadResponse {
  task_id: string;
  status: string;
}

/**
 * UI stepper vocabulary — a DELIBERATE FRONTEND-ONLY enum (#447 rule 3).
 * The backend `TranscriptStatusResponse.stage` is free-text (`string` in
 * the generated schema), and the backend `status` (`queued`/`transcribing`/
 * `processing`/`done`/`error`) does not match this 6-value set either. The
 * client OWNS this vocabulary and computes it from the backend `status`
 * via `mapStatusToStage` — it has no backend schema counterpart by design,
 * so it is kept + documented, not aliased.
 */
export type TranscriptStage = "intake" | "stt" | "enrichment" | "structuring" | "synthesis" | "done";

/**
 * `/transcript/status` — the dashboard's normalized refinement of the
 * backend `TranscriptStatusResponse` (raw shape typed below as
 * `BackendTranscriptStatusResponse`). Deliberate frontend-derived shape,
 * NOT a plain alias: the client renames `job_id`→`task_id`, derives the
 * UI `stage` from the backend `status` via `mapStatusToStage`, and adds a
 * `result_url` (always `null`) the backend status payload does not carry.
 * Normalization runtime preserved. (The backend additionally exposes
 * `language`/`project`/`quality`/`transcription_model` on the status
 * response — intentionally not surfaced by the stepper, not drift.)
 */
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
  const data = (await res.json()) as BackendTranscriptStatusResponse;
  // Adapt `TranscriptStatusResponse` → `TranscriptStatus`. The backend
  // declares `error`/`stage_detail`/`file_name`/`started_at` required (each
  // with a pydantic `""` default) and `progress`/`duration_seconds`/
  // `speaker_count` required (default `0`), so the `||`/`??` guards below
  // are now harmless defensive no-ops — runtime unchanged.
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

/* ──────────────────────────────────────────────────────────────────────────
 * Quality verdict / report — DELIBERATE FRONTEND-DERIVED TYPES (#447 rule 3).
 *
 * The backend `TranscriptResultResponse` serializes `quality_report` as an
 * untyped dict (`{ [k: string]: unknown } | null` in the generated schema —
 * the pipeline builds it from a plain Python dict via
 * `_build_quality_report_dict`, not a Pydantic model, so the snapshot
 * legitimately has no detailed schema). `TranscriptQuality` / `QualityCheck`
 * / `QualityReport` are therefore the dashboard's own structural model of an
 * intentionally loosely-typed payload — they have NO backend schema
 * counterpart by design. Kept + documented, NOT aliased; `adaptQualityReport`
 * converts the backend's name-keyed `checks` dict into the array shape the
 * renderers expect. Runtime unchanged.
 * ────────────────────────────────────────────────────────────────────────── */

export type TranscriptQuality = "pass" | "warning" | "needs_review";

export interface QualityCheck {
  name: string;
  label: string;
  status: "pass" | "warning" | "fail";
  message: string;
}

export interface QualityReport {
  checks: QualityCheck[];
  score: number;
}

const QUALITY_VERDICTS = new Set<TranscriptQuality>(["pass", "warning", "needs_review"]);

const QUALITY_CHECK_LABELS: Record<string, string> = {
  speaker_coverage: "Метки спикеров",
  speaker_resolution: "Имена спикеров",
  uncertain_density: "Неразборчивые места",
  contradiction_density: "Противоречия",
  business_term_hit_rate: "Бизнес-термины",
  numeric_facts: "Числа и суммы",
  numeric_facts_confidence: "Уверенность в числах",
  numeric_facts_avg_confidence: "Уверенность в числах",
  action_items_recall: "Action items",
  required_sections: "Разделы брифа",
  section_coverage: "Разделы брифа",
};

function formatQualityCheckLabel(name: string): string {
  return QUALITY_CHECK_LABELS[name] ?? name.replace(/_/g, " ");
}

function formatMetric(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

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
      return { name, label: formatQualityCheckLabel(name), status: "warning", message: "" };
    }
    const e = raw as { status?: string; value?: number; threshold?: number; empty?: number };
    const status: QualityCheck["status"] =
      e.status === "pass" || e.status === "warning" || e.status === "fail"
        ? e.status
        : "warning";
    const parts: string[] = [];
    if (typeof e.value === "number") parts.push(`значение ${formatMetric(e.value)}`);
    if (typeof e.threshold === "number") parts.push(`порог ${formatMetric(e.threshold)}`);
    if (typeof e.empty === "number") parts.push(`пустых ${formatMetric(e.empty)}`);
    return { name, label: formatQualityCheckLabel(name), status, message: parts.join(", ") };
  });
  return {
    checks,
    score: typeof r.score === "number" ? r.score : 0,
  };
}

/**
 * `/transcript/result` — the dashboard's normalized refinement of the
 * backend `TranscriptResultResponse` (raw shape typed below as
 * `BackendTranscriptResultResponse`). Deliberate frontend-derived shape,
 * NOT a plain alias: the client renames `job_id`→`task_id`,
 * `brief_content`→`brief`, `transcript_text`→`transcript`, and derives
 * `quality`/`quality_report` from the untyped backend `quality_report`
 * dict (see `extractQuality`/`adaptQualityReport`). The backend response
 * also carries `*_count` stats / `project` / `status` which the BRIEF
 * viewer does not surface — intentionally dropped, not drift. Runtime
 * preserved.
 *
 * `output_mode`/`primary_artifact`/`normalized_transcript`/`brief_stale`
 * (#1296-#1299 in makeit-pipeline) tell the UI which artifact is the
 * deliverable for this job and whether a speaker merge has invalidated
 * an existing BRIEF — see `primary_artifact` docs on the backend
 * `TranscriptResultResponse` model.
 *
 * `processing_profile` (#1300) is the profile the job was UPLOADED (or
 * resumed) with — persisted backend-side, not re-derived from the current
 * request. For a `normalized_transcript` job it is the profile `continueToBrief`
 * will use once the user asks for a BRIEF.
 */
export interface TranscriptResult {
  task_id: string;
  brief: string;       // BRIEF.md content (markdown) — empty for a normalized_transcript-only job, not an error
  transcript: string;  // cleaned transcript text
  quality: TranscriptQuality | null;
  quality_report: QualityReport | null;
  output_mode: OutputMode;
  primary_artifact: OutputMode; // which of `brief` / `normalized_transcript` is the deliverable
  normalized_transcript: string; // STT-corrected transcript; populated whenever the stt stage has run
  brief_stale: boolean; // true once a speaker merge invalidated an existing BRIEF (see regenerateBrief)
  processing_profile: ProcessingProfile; // BRIEF format the job was created/resumed with (see normalizeProcessingProfile)
}

export async function fetchTranscriptResult(taskId: string): Promise<TranscriptResult> {
  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/result/${encodeURIComponent(taskId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load result (${res.status}): ${text}`);
  }
  const data = (await res.json()) as BackendTranscriptResultResponse;
  // Adapt `TranscriptResultResponse` → `TranscriptResult`. The backend
  // declares `brief_content`/`transcript_text` required (pydantic `""`
  // default), so the `|| ""` guards are now harmless defensive no-ops;
  // `quality_report` stays `… | null` and the two extractors already
  // handle that. Runtime unchanged.
  return {
    task_id: data.job_id,
    brief: data.brief_content || "",
    transcript: data.transcript_text || "",
    quality: extractQuality(data.quality_report),
    quality_report: adaptQualityReport(data.quality_report),
    output_mode: normalizeOutputMode(data.output_mode),
    primary_artifact: normalizeOutputMode(data.primary_artifact),
    normalized_transcript: data.normalized_transcript || "",
    brief_stale: data.brief_stale ?? false,
    processing_profile: normalizeProcessingProfile(data.processing_profile),
  };
}

/**
 * STT model choice — a DELIBERATE FRONTEND-OWNED enum (#447 rule 3). The
 * backend types `transcription_model` as a free-text `string` in the
 * generated snapshot, but the canonical Phase 4 values are `draft` and
 * `quality`; legacy `fast` rows are read-side normalized to `draft`.
 */
export type TranscriptionModel = "draft" | "quality";

export function normalizeTranscriptionModel(raw: unknown): TranscriptionModel | undefined {
  if (raw === "quality") return "quality";
  if (raw === "draft" || raw === "fast") return "draft";
  return undefined;
}

/**
 * `/transcript/list` item — the dashboard's normalized refinement of the
 * backend `TranscriptListItem` (raw shape typed below as
 * `BackendTranscriptListItem`). Deliberate frontend-derived shape, NOT a
 * plain alias: the client renames `job_id`→`task_id`, `file_name`→
 * `filename`, normalizes the free-text backend `transcription_model` to the
 * UI's canonical `TranscriptionModel` enum (or `undefined`), and narrows the
 * free-text backend `status` to the known lifecycle set. The backend
 * `file_type` is intentionally not surfaced — not drift. The `status`
 * narrowing is best-effort: `fetchTranscriptList` passes the backend
 * string through, and consumers compare it against known literals /
 * fall back to the raw string for unknown values. Runtime preserved.
 *
 * `processing_profile` (#1300) is normalized the same way as on
 * `TranscriptResult` — a pre-#1300 row has no such field server-side and
 * defaults to "standard_brief" (`normalizeProcessingProfile`).
 */
export interface TranscriptListItem {
  task_id: string;
  project: string;
  filename: string;
  status: "done" | "queued" | "transcribing" | "processing" | "error";
  created_at: string; // ISO timestamp
  transcription_model?: TranscriptionModel;
  processing_profile: ProcessingProfile;
}

export async function fetchTranscriptList(): Promise<TranscriptListItem[]> {
  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/list`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to load history (${res.status}): ${text}`);
  }
  const data = (await res.json()) as BackendTranscriptListItem[];
  // Adapt `TranscriptListItem` (backend) → `TranscriptListItem` (frontend).
  // The backend declares `project`/`file_name`/`created_at`/
  // `transcription_model` required (pydantic defaults), so the `|| ""` /
  // `|| undefined` guards are now harmless defensive no-ops. The backend
  // `status`/`transcription_model` are free-text `string`; the normalization
  // below preserves legacy `fast` rows as canonical `draft`.
  return data.map((item) => ({
    task_id: item.job_id,
    project: item.project || "",
    filename: item.file_name || "",
    status: item.status as TranscriptListItem["status"],
    created_at: item.created_at || "",
    transcription_model: normalizeTranscriptionModel(item.transcription_model),
    processing_profile: normalizeProcessingProfile(item.processing_profile),
  }));
}

export async function saveTranscriptBrief(
  taskId: string,
  brief: string,
): Promise<void> {
  // Send the canonical contract key `content` (#447). The backend
  // `PUT /transcript/result/{job_id}` body is `TranscriptBriefUpdateRequest`
  // = `{ content: string }` (required, 1 ≤ len ≤ 1 MiB). Runtime is
  // unchanged: the backend field declares `AliasChoices("content","brief")`,
  // so the legacy `{ brief }` key this used to send was already accepted —
  // this just aligns to the canonical key and types the body to the
  // generated schema (not `any`/cast) so a future backend rename fails `tsc`.
  const body: TranscriptBriefUpdateRequest = { content: brief };
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/result/${encodeURIComponent(taskId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

// Multipart form-field names for `POST /transcript/upload`, bound to the
// keys of the backend `Body_upload_transcript_transcript_upload_post`
// schema (source of truth, #447). `FormData.append` can't be typed with
// the `Partial<Body>` JSON trick `pipeline.ts` uses, so instead this
// constant satisfies `Record<keyof Body, string>` — a backend rename of a
// form field is then caught by `tsc` here. (`file` is the binary
// `UploadFile` part; openapi-typescript intentionally omits binary parts
// from the urlencoded body schema, so it has no key to bind — sent with
// its literal name, runtime unchanged.)
//
// `audio_preprocessing_profile`/`meeting_type`/`stt_backend`/
// `use_client_context` were added to the backend schema by unrelated
// earlier work and are listed here only to satisfy the exhaustive
// `Record<keyof Body, ...>` constraint — this client doesn't expose UI
// for them yet and doesn't append them to the form (backend defaults
// apply). Only `output_mode` and `processing_profile` are actually used,
// by `uploadTranscript`.
const UPLOAD_FIELDS: Record<
  keyof components["schemas"]["Body_upload_transcript_transcript_upload_post"],
  string
> = {
  audio_preprocessing_profile: "audio_preprocessing_profile",
  language: "language",
  meeting_type: "meeting_type",
  output_mode: "output_mode",
  processing_profile: "processing_profile",
  project_context: "project_context",
  resume: "resume",
  stt_backend: "stt_backend",
  transcription_model: "transcription_model",
  use_client_context: "use_client_context",
};

/** Upload-progress callback: bytes sent so far and total bytes. */
export type UploadProgressFn = (loaded: number, total: number) => void;

/**
 * POST a multipart form via XMLHttpRequest so upload progress is observable.
 * `fetch` cannot report request-body upload progress, and transcript uploads
 * can be hundreds of MB of audio — the user needs a progress bar, not a
 * frozen "Отправка…". No timeout is set (xhr.timeout defaults to 0) so a slow
 * large upload is not cut off client-side; nginx governs the server side.
 */
function postFormWithProgress(
  url: string,
  form: FormData,
  onProgress?: UploadProgressFn,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (onProgress) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("Сетевая ошибка при загрузке файла"));
    xhr.onabort = () => reject(new Error("Загрузка прервана"));
    xhr.send(form);
  });
}

export async function uploadTranscript(
  file: File,
  project: string,
  transcriptionModel: TranscriptionModel = "quality",
  resumeJobId?: string,
  onProgress?: UploadProgressFn,
  outputMode: OutputMode = "brief",
  processingProfile: ProcessingProfile = "standard_brief",
): Promise<TranscriptUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append(UPLOAD_FIELDS.project_context, project);
  form.append(UPLOAD_FIELDS.transcription_model, transcriptionModel);
  form.append(UPLOAD_FIELDS.output_mode, outputMode);
  form.append(UPLOAD_FIELDS.processing_profile, processingProfile);
  if (resumeJobId) {
    form.append(UPLOAD_FIELDS.resume, resumeJobId);
  }

  const { status, body } = await postFormWithProgress(
    `${PIPELINE_BASE_URL}/transcript/upload`,
    form,
    onProgress,
  );
  if (status < 200 || status >= 300) {
    throw new Error(`Upload failed (${status}): ${body}`);
  }
  // Backend `TranscriptJobResponse` (`{ job_id, status, brief_url }`);
  // adapt to the normalized `TranscriptUploadResponse` (drop `brief_url`,
  // rename `job_id`→`task_id`). Runtime unchanged.
  const data = JSON.parse(body) as BackendTranscriptJobResponse;
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
  form.append(UPLOAD_FIELDS.resume, jobId);
  form.append("file", new Blob([], { type: "application/octet-stream" }), "retry");
  form.append(UPLOAD_FIELDS.project_context, projectContext);
  form.append(UPLOAD_FIELDS.transcription_model, transcriptionModel);

  const res = await fetch(`${PIPELINE_BASE_URL}/transcript/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Retry failed (${res.status}): ${text}`);
  }
  // Same `TranscriptJobResponse` → `TranscriptUploadResponse` adaptation
  // as `uploadTranscript`. Runtime unchanged.
  const data = (await res.json()) as BackendTranscriptJobResponse;
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

/* ──────────────────────────────────────────────────────────────────────────
 * Continue / regenerate / speaker review (#1297-#1299 in makeit-pipeline).
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * FastAPI error bodies are `{"detail": "..."}` JSON, not plain text — the
 * pre-existing endpoints above dump the raw body into their thrown message
 * (established convention), but continue/regenerate/merge each have
 * several DISTINCT, actionable 404/409/422 reasons the UI needs to
 * surface cleanly rather than a raw JSON blob. Falls back to the raw text
 * if it isn't JSON or has no string `detail`.
 */
function extractErrorDetail(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail) return parsed.detail;
  } catch {
    /* not JSON — fall through to raw text */
  }
  return rawText;
}

/**
 * `POST /transcript/continue/{job_id}` — continue a completed
 * normalized_transcript job to full BRIEF generation, reusing the
 * already-completed intake/stt stages (no re-transcription). Returns the
 * same normalized shape as `uploadTranscript` (`TranscriptUploadResponse`)
 * since the backend response is the same `TranscriptJobResponse` wire
 * shape — callers should switch to polling `fetchTranscriptStatus` on
 * success, same as after upload.
 *
 * Throws a friendly Russian message for 404 (job gone) / 409 (wrong
 * output_mode, already running, or not done) / 422 (original upload file
 * no longer locatable) — callers display `err.message` directly rather
 * than crashing (#1299 UX requirement: these are recoverable states).
 */
export async function continueToBrief(taskId: string): Promise<TranscriptUploadResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/continue/${encodeURIComponent(taskId)}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const detail = extractErrorDetail(await res.text().catch(() => ""));
    if (res.status === 404) throw new Error("Задача не найдена — возможно, она была удалена.");
    if (res.status === 409) throw new Error(`Нельзя продолжить обработку: ${detail}`);
    if (res.status === 422) throw new Error(`Нельзя продолжить: ${detail}`);
    throw new Error(`Continue failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as BackendTranscriptJobResponse;
  return { task_id: data.job_id, status: data.status };
}

/**
 * `POST /transcript/{job_id}/regenerate-brief` — rebuild a BRIEF that a
 * speaker merge marked stale (`TranscriptResult.brief_stale` /
 * `SpeakersResult.brief_stale`). Same response shape / polling handoff as
 * `continueToBrief`.
 *
 * Throws a friendly Russian message for 404 / 409 (wrong output_mode,
 * already running, not done, or not stale — a redundant call is a 409,
 * not a silent no-op, matching the backend's own convention) / 422
 * (manifest or stt artifacts missing).
 */
export async function regenerateBrief(taskId: string): Promise<TranscriptUploadResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/${encodeURIComponent(taskId)}/regenerate-brief`,
    { method: "POST" },
  );
  if (!res.ok) {
    const detail = extractErrorDetail(await res.text().catch(() => ""));
    if (res.status === 404) throw new Error("Задача не найдена — возможно, она была удалена.");
    if (res.status === 409) throw new Error(`Нельзя пересобрать BRIEF: ${detail}`);
    if (res.status === 422) throw new Error(`Нельзя пересобрать BRIEF: ${detail}`);
    throw new Error(`Regenerate failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as BackendTranscriptJobResponse;
  return { task_id: data.job_id, status: data.status };
}

/**
 * `GET /transcript/{job_id}/speakers` — the dashboard's normalized
 * refinement of the backend `SpeakersResponse`. `id`/`labels` are the
 * ORIGINAL diarization labels (e.g. "SPEAKER_00") — permanent for the
 * life of the job, and what `mergeTranscriptSpeakers` must be called
 * with. `display_name` is the current resolved name and is NOT a stable
 * identifier (a merge/rename changes it) — see `SpeakerInfo` docs on the
 * backend model.
 */
export interface SpeakerQuote {
  timestamp: string;
  text: string;
}

export interface SpeakerInfo {
  id: string;
  labels: string[];
  display_name: string;
  segment_count: number;
  quotes: SpeakerQuote[];
  uncertain: boolean;
}

export interface SpeakersResult {
  task_id: string;
  speakers: SpeakerInfo[];
  brief_stale: boolean;
}

function adaptSpeakerInfo(s: BackendSpeakerInfo): SpeakerInfo {
  return {
    id: s.id,
    labels: s.labels ?? [],
    display_name: s.display_name,
    segment_count: s.segment_count,
    quotes: (s.quotes ?? []).map((q) => ({ timestamp: q.timestamp, text: q.text })),
    uncertain: s.uncertain,
  };
}

export async function fetchTranscriptSpeakers(taskId: string): Promise<SpeakersResult> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/${encodeURIComponent(taskId)}/speakers`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const detail = extractErrorDetail(await res.text().catch(() => ""));
    if (res.status === 404) throw new Error("Задача не найдена — возможно, она была удалена.");
    if (res.status === 409) throw new Error(`Список спикеров сейчас недоступен: ${detail}`);
    if (res.status === 422) throw new Error(`Список спикеров недоступен: ${detail}`);
    throw new Error(`Failed to load speakers (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as BackendSpeakersResponse;
  return {
    task_id: data.job_id,
    speakers: (data.speakers ?? []).map(adaptSpeakerInfo),
    brief_stale: data.brief_stale,
  };
}

/**
 * `POST /transcript/{job_id}/speakers/merge` — merge/rename one or more
 * speakers. `speakerIds` MUST be the stable diarization labels
 * (`SpeakerInfo.id`/`.labels`), never `display_name` — a single id is a
 * plain rename, two or more merge previously-separate speakers into one.
 */
export interface SpeakerMergeResult {
  task_id: string;
  canonical_name: string;
  speaker_ids: string[];
  updated_segment_count: number;
  normalized_transcript: string;
  brief_stale: boolean;
}

export async function mergeTranscriptSpeakers(
  taskId: string,
  canonicalName: string,
  speakerIds: string[],
): Promise<SpeakerMergeResult> {
  const body: SpeakerMergeRequestBody = { canonical_name: canonicalName, speaker_ids: speakerIds };
  const res = await fetch(
    `${PIPELINE_BASE_URL}/transcript/${encodeURIComponent(taskId)}/speakers/merge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const detail = extractErrorDetail(await res.text().catch(() => ""));
    if (res.status === 404) throw new Error("Задача не найдена — возможно, она была удалена.");
    if (res.status === 409) throw new Error(`Нельзя объединить спикеров: ${detail}`);
    if (res.status === 422) throw new Error(`Нельзя объединить спикеров: ${detail}`);
    throw new Error(`Merge failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as BackendSpeakerMergeResponse;
  return {
    task_id: data.job_id,
    canonical_name: data.canonical_name,
    speaker_ids: data.speaker_ids,
    updated_segment_count: data.updated_segment_count,
    normalized_transcript: data.normalized_transcript,
    brief_stale: data.brief_stale,
  };
}
