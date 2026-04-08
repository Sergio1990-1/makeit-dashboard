/** API client for the Debate Engine (runs on makeit-pipeline server). */

import type {
  DebateStartRequest,
  DebateStatus,
  DebateResultResponse,
  DebateListItem,
  UserMessageRequest,
} from "../types/debate";
import { PIPELINE_BASE_URL } from "./config";

export async function startDebate(req: DebateStartRequest): Promise<{ id: string }> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/debate/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function getDebateStatus(id: string): Promise<DebateStatus> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/debate/${encodeURIComponent(id)}/status`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<DebateStatus>;
}

export async function getDebateResult(id: string): Promise<DebateResultResponse> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/debate/${encodeURIComponent(id)}/result`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<DebateResultResponse>;
}

export async function listDebates(): Promise<DebateListItem[]> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/debate/list`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<DebateListItem[]>;
}

export async function sendDebateMessage(id: string, req: UserMessageRequest): Promise<{ ok: boolean }> {
  const res = await fetch(`${PIPELINE_BASE_URL}/pipeline/debate/${encodeURIComponent(id)}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error((err as { detail: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}
