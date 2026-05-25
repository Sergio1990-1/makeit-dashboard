/**
 * API client for the «Качество кода» tab (Codex Quality).
 *
 * Separate from `quality.ts` (legacy AutoTuner/KPI client) to keep
 * the two conceptually-different APIs in their own modules. Types live
 * in `src/types/quality.ts`.
 *
 * URL resolution uses runtime `window.__MAKEIT_CONFIG__` so the same
 * bundle can point at the local Pipeline API (8766) or VPS aggregator.
 */
import type {
  QualityPayload,
  Annotation,
  AnnotationCreatePayload,
} from "../types/quality";

declare global {
  interface Window {
    __MAKEIT_CONFIG__?: {
      QUALITY_URL?: string;
      PIPELINE_URL?: string;
      /** Base for the annotations mini-API (GET/POST/DELETE).
       *  Defaults to `/api/annotations` — VPS reverse-proxy to the
       *  annotations-api container. Same-origin keeps Basic Auth cookies
       *  and CSRF posture identical to the rest of the dashboard. */
      ANNOT_URL?: string;
    };
  }
}

/**
 * Thrown when the JSON publisher or `/quality/refresh` endpoint isn't
 * deployed yet — common on prod before the sweep backend lands. UI uses
 * this to render a soft "data not collected yet" state instead of a
 * scary parse error (nginx SPA-fallback serves index.html for missing
 * static files, so a missing JSON shows up as `<!doctype …` not 404).
 */
export class QualityBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityBackendUnavailableError";
  }
}

function qualityUrl(): string {
  return window.__MAKEIT_CONFIG__?.QUALITY_URL ?? "/data/codex-quality.json";
}

/**
 * Base URL for the annotations mini-API. List/create/delete all hang off
 * this — see `annotations-api/main.py` for the FastAPI contract.
 *
 * Historical note: list previously pointed at a static `/data/annotations.json`
 * file, and writes went to the Pipeline Mac via `pipelineUrl()`. Both are
 * gone — annotations now live on the VPS so events authored on one device
 * show up on every other device.
 */
function annotUrl(): string {
  return window.__MAKEIT_CONFIG__?.ANNOT_URL ?? "/api/annotations";
}

function pipelineUrl(): string {
  return window.__MAKEIT_CONFIG__?.PIPELINE_URL ?? "http://localhost:8766";
}

function parseQualityPayload(data: unknown): QualityPayload {
  const v = (data as { schema_version?: unknown })?.schema_version;
  if (v !== 1) throw new Error(`Unknown schema_version: ${String(v)}`);
  return data as QualityPayload;
}

/**
 * Read a JSON body but bail out if nginx returned an HTML fallback page
 * (which it does on 200 when the requested static file is missing).
 */
async function readJson(r: Response, label: string): Promise<unknown> {
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    throw new QualityBackendUnavailableError(`${label}: HTML fallback served`);
  }
  const text = await r.text();
  if (text.trim().startsWith("<")) {
    throw new QualityBackendUnavailableError(`${label}: HTML fallback served`);
  }
  return JSON.parse(text);
}

export async function fetchQualityData(): Promise<QualityPayload> {
  const r = await fetch(qualityUrl(), { cache: "no-cache" });
  if (r.status === 404) {
    throw new QualityBackendUnavailableError("Quality data file not published");
  }
  if (!r.ok) throw new Error(`Quality fetch failed: ${r.status}`);
  return parseQualityPayload(await readJson(r, "Quality fetch"));
}

export async function fetchAnnotations(): Promise<Annotation[]> {
  const r = await fetch(annotUrl(), { cache: "no-cache" });
  // 404 / HTML fallback both mean "mini-API not deployed yet" — treat as
  // empty list so the rest of the UI still renders. Only escalate on
  // genuine 5xx / parse errors so the dashboard surfaces real outages.
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Annotations fetch failed: ${r.status}`);
  try {
    const data = await readJson(r, "Annotations fetch");
    return Array.isArray(data) ? data : ((data as { annotations?: Annotation[] }).annotations ?? []);
  } catch (e) {
    if (e instanceof QualityBackendUnavailableError) return [];
    throw e;
  }
}

export async function forceQualityRefresh(): Promise<QualityPayload> {
  const r = await fetch(`${pipelineUrl()}/quality/refresh`, { method: "POST" });
  if (r.status === 404) {
    throw new QualityBackendUnavailableError("Refresh endpoint not available");
  }
  if (r.status === 409) {
    throw new Error("Sweep уже выполняется — попробуйте через ~5 мин");
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Refresh failed: ${r.status}`);
  }
  return parseQualityPayload(await readJson(r, "Refresh"));
}

export async function createAnnotation(
  p: AnnotationCreatePayload,
): Promise<Annotation> {
  const r = await fetch(annotUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (r.status === 404) {
    throw new QualityBackendUnavailableError("Annotations endpoint not available");
  }
  if (r.status === 413) {
    // Mini-API caps payload at ~4KB (see annotations-api/main.py). Surface
    // a friendly message rather than the raw "Payload too large".
    throw new Error("Событие слишком большое (лимит ~4KB на запись)");
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || err.detail || `Create failed: ${r.status}`);
  }
  return r.json();
}

export async function deleteAnnotation(id: string): Promise<void> {
  const r = await fetch(`${annotUrl()}/${id}`, {
    method: "DELETE",
  });
  // 404 here is fine — idempotent delete (e.g. someone else deleted it
  // between list refresh and your click). Only escalate on real errors.
  if (r.status === 404) return;
  if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
}
