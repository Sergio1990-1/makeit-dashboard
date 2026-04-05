import Anthropic from "@anthropic-ai/sdk";
import type {
  AuditFinding,
  Verdict,
  VerificationReport,
  VerificationResult,
} from "../types";
import { createFileCache, verifyFinding } from "./verify-agent";

const VERIFY_MODEL = "claude-sonnet-4-20250514";

// mypy error codes that represent tooling/environment noise rather than
// code defects. Even though Phase A filters these at audit time, the
// dashboard tolerates legacy audits that still contain them by short-
// circuiting to a synthetic NOT_A_BUG verdict client-side (no Claude call).
const ENV_NOISE_CODES = [
  "import-not-found",
  "import-untyped",
  "attr-defined",
] as const;

// Group-inference threshold: if this many findings share the same
// (tool, error_code) fingerprint, we verify one and fan the verdict
// out to siblings. Matches the auditor collapse_repeated_threshold.
const BATCH_SKIP_MIN_GROUP_SIZE = 5;

export interface VerifyProgress {
  current: number; // 1-based count of findings processed
  total: number;
  currentFile: string;
  currentLine: number | null;
  confirmed: number;
  falsePositive: number;
  uncertain: number;
  notABug: number;
  errors: number;
  /** Findings short-circuited as NOT_A_BUG before any Claude call. */
  skippedAsNoise: number;
  /** Findings whose verdict was inferred from a group representative. */
  inferredFromGroup: number;
  /** Findings whose verdict was reused from a prior verification run. */
  cacheHits: number;
}

// Upper bound on findings included in verification / issue generation.
// Post-Phase-A audits are much cleaner (moliyakg: 352 → 81), so we can
// afford to verify medium severity too. When critical+high alone cover
// enough ground we stop there; otherwise we extend to medium up to this
// target. Applied identically in `generateIssuesFromFindings`.
export const VERIFICATION_TARGET_COUNT = 200;

/** Subset of findings actually sent to issues — mirrors `generateIssuesFromFindings`. */
export function selectFindingsForVerification(
  findings: AuditFinding[],
): { finding: AuditFinding; index: number }[] {
  // Start with critical + high, expand to medium until reaching the target.
  const indexed = findings.map((f, index) => ({ finding: f, index }));
  let filtered = indexed.filter(
    (f) => f.finding.severity === "critical" || f.finding.severity === "high",
  );
  if (filtered.length < VERIFICATION_TARGET_COUNT) {
    filtered = indexed.filter(
      (f) =>
        f.finding.severity === "critical" ||
        f.finding.severity === "high" ||
        f.finding.severity === "medium",
    );
  }
  return filtered;
}

/** Return true when a finding describes mypy environment noise. */
export function isEnvironmentNoise(f: AuditFinding): boolean {
  if (f.tool !== "mypy" && !f.tool.includes("mypy")) return false;
  const desc = f.description.trimStart();
  // Accept either "code: message" or "[affects N files] code: message".
  const stripped = desc.startsWith("[")
    ? desc.slice(desc.indexOf("]") + 1).trimStart()
    : desc;
  return ENV_NOISE_CODES.some((code) => stripped.startsWith(`${code}:`));
}

/**
 * Extract the (tool, error_code) fingerprint used for group-verdict inference.
 * Returns null when the description doesn't carry a parseable code prefix.
 */
function fingerprintFinding(f: AuditFinding): string | null {
  const desc = f.description.trimStart();
  const stripped = desc.startsWith("[")
    ? desc.slice(desc.indexOf("]") + 1).trimStart()
    : desc;
  const colonIdx = stripped.indexOf(":");
  if (colonIdx <= 0 || colonIdx > 40) return null;
  const code = stripped.slice(0, colonIdx).trim();
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  return `${f.tool}::${code}`;
}

function makeSyntheticResult(
  index: number,
  finding: AuditFinding,
  verdict: Verdict,
  reason: string,
  verifiedAt: string,
  model: string,
): VerificationResult {
  return {
    finding_index: index,
    verdict,
    reason,
    code_snippet: null,
    file: finding.file,
    line: finding.line,
    verified_at: verifiedAt,
    model,
    error: null,
  };
}

/**
 * Cache key for reusing prior verdicts across runs. We key only on
 * `file|line` because the prior VerificationResult does not store the
 * original finding description — indices and descriptions can shift when
 * the auditor is re-run (cross-file dedup reorders findings). Keying by
 * location alone accepts that if the auditor now reports a different
 * problem at the same file:line, we'll reuse the stale verdict; in
 * practice the common case (retry-failed-only, same-audit re-run) has
 * identical content and this is a safe trade-off. Findings without a
 * line number are not cached (key is unstable otherwise).
 */
function cacheKey(f: AuditFinding): string | null {
  if (f.line == null) return null;
  return `${f.file}|${f.line}`;
}

/**
 * Verify a batch of findings against actual code in the repo.
 *
 * Processes findings in parallel batches of `batchSize`. Each finding gets its
 * own Claude call with tool access to read code at specific file:line. Partial
 * progress reported via `onProgress` after every finding completes.
 *
 * Optimizations applied BEFORE any Claude call:
 *   1. `isEnvironmentNoise` — mypy tooling codes → synthetic NOT_A_BUG
 *   2. Prior verification cache (same file|line|description) → reuse verdict
 *   3. Group-inference: ≥5 findings with identical (tool, code) → verify one,
 *      fan verdict to siblings
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
  priorReport?: VerificationReport | null,
): Promise<VerificationReport> {
  const selected = selectFindingsForVerification(findings);
  const client = new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true });
  const cache = createFileCache();
  const verifiedAt0 = new Date().toISOString();

  // Build prior-verdict cache from an optional previous report. Key is
  // `file|line` (see cacheKey docstring) — resilient to finding-index shifts
  // caused by auditor re-runs. Only successful results populate the cache.
  const priorCache = new Map<string, VerificationResult>();
  if (priorReport?.results) {
    for (const r of priorReport.results) {
      if (r.error) continue;
      if (r.line == null) continue;
      priorCache.set(`${r.file}|${r.line}`, r);
    }
  }

  const results: VerificationResult[] = [];
  let confirmed = 0;
  let falsePositive = 0;
  let uncertain = 0;
  let notABug = 0;
  let errors = 0;
  let skippedAsNoise = 0;
  let inferredFromGroup = 0;
  let cacheHits = 0;

  function tallyVerdict(verdict: Verdict) {
    if (verdict === "CONFIRMED") confirmed++;
    else if (verdict === "FALSE_POSITIVE") falsePositive++;
    else if (verdict === "NOT_A_BUG") notABug++;
    else uncertain++;
  }

  // Phase 1 — short-circuit env-noise + cache hits. Build the pending list
  // for Claude in a second pass.
  const pending: { finding: AuditFinding; index: number; fingerprint: string | null }[] = [];

  for (const { finding, index } of selected) {
    // env-noise bypass
    if (isEnvironmentNoise(finding)) {
      const r = makeSyntheticResult(
        index,
        finding,
        "NOT_A_BUG",
        "filtered client-side as mypy environment noise (no code defect)",
        verifiedAt0,
        "env-noise-filter",
      );
      results.push(r);
      tallyVerdict("NOT_A_BUG");
      skippedAsNoise++;
      continue;
    }
    // cache hit
    const key = cacheKey(finding);
    const cached = key ? priorCache.get(key) : undefined;
    if (cached) {
      const r: VerificationResult = {
        ...cached,
        finding_index: index,
        file: finding.file,
        line: finding.line,
      };
      results.push(r);
      tallyVerdict(cached.verdict);
      cacheHits++;
      continue;
    }
    pending.push({ finding, index, fingerprint: fingerprintFinding(finding) });
  }

  // Phase 2 — group by fingerprint for batch-skip inference.
  // Groups ≥ BATCH_SKIP_MIN_GROUP_SIZE get one representative verified,
  // siblings inherit the verdict.
  const byFingerprint = new Map<string, typeof pending>();
  const ungrouped: typeof pending = [];
  for (const item of pending) {
    if (!item.fingerprint) {
      ungrouped.push(item);
      continue;
    }
    const list = byFingerprint.get(item.fingerprint) ?? [];
    list.push(item);
    byFingerprint.set(item.fingerprint, list);
  }

  const representatives: typeof pending = [...ungrouped];
  const siblingsByRepIdx = new Map<number, typeof pending>();

  for (const list of byFingerprint.values()) {
    if (list.length < BATCH_SKIP_MIN_GROUP_SIZE) {
      representatives.push(...list);
      continue;
    }
    const [rep, ...siblings] = list;
    representatives.push(rep);
    siblingsByRepIdx.set(rep.index, siblings);
  }

  const totalPlanned = selected.length;

  // Progress is emitted continuously across all phases; current counts up
  // over every finalized result (including synthetic).
  function emitProgress(file: string, line: number | null) {
    onProgress({
      current: results.length,
      total: totalPlanned,
      currentFile: file,
      currentLine: line,
      confirmed,
      falsePositive,
      uncertain,
      notABug,
      errors,
      skippedAsNoise,
      inferredFromGroup,
      cacheHits,
    });
  }

  // Emit an initial progress snapshot so the UI shows skipped/cached counts
  // even before Claude batches start.
  if (results.length > 0) {
    const last = results[results.length - 1];
    emitProgress(last.file, last.line);
  }

  // Phase 3 — verify representatives in parallel batches.
  for (let i = 0; i < representatives.length; i += batchSize) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const batch = representatives.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ finding, index }) =>
        verifyFinding(client, finding, index, githubToken, repoOwner, repoName, cache, signal),
      ),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      const rep = batch[j];
      results.push(r);
      // Mutually exclusive tally: errored findings count as `errors` only,
      // not also as `uncertain`, so the verify-summary panel's category sum
      // equals `total_findings` and the 15%-error-rate gate stays meaningful.
      if (r.error) errors++;
      else tallyVerdict(r.verdict);

      // Fan verdict out to siblings if this rep gated a group — but ONLY
      // when the rep succeeded. A single transient Claude error on the rep
      // otherwise poisons up to N-1 silently-UNCERTAIN siblings that also
      // wouldn't be picked up by "Retry failed only" (error: null).
      const siblings = siblingsByRepIdx.get(rep.index);
      if (siblings && siblings.length > 0) {
        const inferredAt = new Date().toISOString();
        for (const sib of siblings) {
          if (r.error) {
            // Propagate the error so Retry-failed-only picks siblings up too.
            const sibResult: VerificationResult = {
              finding_index: sib.index,
              verdict: "UNCERTAIN",
              reason: `rep verification failed: ${r.error}`,
              code_snippet: null,
              file: sib.finding.file,
              line: sib.finding.line,
              verified_at: inferredAt,
              model: `${r.model}+inferred`,
              error: r.error,
            };
            results.push(sibResult);
            errors++;
            continue;
          }
          const sibResult: VerificationResult = {
            finding_index: sib.index,
            verdict: r.verdict,
            reason: `inferred from group verdict at ${r.file}${r.line ? `:${r.line}` : ""}: ${r.reason}`,
            code_snippet: null,
            file: sib.finding.file,
            line: sib.finding.line,
            verified_at: inferredAt,
            model: `${r.model}+inferred`,
            error: null,
          };
          results.push(sibResult);
          tallyVerdict(r.verdict);
          inferredFromGroup++;
        }
      }
    }

    const last = batch[batch.length - 1];
    emitProgress(last.finding.file, last.finding.line);
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
    not_a_bug_count: notABug,
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
    not_a_bug_count: 0,
    error_count: 0,
    results,
  };
}
