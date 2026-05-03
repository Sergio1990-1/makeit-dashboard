// Layer-4 drift detector: ai_contract_milestones_sync.
//
// Compares `docs/CONTRACT_STAGES.md` against the repo's GitHub milestones
// using Claude haiku with a single forced tool call. Only runs for
// client-tier projects (gated by orchestrator + defensive check here).
//
// Returns an `unknown` HealthFinding for any preconditional miss (no
// claude key, missing CONTRACT_STAGES, listMilestones error, LLM error,
// low-confidence reply) — the detector never throws.

import type { HealthFinding } from "../../types/health";
import { callClaudeWithTool } from "../claude";
import { listMilestones, readRepoFile } from "../github-actions";
import type { DetectorArgs } from "../health-llm";

// Truncation budget for the markdown evidence: keeps a single haiku call
// well under $0.01 (haiku in @ ≈ $1/MTok input, $5/MTok output, max_tokens=1024).
// 8000 chars ≈ 2k tokens; milestones JSON adds another few hundred at most.
const MAX_MARKDOWN_CHARS = 8000;
const MAX_DETAIL_CHARS = 250;
const CONFIDENCE_THRESHOLD = 0.7;
const MODEL = "claude-haiku-4-5-20251001" as const;
const MAX_TOKENS = 1024;

const TOOL_DEF = {
  name: "report_finding",
  description: "Report sync result",
  input_schema: {
    type: "object",
    properties: {
      status: { enum: ["pass", "fail"] },
      detail: { type: "string", maxLength: 250 },
      remediation: { type: "string", maxLength: 400 },
      confidence: { type: "number" },
    },
    required: ["status", "detail", "confidence"],
  },
} as const;

const SYSTEM_PROMPT =
  "Ты помощник, который проверяет согласованность контрактных этапов проекта с milestones в GitHub.";

interface LLMResult {
  status: "pass" | "fail";
  detail: string;
  remediation?: string;
  confidence: number;
}

// Mirror of health-llm.ts:findingBase — duplicated to keep it private there.
function baseFinding(rule: DetectorArgs["rule"]): Omit<HealthFinding, "status" | "detail"> {
  return {
    rule_id: rule.id,
    title: rule.title,
    layer: rule.layer,
    severity: rule.severity,
    remediation: rule.remediation,
    source: rule.source,
  };
}

function unknownFinding(
  rule: DetectorArgs["rule"],
  detail: string,
): HealthFinding {
  return { ...baseFinding(rule), status: "unknown", detail };
}

export async function checkContractMilestonesSync(
  args: DetectorArgs,
): Promise<HealthFinding> {
  const { rule, token, owner, repo, classification, claudeKey } = args;

  // Defensive client-tier gate — orchestrator's applies_to filter already
  // handles this, but a misconfigured rule shouldn't accidentally LLM-call.
  if (!classification.client) {
    return unknownFinding(rule, "Не применимо: проект не client-tier");
  }

  // Don't burn an API call (or surface a confusing error) when key is absent.
  if (!claudeKey || !claudeKey.trim()) {
    return unknownFinding(rule, "Claude API ключ не задан");
  }

  // Gather evidence in parallel. allSettled so a milestones-API failure
  // doesn't drop the markdown read result (and vice versa) — both halves
  // surface their own diagnostic.
  const [contractRes, milestonesRes] = await Promise.allSettled([
    readRepoFile(token, owner, repo, "docs/CONTRACT_STAGES.md"),
    listMilestones(token, owner, repo),
  ]);

  if (contractRes.status === "rejected") {
    const msg = contractRes.reason instanceof Error ? contractRes.reason.message : "ошибка";
    // 404 = file genuinely missing; the file_exists rule covers reporting it.
    if (/\b404\b/.test(msg)) {
      return unknownFinding(rule, "docs/CONTRACT_STAGES.md не найден");
    }
    return unknownFinding(rule, `Не удалось прочитать docs/CONTRACT_STAGES.md: ${msg}`);
  }

  if (milestonesRes.status === "rejected") {
    const msg = milestonesRes.reason instanceof Error ? milestonesRes.reason.message : "ошибка";
    return unknownFinding(rule, `Не удалось получить milestones: ${msg}`);
  }

  const markdown = contractRes.value.slice(0, MAX_MARKDOWN_CHARS);
  // Project to the documented six fields and serialize compactly to bound
  // input size. Empty array is fine — we let the model interpret it.
  const milestonesProjected = milestonesRes.value.map((m) => ({
    number: m.number,
    title: m.title,
    state: m.state,
    due_on: m.due_on,
    open_issues: m.open_issues,
    closed_issues: m.closed_issues,
  }));
  const milestonesJson = JSON.stringify(milestonesProjected);

  const userMessage = `Вот содержимое CONTRACT_STAGES.md:
---
${markdown}
---
Вот milestones репо:
${milestonesJson}

Найди расхождения:
- этап в CONTRACT_STAGES помечен «в работе», но milestone закрыт (или наоборот)
- этап ссылается на \`Epic-NNN\` которого нет среди milestones
- даты не совпадают
- статусы не совпадают

Если расхождений нет → status pass, detail «Контракт синхронизирован с milestones (N этапов)».
Если есть → status fail, detail с конкретными расхождениями (≤ 200 chars).`;

  let result: LLMResult;
  try {
    result = await callClaudeWithTool<LLMResult>(
      claudeKey,
      SYSTEM_PROMPT,
      userMessage,
      TOOL_DEF,
      MODEL,
      MAX_TOKENS,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    return unknownFinding(rule, `Ошибка LLM: ${msg}`);
  }

  const confidence = typeof result.confidence === "number" ? result.confidence : 0;
  const remediation =
    typeof result.remediation === "string" && result.remediation.trim()
      ? result.remediation
      : rule.remediation;

  if (confidence < CONFIDENCE_THRESHOLD) {
    const pct = Math.round(confidence * 100);
    const detail = `(уверенность ${pct}%) ${result.detail}`.slice(0, MAX_DETAIL_CHARS);
    return {
      ...baseFinding(rule),
      status: "unknown",
      detail,
      remediation,
    };
  }

  return {
    ...baseFinding(rule),
    status: result.status,
    detail: result.detail.slice(0, MAX_DETAIL_CHARS),
    remediation,
  };
}
