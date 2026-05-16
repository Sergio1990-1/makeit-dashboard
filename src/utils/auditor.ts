import type { AuditProjectStatus, AuditRunStatus, AuditFindings, VerificationReport } from "../types";
import type { components } from "../types/generated/auditor";

// Request bodies the makeit-auditor backend declares as typed Pydantic
// models (source of truth, #447). Deriving them here makes `tsc` fail if
// the backend changes the wire contract and the snapshot is refreshed.
type AuditMetaRequest = components["schemas"]["AuditMetaRequest"];
type VerificationReportRequest = components["schemas"]["VerificationReportRequest"];

const AUDITOR_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { AUDITOR_URL?: string } }).__MAKEIT_CONFIG__?.AUDITOR_URL
  ?? "http://127.0.0.1:8765";

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
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${AUDITOR_BASE_URL}/api/projects`, {
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    return res.ok;
  } catch {
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
  const body: AuditMetaRequest = {
    issues_created: issuesCreated,
    issue_urls: issueUrls,
  };
  const res = await fetch(`${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP error: ${res.status}`);
  }
}

export async function fetchAuditVerification(project: string): Promise<VerificationReport> {
  const res = await fetch(
    `${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/verification`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP error: ${res.status}`);
  }
  return res.json();
}

export async function postAuditVerification(
  project: string,
  // `project` is a path param, not part of the body — callers pass the
  // report with `project` stripped. The backend owns the body contract via
  // `VerificationReportRequest` (#447). Drift reconciled toward the backend:
  // the backend REQUIRES `not_a_bug_count` (pydantic default 0), while the
  // frontend `VerificationReport` historically marked it optional ("absent
  // on legacy reports; treat undefined as 0"). We normalize it here so the
  // sent body always satisfies the backend contract. Behavior is unchanged:
  // every report this app builds already sets it, and `undefined` would be
  // dropped by JSON.stringify and defaulted to 0 by the backend anyway.
  report: Omit<VerificationReport, "project">,
): Promise<void> {
  const body: VerificationReportRequest = {
    ...report,
    not_a_bug_count: report.not_a_bug_count ?? 0,
  };
  const res = await fetch(
    `${AUDITOR_BASE_URL}/api/audit/${encodeURIComponent(project)}/verification`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP error: ${res.status}`);
  }
}
