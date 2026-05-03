// Layer-4 drift detector: ai_doc_code_sync.
//
// Compares `docs/STATE_MACHINES.md` against the FSM-related code in the repo
// using Claude opus with a single forced tool call. Only runs for complex
// projects (gated by orchestrator + defensive check here).
//
// Evidence collector:
//   1. readRepoFile("docs/STATE_MACHINES.md") — markdown describing the FSM(s).
//   2. searchCodeSymbol("status", 20) — primary symbol search (status enums,
//      FSM validators). Optional secondary searches for "state"/"phase" only
//      when those words appear in the doc, deduped by path, capped at 20 hits.
//
// Returns an `unknown` HealthFinding for any preconditional miss (no claude
// key, missing STATE_MACHINES.md, code-search rate-limit / not-indexed, LLM
// error, low-confidence reply) — the detector never throws.
//
// Cost guardrails (per scan):
//   markdown ≤ 12 000 chars + 20 hits × 300 chars + ~600 chars scaffolding
//   ≈ 18 600 chars ≈ 4.6k input tokens; max_tokens = 2048 output.
//   Opus pricing (~$15/MTok input, $75/MTok output):
//     input  ≈ $0.069
//     output ≈ $0.154
//     total  ≈ $0.22 / scan — comfortably below the spec cap of $0.30.

import type { HealthFinding } from "../../types/health";
import { callClaudeWithTool } from "../claude";
import { readRepoFile, searchCodeSymbol } from "../github-actions";
import type { CodeSearchHit } from "../github-actions";
import type { DetectorArgs } from "../health-llm";

// Truncation budgets — bounded so opus cost stays predictable.
const MAX_MARKDOWN_CHARS = 12000;
const MAX_FRAGMENT_CHARS = 300;
const MAX_HITS = 20;
const MAX_DETAIL_CHARS = 250;
const CONFIDENCE_THRESHOLD = 0.7;
const MODEL = "claude-opus-4-7" as const;
const MAX_TOKENS = 2048;

const TOOL_DEF = {
  name: "report_finding",
  description: "Report sync result",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["pass", "fail"] },
      detail: { type: "string", maxLength: 250 },
      remediation: { type: "string", maxLength: 400 },
      confidence: { type: "number" },
    },
    required: ["status", "detail", "confidence"],
  },
} as const;

const SYSTEM_PROMPT =
  "Ты сверяешь описание статусной машины в документации со статусами в коде.";

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

// Run a single code-search and translate the well-known error classes into
// graceful `unknown`-finding signals. Returns:
//  - { hits } on success (possibly empty array)
//  - { unknownDetail } for rate-limit / not-indexed (caller short-circuits)
//  - { hits: [] } for any other error (logged in DEV; treated as zero hits)
async function safeSymbolSearch(
  token: string,
  owner: string,
  repo: string,
  symbol: string,
  perPage: number,
): Promise<{ hits: CodeSearchHit[]; unknownDetail?: string }> {
  try {
    const hits = await searchCodeSymbol(token, owner, repo, symbol, perPage);
    return { hits };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    if (/rate.?limit/i.test(msg)) {
      return { hits: [], unknownDetail: "Code search rate-limited" };
    }
    if (/not indexed/i.test(msg) || /\b422\b/.test(msg)) {
      return { hits: [], unknownDetail: "Repo не индексирован GitHub code search" };
    }
    if (import.meta.env.DEV) {
      console.warn(`[docCodeSync] code search "${symbol}" failed:`, err);
    }
    return { hits: [] };
  }
}

export async function checkDocCodeSync(
  args: DetectorArgs,
): Promise<HealthFinding> {
  const { rule, token, owner, repo, classification, claudeKey } = args;

  // Defensive complex-tier gate — orchestrator's applies_to filter already
  // handles this, but a misconfigured rule shouldn't accidentally LLM-call.
  if (classification.complex !== true) {
    return unknownFinding(rule, "Не применимо: проект не complex-tier");
  }

  // Don't burn an API call (or surface a confusing error) when key is absent.
  if (!claudeKey || !claudeKey.trim()) {
    return unknownFinding(rule, "Claude API ключ не задан");
  }

  // Step 1 — read the doc. Run in isolation so a search-API failure can't
  // mask a 404 (and vice versa).
  let markdown: string;
  try {
    markdown = await readRepoFile(token, owner, repo, "docs/STATE_MACHINES.md");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    // 404 = file genuinely missing; the file_exists rule covers reporting it.
    if (/\b404\b/.test(msg)) {
      return unknownFinding(rule, "docs/STATE_MACHINES.md не найден");
    }
    return unknownFinding(rule, `Не удалось прочитать docs/STATE_MACHINES.md: ${msg}`);
  }

  const truncatedMarkdown = markdown.slice(0, MAX_MARKDOWN_CHARS);

  // Step 2 — primary code search ("status"). Errors here can short-circuit
  // the whole rule with a graceful unknown.
  const primary = await safeSymbolSearch(token, owner, repo, "status", MAX_HITS);
  if (primary.unknownDetail) {
    return unknownFinding(rule, primary.unknownDetail);
  }

  // Step 3 — optional secondary searches for "state"/"phase" only when the
  // doc mentions them. Failures here degrade to "no extra hits", they do not
  // abort the rule (we already have primary evidence).
  const docLower = truncatedMarkdown.toLowerCase();
  const secondaryTerms: string[] = [];
  if (/\bstate\b/.test(docLower)) secondaryTerms.push("state");
  if (/\bphase\b/.test(docLower)) secondaryTerms.push("phase");

  const secondaryResults = await Promise.allSettled(
    secondaryTerms.map((term) => safeSymbolSearch(token, owner, repo, term, MAX_HITS)),
  );
  const secondaryHits: CodeSearchHit[] = [];
  for (const r of secondaryResults) {
    if (r.status === "fulfilled") secondaryHits.push(...r.value.hits);
  }

  // Concatenate primary + secondary, dedupe by path (preserving first-seen
  // order — primary hits always win), cap at MAX_HITS.
  const seen = new Set<string>();
  const merged: CodeSearchHit[] = [];
  for (const hit of [...primary.hits, ...secondaryHits]) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    merged.push(hit);
    if (merged.length >= MAX_HITS) break;
  }

  // Trim each fragment so the user message size stays bounded.
  const evidenceLines = merged
    .map((h) => `  ${h.path}: ${(h.fragment ?? "").slice(0, MAX_FRAGMENT_CHARS)}`)
    .join("\n");

  const userMessage = `<doc>
${truncatedMarkdown}
</doc>
<code_evidence>
${evidenceLines}
</code_evidence>

Задача:
1. Извлеки из <doc> все упоминаемые статусы (например: draft, confirmed, completed) и переходы.
2. Извлеки из <code_evidence> реальные значения enum/константы статусов и переходов.
3. Сравни:
   - есть ли в коде статусы которых нет в доке
   - есть ли в доке статусы которых нет в коде
   - совпадают ли направления переходов

Если расхождений > 0 → status fail с конкретикой (какие статусы расходятся, ≤ 200 chars).
Если doc и code согласованы → status pass.
Если в <code_evidence> пусто или мало сигнала — снизь confidence соответственно.`;

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
    if (/rate.?limit|429/i.test(msg)) {
      return unknownFinding(rule, "Anthropic rate limit, повторите позже");
    }
    if (/timeout/i.test(msg)) {
      return unknownFinding(rule, "Anthropic timeout, повторите позже");
    }
    return unknownFinding(rule, `Ошибка LLM: ${msg}`);
  }

  // Defensive: tool-use schema marks `detail` and `confidence` as required,
  // but the model could in theory return a malformed payload. Guard before
  // calling .slice() so a missing field never causes a TypeError to escape —
  // the detector contract is "never throws".
  const confidence = typeof result.confidence === "number" ? result.confidence : 0;
  if (typeof result.detail !== "string") {
    return unknownFinding(rule, "LLM не вернул detail");
  }
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
