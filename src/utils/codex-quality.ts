/**
 * API client for the «Качество кода и изменения» tab (Codex Quality).
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

function qualityUrl(): string {
  return window.__MAKEIT_CONFIG__?.QUALITY_URL ?? "/data/codex-quality.json";
}

function annotUrl(): string {
  return window.__MAKEIT_CONFIG__?.ANNOT_URL ?? "/data/annotations.json";
}

function pipelineUrl(): string {
  return window.__MAKEIT_CONFIG__?.PIPELINE_URL ?? "http://localhost:8766";
}

export async function fetchQualityData(): Promise<QualityPayload> {
  const r = await fetch(qualityUrl(), { cache: "no-cache" });
  if (!r.ok) throw new Error(`Quality fetch failed: ${r.status}`);
  const data = await r.json();
  if (data.schema_version !== 1) {
    throw new Error(`Unknown schema_version: ${data.schema_version}`);
  }
  return data as QualityPayload;
}

export async function fetchAnnotations(): Promise<Annotation[]> {
  const r = await fetch(annotUrl(), { cache: "no-cache" });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Annotations fetch failed: ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : (data.annotations ?? []);
}

export async function forceQualityRefresh(): Promise<QualityPayload> {
  const r = await fetch(`${pipelineUrl()}/quality/refresh`, { method: "POST" });
  if (r.status === 409) {
    throw new Error("Sweep уже выполняется — попробуйте через ~5 мин");
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Refresh failed: ${r.status}`);
  }
  return r.json();
}

export async function createAnnotation(
  p: AnnotationCreatePayload,
): Promise<Annotation> {
  const r = await fetch(`${pipelineUrl()}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
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
