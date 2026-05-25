/** API client for Quality endpoints (part of makeit-pipeline server). */

import type {
  QualitySnapshot,
  QualityTrends,
  QualityFindingsDistribution,
  QualityErrorsDistribution,
  PendingChange,
  TuningApplyResult,
  TuningActionResult,
  RetroSummary,
  RetroDetail,
  RetroRunResult,
  QualityConfig,
  QualityConfigUpdate,
  LessonsFileResponse,
  ApplyPreview,
  BulkRejectResult,
} from "../types";
import type {
  QualityPayload,
  Annotation,
  AnnotationCreatePayload,
} from "../types/quality";
import { PIPELINE_BASE_URL } from "./config";

declare global {
  interface Window {
    __MAKEIT_CONFIG__?: {
      QUALITY_URL?: string;
      PIPELINE_URL?: string;
      ANNOT_URL?: string;
    };
  }
}

// ── Quality KPI ──────────────────────────────────────────────────────

export async function fetchQualitySnapshot(
  project?: string,
): Promise<QualitySnapshot> {
  const params = new URLSearchParams();
  if (project) params.set("project", project);
  const qs = params.toString();
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/snapshot${qs ? `?${qs}` : ""}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchQualityTrends(
  weeks = 12,
  project?: string,
): Promise<QualityTrends> {
  const params = new URLSearchParams({ weeks: String(weeks) });
  if (project) params.set("project", project);
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/trends?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchQualityFindings(
  weeks = 4,
  project?: string,
): Promise<QualityFindingsDistribution> {
  const params = new URLSearchParams({ weeks: String(weeks) });
  if (project) params.set("project", project);
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/findings?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchQualityErrors(
  weeks = 4,
  project?: string,
): Promise<QualityErrorsDistribution> {
  const params = new URLSearchParams({ weeks: String(weeks) });
  if (project) params.set("project", project);
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/errors?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── AutoTuner (Pending Changes) ──────────────────────────────────────

export async function fetchPendingChanges(
  opts: { project?: string; tier?: number } = {},
): Promise<PendingChange[]> {
  const params = new URLSearchParams();
  if (opts.project) params.set("project", opts.project);
  if (opts.tier !== undefined) params.set("tier", String(opts.tier));
  const qs = params.toString();
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/pending${qs ? `?${qs}` : ""}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: { changes: PendingChange[] } = await res.json();
  return data.changes;
}

export async function applyChange(changeId: string): Promise<TuningApplyResult> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/pending/${encodeURIComponent(changeId)}/apply`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function rejectChange(changeId: string): Promise<TuningActionResult> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/pending/${encodeURIComponent(changeId)}/reject`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function rollbackChange(changeId: string): Promise<TuningActionResult> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/pending/${encodeURIComponent(changeId)}/rollback`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchTuningHistory(
  limit = 50,
  opts: { project?: string; tier?: number } = {},
): Promise<PendingChange[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.project) params.set("project", opts.project);
  if (opts.tier !== undefined) params.set("tier", String(opts.tier));
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/tuning-history?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: { changes: PendingChange[] } = await res.json();
  return data.changes;
}

// ── Phase F1: quality config, lessons viewer, preview, bulk reject ──

export async function fetchQualityConfig(): Promise<QualityConfig> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/quality/config`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateQualityConfig(
  update: QualityConfigUpdate,
): Promise<QualityConfig> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/quality/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchLessons(projectSlug: string): Promise<LessonsFileResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/lessons/${encodeURIComponent(projectSlug)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function previewPendingChange(changeId: string): Promise<ApplyPreview> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/pending/${encodeURIComponent(changeId)}/preview`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function bulkRejectChanges(
  ids: string[],
  reason = "bulk_manual",
): Promise<BulkRejectResult> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/quality/bulk-reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Retrospectives ───────────────────────────────────────────────────

export async function fetchRetroList(): Promise<RetroSummary[]> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/retros`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: { retros: RetroSummary[] } = await res.json();
  return data.retros;
}

export async function fetchRetroDetail(period: string): Promise<RetroDetail> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/retros/${encodeURIComponent(period)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function runRetro(period?: string): Promise<RetroRunResult> {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  const qs = params.toString();
  const res = await fetch(
    `${PIPELINE_BASE_URL}/pipeline/quality/retro/run${qs ? `?${qs}` : ""}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Codex Quality Tab (Task 16) ──────────────────────────────────────
//
// New API surface for the «Качество кода и изменения» tab. Lives alongside
// the legacy AutoTuner/quality-KPI client above because both belong to the
// same conceptual "quality" namespace; types come from `src/types/quality.ts`
// (Task 14). URL resolution uses runtime `window.__MAKEIT_CONFIG__` so the
// same bundle can point at local pipeline (8766) or a VPS-side aggregator.

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
