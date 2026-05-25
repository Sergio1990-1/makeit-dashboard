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

function annotUrl(): string {
  return window.__MAKEIT_CONFIG__?.ANNOT_URL ?? "/data/annotations.json";
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
  const r = await fetch(`${pipelineUrl()}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (r.status === 404) {
    throw new QualityBackendUnavailableError("Annotations endpoint not available");
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Create failed: ${r.status}`);
  }
  return r.json();
}

export async function deleteAnnotation(id: string): Promise<void> {
  const r = await fetch(`${pipelineUrl()}/annotations/${id}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
}
