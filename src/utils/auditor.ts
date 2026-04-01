import type { AuditProjectStatus, AuditRunStatus, AuditFindings } from "../types";

const AUDITOR_BASE_URL = "http://127.0.0.1:8765";

export async function fetchAuditProjects(): Promise<AuditProjectStatus[]> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/projects`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
}

export async function fetchAuditStatus(project: string): Promise<AuditRunStatus> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
}

export async function fetchAuditFindings(project: string): Promise<AuditFindings> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/findings`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
}

export async function isAuditorRunning(): Promise<boolean> {
  try {
    // Timeout applied via AbortController to avoid hanging on connection refused
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    
    const res = await fetch(`${AUDITOR_BASE_URL}/api/projects`, {
      signal: controller.signal,
      cache: "no-store",
    });
    
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function startAuditRun(project: string): Promise<void> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP error: ${res.status}`);
  }
}

export async function cancelAuditRun(project: string): Promise<void> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP error: ${res.status}`);
  }
}

export async function postAuditMeta(
  project: string,
  issuesCreated: number,
  issueUrls: string[],
): Promise<void> {
  const res = await fetch(`${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issues_created: issuesCreated, issue_urls: issueUrls }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP error: ${res.status}`);
  }
}
