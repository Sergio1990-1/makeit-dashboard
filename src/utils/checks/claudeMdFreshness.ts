// Layer-4 drift detector: ai_claude_md_freshness.
//
// Verifies that paths and commands mentioned in CLAUDE.md still exist in the
// repo. Evidence:
//   1. readRepoFile("CLAUDE.md") — markdown content.
//   2. getRepoTreeFlat — full file inventory in one REST call.
//   3. readRepoFile("Makefile") and the `scripts` block of package.json
//      when those files exist (best-effort — failures degrade to "absent").
//
// Uses Claude haiku with a single forced tool call. Returns an `unknown`
// HealthFinding for any preconditional miss (no claude key, missing
// CLAUDE.md, tree-fetch error, LLM error, low-confidence reply) — the
// detector never throws. Applies to all projects (no tier/client gate).
//
// Cost guardrails (per scan):
//   markdown ≤ 8000 chars + ~500 paths × ~50 chars ≈ 25000 + Makefile
//   ≤ 4000 + scripts JSON ≤ 1000 + scaffolding ≈ 38 000 chars ≈ 9.5k input
//   tokens; max_tokens = 1024 output. Haiku pricing (~$1/MTok input,
//   $5/MTok output):
//     input  ≈ $0.0095
//     output ≈ $0.005
//     total  ≈ $0.015 / scan — comfortably below the spec cap of $0.02.

import type { HealthFinding } from "../../types/health";
import { callClaudeWithTool } from "../claude";
import { getRepoTreeFlat, getRepoTreeSha, readRepoFile } from "../github-actions";
import type { DetectorArgs } from "../health-llm";

// Truncation budgets — bounded so haiku cost stays predictable.
const MAX_CLAUDE_MD_CHARS = 8000;
const MAX_MAKEFILE_CHARS = 4000;
const MAX_SCRIPTS_CHARS = 1000;
const MAX_PATHS = 500;
const MAX_DETAIL_CHARS = 250;
const CONFIDENCE_THRESHOLD = 0.7;
const MODEL = "claude-haiku-4-5-20251001" as const;
const MAX_TOKENS = 1024;

// Filter the tree list to paths a CLAUDE.md author is plausibly going to
// reference. Drops generated/vendored/private dirs that bloat the prompt
// without adding signal — a CLAUDE.md mentioning `node_modules/foo/bar` is
// not a freshness concern.
const PATH_BLOCKLIST_RE =
  /^(node_modules|dist|build|coverage|\.git|\.claude|\.vscode|\.idea|\.next|\.cache|out)\//;

const TOOL_DEF = {
  name: "report_finding",
  description: "Report CLAUDE.md freshness result",
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
  "Ты проверяешь актуальность CLAUDE.md проекта — упоминаемые пути и команды должны существовать.";

interface LLMResult {
  status: "pass" | "fail";
  detail: string;
  remediation?: string;
  confidence: number;
}

// Mirror of health-llm.ts:findingBase — duplicated to keep it private there.
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

// Read package.json and return a compact JSON of just its `scripts` block.
// Empty string means "no package.json" or "no scripts" — both are treated
// equivalently by the prompt. Errors fall through to absent — a failed read
// shouldn't kill the rule, the LLM still has CLAUDE.md + repo tree.
async function readScripts(
  token: string,
  owner: string,
  repo: string,
): Promise<string> {
  try {
    const raw = await readRepoFile(token, owner, repo, "package.json");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    if (!parsed.scripts || typeof parsed.scripts !== "object") return "";
    const json = JSON.stringify(parsed.scripts);
    return json.slice(0, MAX_SCRIPTS_CHARS);
  } catch {
    return "";
  }
}

// Best-effort Makefile read. Same swallow-on-error policy as readScripts.
async function readMakefile(
  token: string,
  owner: string,
  repo: string,
): Promise<string> {
  try {
    const raw = await readRepoFile(token, owner, repo, "Makefile");
    return raw.slice(0, MAX_MAKEFILE_CHARS);
  } catch {
    return "";
  }
}

export async function checkClaudeMdFreshness(
  args: DetectorArgs,
): Promise<HealthFinding> {
  const { rule, token, owner, repo, claudeKey } = args;

  // Don't burn an API call (or surface a confusing error) when key is absent.
  if (!claudeKey || !claudeKey.trim()) {
    return unknownFinding(rule, "Claude API ключ не задан");
  }

  // Step 1 — read CLAUDE.md. 404 = file genuinely missing; the file_exists
  // rule covers reporting it, this rule simply has no work to do.
  let markdown: string;
  try {
    markdown = await readRepoFile(token, owner, repo, "CLAUDE.md");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    if (/\b404\b/.test(msg)) {
      return unknownFinding(rule, "CLAUDE.md не найден");
    }
    return unknownFinding(rule, `Не удалось прочитать CLAUDE.md: ${msg}`);
  }

  // Step 2 — fetch the tree. Need the tree-sha first; bubble the error as
  // unknown if either call fails (without a file inventory we can't verify
  // any path).
  let treeSha: string;
  try {
    const resolved = await getRepoTreeSha(token, owner, repo);
    treeSha = resolved.treeSha;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    return unknownFinding(rule, `Не удалось получить tree sha: ${msg}`);
  }

  let allPaths: string[];
  let truncated = false;
  try {
    const tree = await getRepoTreeFlat(token, owner, repo, treeSha);
    allPaths = tree.paths;
    truncated = tree.truncated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка";
    return unknownFinding(rule, `Не удалось получить tree: ${msg}`);
  }

  const filteredPaths = allPaths.filter((p) => !PATH_BLOCKLIST_RE.test(p));
  // If the tree is huge, prefer code/docs/config-looking paths so the LLM
  // sees the most relevant evidence first. A simple deprioritisation by
  // depth keeps the cap predictable without a custom scorer.
  const sortedPaths = filteredPaths
    .slice()
    .sort((a, b) => a.split("/").length - b.split("/").length);
  const treePaths = sortedPaths.slice(0, MAX_PATHS);

  // Step 3 — opportunistically read Makefile and package.json scripts in
  // parallel. Either failing is fine — the LLM gets "(не найден)" for
  // missing surfaces.
  const [makefile, scripts] = await Promise.all([
    readMakefile(token, owner, repo),
    readScripts(token, owner, repo),
  ]);

  const truncatedMarkdown = markdown.slice(0, MAX_CLAUDE_MD_CHARS);
  const treeText = treePaths.join("\n");
  const truncationNote =
    truncated || filteredPaths.length > MAX_PATHS
      ? `\n[note: показаны первые ${treePaths.length} из ${filteredPaths.length} путей]`
      : "";

  const userMessage = `<claude_md>
${truncatedMarkdown}
</claude_md>
<repo_tree>
${treeText}${truncationNote}
</repo_tree>
<makefile>
${makefile || "(не найден)"}
</makefile>
<package_json_scripts>
${scripts || "(не найден)"}
</package_json_scripts>

Задача:
1. Извлеки из CLAUDE.md упоминания путей (\`src/utils/...\`, \`docs/...\`), скриптов (\`./scripts/foo.sh\`, \`npm run X\`), make-таргетов (\`make dev\`).
2. Сверь:
   - путь должен присутствовать в repo_tree (как файл или как префикс существующего пути)
   - npm-команда вида \`npm run X\` — X должен быть ключом в package_json_scripts
   - \`make Y\` — Y должен встречаться как target в makefile
   - generic CLI команды (\`git status\`, \`docker compose ...\`, \`npx tsc\`, \`ssh ...\`) НЕ проверяй — они не зависят от репо
3. Если все проверяемые упоминания валидны → status pass, detail «N путей и команд проверено, все актуальны».
4. Если есть устаревшие → status fail, detail с конкретными примерами (≤ 200 chars), например «\`./scripts/old-deploy.sh\` не найден; \`npm run prepare\` не в scripts».
5. Не придирайся к опечаткам или общим описаниям — только к конкретным упоминаниям пути/команды, которые легко проверить.
6. Если в repo_tree есть note о неполноте, и упомянутый путь не виден в сэмпле — НЕ помечай как fail; снизь confidence (0.4–0.6).`;

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
    if (/429|rate.?limit/i.test(msg)) {
      return unknownFinding(rule, "Anthropic rate limit, повторите позже");
    }
    if (/timeout|timed out/i.test(msg)) {
      return unknownFinding(rule, "Anthropic timeout, повторите позже");
    }
    return unknownFinding(rule, `Ошибка LLM: ${msg}`);
  }

  // Defensive guards on tool-use payload — schema marks `detail` and
  // `confidence` as required, but the model could in theory return malformed
  // input. Same pattern as contractMilestonesSync.ts.
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
