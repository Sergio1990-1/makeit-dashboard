// Layer-4 drift detector: ai_knowledge_coverage.
//
// Verifies that every code-domain file under `docs/DOMAINS/` is at least
// mentioned in the project's knowledge document inside makeit-knowledge.
// Tier-1 only (gated by orchestrator + defensive check). Uses Claude opus.
//
// The detector returns an `unknown` HealthFinding for any preconditional
// miss (no claude key, knowledge file 404, LLM error, low confidence) and
// a `skipped` finding when `docs/DOMAINS/` is missing or empty (rule is
// genuinely not applicable). It never throws — failures route through
// the catch-all in the orchestrator's wrapper but are caught here first
// so the detail messages stay user-friendly.
//
// Cost guardrails:
//   knowledge file trimmed to 16000 chars + ~10 domains × ~250 chars each
//   (name + 200-char snippet + framing) ≈ 6k input tokens. With opus pricing
//   (~$15/MTok input, $75/MTok output) and max_tokens=1500 output that's
//   roughly $0.09 input + $0.11 output ≈ $0.20 per scan — matches spec cap.

import type { HealthFinding, ProjectClassification } from "../../types/health";
import { callClaudeWithTool } from "../claude";
import { listRepoFiles, readRepoFile } from "../github-actions";
import type { DetectorArgs } from "../health-llm";

// Knowledge repo coordinates — duplicated from checklist.ts to keep that
// module's surface area private (no new export just for one consumer).
const KNOWLEDGE_OWNER = "Sergio1990-1";
const KNOWLEDGE_REPO = "makeit-knowledge";

const MAX_KNOWLEDGE_CHARS = 16000;
const MAX_DOMAIN_SNIPPET_CHARS = 200;
const MAX_DETAIL_CHARS = 250;
const CONFIDENCE_THRESHOLD = 0.7;
const MODEL = "claude-opus-4-7" as const;
const MAX_TOKENS = 1500;

const TOOL_DEF = {
  name: "report_finding",
  description: "Report knowledge coverage result",
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
  "Ты проверяешь покрывает ли knowledge-документ все домены кода проекта.";

interface LLMResult {
  status: "pass" | "fail";
  detail: string;
  remediation?: string;
  confidence: number;
}

// Mirror of health-engine.ts:resolveExternalPath for the makeit-knowledge
// branch only — inlined here to avoid widening that file's private surface
// while a parallel task touches the same module. Source of truth:
// `src/utils/health-engine.ts:resolveExternalPath`.
function resolveKnowledgePath(
  classification: ProjectClassification,
  repo: string,
): string {
  return classification.knowledge_path ?? `knowledge/${repo}-business-logic.md`;
}

// Mirror of health-llm.ts:findingBase — duplicated to keep that module's
// helper private. Same shape as contractMilestonesSync.ts:baseFinding.
function baseFinding(
  rule: DetectorArgs["rule"],
): Omit<HealthFinding, "status" | "detail"> {
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

function skippedFinding(
  rule: DetectorArgs["rule"],
  detail: string,
): HealthFinding {
  return { ...baseFinding(rule), status: "skipped", detail };
}

// Collapse any whitespace (incl. newlines) to single spaces. Without this a
// malicious or just-malformed domain file could escape the `<domains>` block
// in the prompt by introducing fake tag-looking content. Keeps each domain
// line single-line and harder to inject into.
function sanitiseSnippet(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function checkKnowledgeCoverage(
  args: DetectorArgs,
): Promise<HealthFinding> {
  const { rule, token, owner, repo, classification, claudeKey } = args;

  // Defensive tier-1 gate — orchestrator's applies_to filter already handles
  // this, but a misconfigured rule shouldn't accidentally LLM-call.
  if (classification.tier !== 1) {
    return unknownFinding(rule, "Не применимо: проект не tier-1");
  }

  // Don't burn an API call (or surface a confusing error) when key is absent.
  if (!claudeKey || !claudeKey.trim()) {
    return unknownFinding(rule, "Claude API ключ не задан");
  }

  const knowledgePath = resolveKnowledgePath(classification, repo);

  // Probe domains directory first — if it's missing the rule is not
  // applicable (skipped, not unknown). 404 from listRepoFiles surfaces
  // through the thrown Error message ("GitHub API 404").
  let domainsList: { name: string; type: string; path: string }[];
  try {
    domainsList = await listRepoFiles(token, owner, repo, "docs/DOMAINS");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    if (/\b404\b/.test(msg)) {
      return skippedFinding(
        rule,
        "docs/DOMAINS/ отсутствует — правило не применимо",
      );
    }
    return unknownFinding(rule, `Не удалось получить docs/DOMAINS: ${msg}`);
  }

  const mdDomains = domainsList.filter(
    (d) => d.type === "file" && d.name.toLowerCase().endsWith(".md"),
  );
  if (mdDomains.length === 0) {
    return skippedFinding(rule, "docs/DOMAINS/ пуст — правило не применимо");
  }

  // Read knowledge file. 404 here means the project lacks coverage at all,
  // which is `unknown` — the detector can't prove pass/fail without the
  // primary evidence; the file_exists / external_file_exists rules are
  // responsible for surfacing the missing-file fact.
  let knowledgeContent: string;
  try {
    knowledgeContent = await readRepoFile(
      token,
      KNOWLEDGE_OWNER,
      KNOWLEDGE_REPO,
      knowledgePath,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    if (/\b404\b/.test(msg)) {
      return unknownFinding(
        rule,
        `Knowledge файл ${knowledgePath} не найден в makeit-knowledge`,
      );
    }
    return unknownFinding(rule, `Не удалось прочитать knowledge файл: ${msg}`);
  }

  // Read domain snippets in parallel — allSettled so a single unreadable
  // file (permissions, transient API blip) doesn't kill the whole rule.
  const domainReads = await Promise.allSettled(
    mdDomains.map((d) => readRepoFile(token, owner, repo, d.path)),
  );

  interface DomainEvidence {
    name: string;
    snippet: string;
  }
  const evidence: DomainEvidence[] = [];
  for (let i = 0; i < mdDomains.length; i++) {
    const r = domainReads[i];
    const d = mdDomains[i];
    if (r.status === "fulfilled") {
      const name = d.name.replace(/\.md$/i, "");
      const snippet = sanitiseSnippet(r.value.slice(0, MAX_DOMAIN_SNIPPET_CHARS));
      evidence.push({ name, snippet });
    } else if (import.meta.env.DEV) {
      console.warn(`[knowledgeCoverage] read ${d.path} failed:`, r.reason);
    }
  }

  if (evidence.length === 0) {
    return unknownFinding(
      rule,
      "Не удалось прочитать ни один файл из docs/DOMAINS/",
    );
  }

  const trimmedKnowledge = knowledgeContent.slice(0, MAX_KNOWLEDGE_CHARS);
  const domainLines = evidence
    .map((d) => `- ${d.name}: ${d.snippet}`)
    .join("\n");
  const userMessage = `<knowledge>${trimmedKnowledge}</knowledge>
<domains>
${domainLines}
</domains>

Каждый домен из <domains> должен быть упомянут (хоть кратко) в <knowledge>. Если какой-то домен совсем не упомянут — это пробел.

Если все домены покрыты → pass, detail «Все ${evidence.length} доменов упомянуты».
Если нет → fail, detail с перечислением непокрытых.`;

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
    // Specific buckets first — generic LLM error message must NEVER include
    // the API key (claudeKey is never interpolated into any error string).
    if (/429|rate.?limit/i.test(msg)) {
      return unknownFinding(rule, "Anthropic rate limit, повторите позже");
    }
    if (/timeout|timed out/i.test(msg)) {
      return unknownFinding(rule, "Anthropic timeout, повторите позже");
    }
    return unknownFinding(rule, `Ошибка LLM: ${msg}`);
  }

  // Defensive guards on tool-use payload. Schema marks `detail` and
  // `confidence` as required, but the model could in theory return malformed
  // input — same pattern as contractMilestonesSync.ts.
  const confidence =
    typeof result.confidence === "number" ? result.confidence : 0;
  if (typeof result.detail !== "string") {
    return unknownFinding(rule, "LLM не вернул detail");
  }
  const remediation =
    typeof result.remediation === "string" && result.remediation.trim()
      ? result.remediation
      : rule.remediation;

  if (confidence < CONFIDENCE_THRESHOLD) {
    const pct = Math.round(confidence * 100);
    const detail = `(уверенность ${pct}%) ${result.detail}`.slice(
      0,
      MAX_DETAIL_CHARS,
    );
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
