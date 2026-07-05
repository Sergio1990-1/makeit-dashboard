/**
 * API client for the makeit-pipeline dictionary / client_context / ontology
 * endpoints (makeit-pipeline#1305, backend merged to main).
 *
 * These 5 endpoints have NO entry in the generated OpenAPI snapshot yet
 * (`src/types/generated/pipeline.openapi.json` predates this backend work) —
 * per the issue's own instructions this client hand-rolls its request/response
 * shapes instead of waiting on a snapshot regen, exactly like
 * `downloadTranscriptDocx` does in `transcript.ts` for the DOCX export
 * endpoint (also not in the generated client). Kept in its own file so
 * `transcript.ts` doesn't grow unrelated concerns.
 *
 * All 5 endpoints validate `project_slug` against the pipeline's configured
 * project list and return 404 (`{ detail: string }`) for an unconfigured
 * slug. `PUT /projects/{slug}/dictionary` additionally returns 409 when the
 * project's underlying file is a v2 ontology (people/business_entities/
 * categories) — a flat-terms editor cannot safely write to those projects.
 * Both cases are surfaced as thrown `Error`s carrying the backend's `detail`
 * message, mirroring `continueToBrief`/`regenerateBrief`'s
 * `extractErrorDetail` convention in `transcript.ts`.
 */

import { PIPELINE_BASE_URL } from "./config";

/** `GET/PUT /projects/{slug}/dictionary` response shape. */
export interface DictionaryResponse {
  project_slug: string;
  terms: Record<string, string>;
  is_v2_ontology: boolean;
}

/** `GET/PUT /projects/{slug}/client-context` response shape. */
export interface ClientContextResponse {
  project_slug: string;
  content: string;
}

export interface OntologyPerson {
  name: string;
  role?: string;
  aliases: string[];
}

export interface OntologyCategoryTerm {
  canonical: string;
  stt_variants: string[];
}

export interface OntologyClientMeta {
  primary_currency?: string;
  industry?: string;
  accounting_systems_used: string[];
}

/** Serialized `DomainOntology` — see `GET /projects/{slug}/ontology`. */
export interface DomainOntology {
  version: string;
  domain: string | null;
  flat_terms: Record<string, string>;
  categories: Record<string, OntologyCategoryTerm[]>;
  people: OntologyPerson[];
  business_entities: OntologyCategoryTerm[];
  business_processes: string[];
  pain_signals: string[];
  speech_act_markers: Record<string, string[]>;
  client_meta: OntologyClientMeta | null;
  known_pain_points: string[];
}

/** `GET /projects/{slug}/ontology` response shape. */
export interface OntologyResponse {
  project_slug: string;
  ontology: DomainOntology;
}

/**
 * FastAPI error bodies are `{"detail": "..."}` JSON. Falls back to the raw
 * text if it isn't JSON or has no string `detail` — same convention as
 * `extractErrorDetail` in `transcript.ts`.
 */
async function extractErrorDetail(res: Response): Promise<string> {
  const rawText = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(rawText) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail) return parsed.detail;
  } catch {
    /* not JSON — fall through to raw text */
  }
  return rawText || `HTTP ${res.status}`;
}

export async function fetchDictionary(projectSlug: string): Promise<DictionaryResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/projects/${encodeURIComponent(projectSlug)}/dictionary`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    if (res.status === 404) throw new Error(`Проект не настроен в pipeline: ${detail}`);
    throw new Error(`Не удалось загрузить словарь (${res.status}): ${detail}`);
  }
  return res.json();
}

/**
 * Returns HTTP 409 when the project's underlying file is a v2 ontology
 * (people/business_entities/categories) — a flat-terms editor cannot safely
 * write to those projects yet. Callers should check `is_v2_ontology` on the
 * prior GET and avoid calling this at all in that case; the 409 is handled
 * here too as defense-in-depth.
 */
export async function saveDictionary(
  projectSlug: string,
  terms: Record<string, string>,
): Promise<DictionaryResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/projects/${encodeURIComponent(projectSlug)}/dictionary`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms }),
    },
  );
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    if (res.status === 404) throw new Error(`Проект не настроен в pipeline: ${detail}`);
    if (res.status === 409) {
      throw new Error(
        `У этого проекта расширенная онтология (v2) — редактирование через этот интерфейс пока не поддерживается: ${detail}`,
      );
    }
    throw new Error(`Не удалось сохранить словарь (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function fetchClientContext(projectSlug: string): Promise<ClientContextResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/projects/${encodeURIComponent(projectSlug)}/client-context`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    if (res.status === 404) throw new Error(`Проект не настроен в pipeline: ${detail}`);
    throw new Error(`Не удалось загрузить client_context (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function saveClientContext(
  projectSlug: string,
  content: string,
): Promise<ClientContextResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/projects/${encodeURIComponent(projectSlug)}/client-context`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    if (res.status === 404) throw new Error(`Проект не настроен в pipeline: ${detail}`);
    throw new Error(`Не удалось сохранить client_context (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function fetchOntology(projectSlug: string): Promise<OntologyResponse> {
  const res = await fetch(
    `${PIPELINE_BASE_URL}/projects/${encodeURIComponent(projectSlug)}/ontology`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    if (res.status === 404) throw new Error(`Проект не настроен в pipeline: ${detail}`);
    throw new Error(`Не удалось загрузить онтологию (${res.status}): ${detail}`);
  }
  return res.json();
}
