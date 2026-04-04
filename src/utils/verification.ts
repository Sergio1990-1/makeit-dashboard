import Anthropic from "@anthropic-ai/sdk";
import type { AuditFinding, VerificationReport, VerificationResult } from "../types";
import { createFileCache, verifyFinding } from "./verify-agent";

const VERIFY_MODEL = "claude-sonnet-4-20250514";

export interface VerifyProgress {
  current: number; // 1-based count of findings processed
  total: number;
  currentFile: string;
  currentLine: number | null;
  confirmed: number;
  falsePositive: number;
  uncertain: number;
  errors: number;
}

/** Subset of findings actually sent to issues — mirrors `generateIssuesFromFindings`. */
export function selectFindingsForVerification(
  findings: AuditFinding[],
): { finding: AuditFinding; index: number }[] {
  // Start with critical + high, expand to medium if < 30 (same rule as issue generation)
  const indexed = findings.map((f, index) => ({ finding: f, index }));
  let filtered = indexed.filter(
    (f) => f.finding.severity === "critical" || f.finding.severity === "high",
  );
  if (filtered.length < 30) {
    filtered = indexed.filter(
      (f) =>
        f.finding.severity === "critical" ||
        f.finding.severity === "high" ||
        f.finding.severity === "medium",
    );
  }
  return filtered;
}

/**
 * Verify a batch of findings against actual code in the repo.
 *
 * Processes findings in parallel batches of `batchSize`. Each finding gets its
 * own Claude call with tool access to read code at specific file:line. Partial
 * progress reported via `onProgress` after every finding completes.
 *
 * On abort: throws AbortError; caller discards partial results.
 */
export async function verifyFindings(
  findings: AuditFinding[],
  repoOwner: string,
  repoName: string,
  auditTimestamp: string,
  githubToken: string,
  anthropicApiKey: string,
  project: string,
  onProgress: (p: VerifyProgress) => void,
  signal: AbortSignal,
  batchSize = 5,
): Promise<VerificationReport> {
  const selected = selectFindingsForVerification(findings);
  const client = new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true });
  const cache = createFileCache();

  const results: VerificationResult[] = [];
  let confirmed = 0;
  let falsePositive = 0;
  let uncertain = 0;
  let errors = 0;

  for (let i = 0; i < selected.length; i += batchSize) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const batch = selected.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ finding, index }) =>
        verifyFinding(client, finding, index, githubToken, repoOwner, repoName, cache, signal),
      ),
    );

    for (const r of batchResults) {
      results.push(r);
      if (r.error) errors++;
      if (r.verdict === "CONFIRMED") confirmed++;
      else if (r.verdict === "FALSE_POSITIVE") falsePositive++;
      else uncertain++;
    }

    const last = batch[batch.length - 1];
    onProgress({
      current: Math.min(i + batch.length, selected.length),
      total: selected.length,
      currentFile: last.finding.file,
      currentLine: last.finding.line,
      confirmed,
      falsePositive,
      uncertain,
      errors,
    });
  }

  return {
    project,
    audit_timestamp: auditTimestamp,
    verified_at: new Date().toISOString(),
    model: VERIFY_MODEL,
    total_findings: selected.length,
    confirmed_count: confirmed,
    false_positive_count: falsePositive,
    uncertain_count: uncertain,
    error_count: errors,
    results,
  };
}

/**
 * Build a synthetic "skipped" verification report — all findings marked UNCERTAIN
 * so they pass through with needs-human label.
 */
export function buildSkippedVerification(
  findings: AuditFinding[],
  project: string,
  auditTimestamp: string,
): VerificationReport {
  const selected = selectFindingsForVerification(findings);
  const now = new Date().toISOString();
  const results: VerificationResult[] = selected.map(({ finding, index }) => ({
    finding_index: index,
    verdict: "UNCERTAIN" as const,
    reason: "skipped by user — verification bypassed",
    code_snippet: null,
    file: finding.file,
    line: finding.line,
    verified_at: now,
    model: "skipped",
    error: null,
  }));
  return {
    project,
    audit_timestamp: auditTimestamp,
    verified_at: now,
    model: "skipped",
    total_findings: selected.length,
    confirmed_count: 0,
    false_positive_count: 0,
    uncertain_count: selected.length,
    error_count: 0,
    results,
  };
}
