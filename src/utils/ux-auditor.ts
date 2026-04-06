import type { UXAuditRunStatus, UXAuditResults } from "../types";

const AUDITOR_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { AUDITOR_URL?: string } }).__MAKEIT_CONFIG__?.AUDITOR_URL
  ?? "http://127.0.0.1:8765";

export async function startUXAudit(project: string): Promise<void> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/ux/${encodeURIComponent(project)}/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP error: ${res.status}`);
  }
}

export async function cancelUXAudit(project: string): Promise<void> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/ux/${encodeURIComponent(project)}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP error: ${res.status}`);
  }
}

export async function fetchUXStatus(project: string): Promise<UXAuditRunStatus> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/ux/${encodeURIComponent(project)}/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
}

export async function fetchUXResults(project: string): Promise<UXAuditResults> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/ux/${encodeURIComponent(project)}/results`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
}
