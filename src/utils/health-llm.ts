// Layer 4 (drift / AI) orchestrator. Runs LLM-driven checks with limited
// concurrency, tree-sha-keyed cache, and progress callback for the UI.
//
// In task-02 all detectors are stubs that return `unknown` — the real
// implementations land in task-03..07. The orchestrator and routing are
// stable so swapping each stub is a one-line change.

import type {
  ChecklistDocument,
  ChecklistRule,
  HealthFinding,
  ProjectClassification,
} from "../types/health";
import { getRepoTreeSha } from "./github-actions";
import { getCached, setCached } from "./health-llm-cache";
import { Semaphore } from "./semaphore";

export interface DriftScanProgress {
  done: number;
  total: number;
  currentRule: string;
}

export interface DriftScanResult {
  findings: HealthFinding[];
  /** ISO timestamp the scan finished. */
  scannedAt: string;
  /** Cumulative cost (USD) — populated once detectors track real LLM spend. */
  costEstimate?: number;
  /** Rule ids that were served from cache (no detector invocation). */
  cachedRuleIds: Set<string>;
}

// Mirror health-engine.ts:ruleApplies — duplicated rather than exported to
// keep health-engine surface area stable. If this diverges in the future
// we'll lift it into a shared util.
function ruleApplies(rule: ChecklistRule, cls: ProjectClassification): boolean {
  const a = rule.applies_to ?? {};
  if (a.tiers && !a.tiers.includes(cls.tier)) return false;
  if (a.complex !== undefined && a.complex !== cls.complex) return false;
  if (a.client !== undefined && a.client !== cls.client) return false;
  return true;
}

// Anthropic's per-key concurrency on the Messages API is generous, but the
// sonnet/opus tiers see secondary rate-limit headers around 5 in-flight.
// 2 keeps comfortable headroom and is plenty for ~5 Layer-4 rules per repo.
const DRIFT_CONCURRENCY = 2;

// Build the no-status/no-detail base of a finding — so each detector
// stub (and future real impl) only fills in `status` and `detail`.
function findingBase(rule: ChecklistRule): Omit<HealthFinding, "status" | "detail"> {
  return {
    rule_id: rule.id,
    title: rule.title,
    layer: rule.layer,
    severity: rule.severity,
    remediation: rule.remediation,
    source: rule.source,
  };
}

// ── Detector stubs (task-03..07 will replace these) ───────────────────
// Each TBD detector accepts the same signature as a real one will so the
// switchboard below doesn't need to change when a real impl lands.

// Common stub helpers — keep `claudeKey` typed even though we don't use it
// yet, so swapping in the real impl doesn't change the signature.
type DetectorArgs = {
  rule: ChecklistRule;
  token: string;
  owner: string;
  repo: string;
  doc: ChecklistDocument;
  classification: ProjectClassification;
  claudeKey: string;
};

async function checkTemplateFilled_TBD(args: DetectorArgs): Promise<HealthFinding> {
  return { ...findingBase(args.rule), status: "unknown", detail: "Будет реализовано в task-03" };
}

async function checkContractMilestonesSync_TBD(args: DetectorArgs): Promise<HealthFinding> {
  return { ...findingBase(args.rule), status: "unknown", detail: "Будет реализовано в task-04" };
}

async function checkDocCodeSync_TBD(args: DetectorArgs): Promise<HealthFinding> {
  return { ...findingBase(args.rule), status: "unknown", detail: "Будет реализовано в task-05" };
}

async function checkKnowledgeCoverage_TBD(args: DetectorArgs): Promise<HealthFinding> {
  return { ...findingBase(args.rule), status: "unknown", detail: "Будет реализовано в task-06" };
}

async function checkClaudeMdFreshness_TBD(args: DetectorArgs): Promise<HealthFinding> {
  return { ...findingBase(args.rule), status: "unknown", detail: "Будет реализовано в task-07" };
}

// Routing: rule → detector. We dispatch on `rule.check.type` because that's
// the existing convention used by health-engine.ts for the synchronous layers
// — the YAML rule sets `check.type: ai_template_filled` etc., regardless of
// the rule's id (which is a human label like `drift.brief_template_filled`).
type Detector = (args: DetectorArgs) => Promise<HealthFinding>;

function detectorFor(rule: ChecklistRule): Detector | null {
  const checkType = String(rule.check?.type ?? "");
  switch (checkType) {
    case "ai_template_filled":
      return checkTemplateFilled_TBD;
    case "ai_contract_milestones_sync":
      return checkContractMilestonesSync_TBD;
    case "ai_doc_code_sync":
      return checkDocCodeSync_TBD;
    case "ai_knowledge_coverage":
      return checkKnowledgeCoverage_TBD;
    case "ai_claude_md_freshness":
      return checkClaudeMdFreshness_TBD;
    default:
      return null;
  }
}

/**
 * Run all applicable Layer-4 (drift / AI) checks for `repo`.
 *
 * Behaviour:
 * - Filters `doc.rules` by `layer === 4` AND `ruleApplies(rule, classification)`.
 * - Looks up each rule in the localStorage cache keyed by repo tree-sha;
 *   on hit, reuses the cached finding without invoking the detector.
 * - Otherwise runs the detector with `DRIFT_CONCURRENCY` parallelism via
 *   Semaphore — keeps Anthropic rate-limits comfortable.
 * - Reports progress via `onProgress` after each rule completes (cache hit
 *   or miss). Counter is monotonic and total reflects the filtered set.
 *
 * The orchestrator is total — detector throws are caught and surfaced as
 * `unknown` findings so a single bad rule can't abort the scan.
 */
export async function runDriftScan(
  token: string,
  owner: string,
  repo: string,
  doc: ChecklistDocument,
  classification: ProjectClassification,
  claudeKey: string,
  onProgress?: (p: DriftScanProgress) => void,
): Promise<DriftScanResult> {
  // Filter to applicable Layer-4 rules. The applies_to gate prevents drift
  // checks for client-only rules from running on internal projects.
  const applicable = doc.rules.filter(
    (r) => r.layer === 4 && ruleApplies(r, classification),
  );

  // Graceful no-op when the repo has no Layer-4 surface area.
  if (applicable.length === 0) {
    return { findings: [], scannedAt: new Date().toISOString(), cachedRuleIds: new Set() };
  }

  // Resolve the tree sha once per scan — drives the cache key and lets
  // every cache hit share invalidation when the repo changes. If the lookup
  // fails we run the scan uncached rather than aborting; using a sentinel
  // string would risk polluting the cache with stale entries that survive
  // the actual repo change.
  let treeSha: string | null = null;
  try {
    const { treeSha: resolved } = await getRepoTreeSha(token, owner, repo);
    treeSha = resolved;
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[drift] getRepoTreeSha failed:", err);
  }

  const total = applicable.length;
  let done = 0;
  // JS is single-threaded — `done += 1` is atomic. Ordering is by completion,
  // not by rule index, so `currentRule` reflects the rule that just finished.
  const reportProgress = (currentRule: string) => {
    done += 1;
    onProgress?.({ done, total, currentRule });
  };

  const cachedRuleIds = new Set<string>();
  const sem = new Semaphore(DRIFT_CONCURRENCY);
  const findings: HealthFinding[] = await Promise.all(
    applicable.map((rule) =>
      sem.run(async () => {
        // Cache lookup first — avoids both LLM and GitHub calls on hit.
        // Skip entirely when treeSha couldn't be resolved (uncached run).
        const cached = treeSha ? getCached(repo, treeSha, rule.id) : null;
        if (cached) {
          cachedRuleIds.add(rule.id);
          reportProgress(rule.id);
          return cached;
        }

        const detector = detectorFor(rule);
        // We only cache findings produced by a successful detector call.
        // Stub-routing failures (`detector === null`) and detector throws are
        // transient configuration / environmental problems — caching them
        // would leave the rule wedged on `unknown` until the target repo's
        // tree changes, even after the YAML or LLM service is fixed.
        let finding: HealthFinding;
        let cacheable = false;
        if (!detector) {
          // Layer-4 rule with an unknown check.type — surface as unknown so
          // missing routes don't silently disappear. This is the same
          // pattern health-engine.ts uses for unknown sync types.
          finding = {
            ...findingBase(rule),
            status: "unknown",
            detail: `Неизвестный тип drift-проверки: ${String(rule.check?.type ?? "—")}`,
          };
        } else {
          try {
            finding = await detector({
              rule,
              token,
              owner,
              repo,
              doc,
              classification,
              claudeKey,
            });
            cacheable = true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "ошибка";
            finding = {
              ...findingBase(rule),
              status: "unknown",
              detail: `Ошибка drift-проверки: ${msg}`,
            };
          }
        }

        // Persist to cache only when:
        //  - we have a real tree sha (otherwise the cache entry would survive
        //    the repo-change it was supposed to be invalidated by), and
        //  - the finding came from a successful detector run.
        // setCached swallows storage errors internally.
        if (treeSha && cacheable) setCached(repo, treeSha, rule.id, finding);
        reportProgress(rule.id);
        return finding;
      }),
    ),
  );

  return { findings, scannedAt: new Date().toISOString(), cachedRuleIds };
}
