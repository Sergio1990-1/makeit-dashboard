import Anthropic from "@anthropic-ai/sdk";
import type { AuditFinding, Verdict, VerificationResult } from "../types";
import { readRepoFile } from "./github-actions";

const VERIFY_MODEL = "claude-sonnet-4-20250514";

const VERIFY_SYSTEM_PROMPT = `You are a skeptical senior code reviewer verifying an automated audit finding.

Your task: determine whether the reported issue EXISTS in the CURRENT code at the
reported location. Automated audits have a ~50% false positive rate because they
miss existing mitigations (validators called earlier in the stack, type guards,
SQLAlchemy-provided escaping, framework protections, dead code paths, etc).

## Your process
1. Call read_code_at_location(file, line, context_lines=15) to fetch the actual
   code around the reported finding.
2. If the issue spans multiple functions or requires understanding the caller,
   call read_code_at_location again on other relevant files/lines (max 3 reads).
3. Decide whether the reported problem is real in CURRENT code.

## Default stance: SKEPTICAL
Assume the finding MIGHT be a false positive. Look actively for mitigations:
- Input validation earlier in the request path (middleware, dependency, decorator)
- ORM-provided protections (parameter binding, identifier quoting)
- Framework defaults (CSRF tokens, auth guards, serialization)
- Type annotations enforcing invariants
- Surrounding try/except, if-guards, early returns
- Wrappers like SecretStr, sanitize_*, escape_*
- Already-fixed code at that line (the finding may be stale)

## Verdicts (choose exactly one)

CONFIRMED — The bug exists in current code with no existing mitigation.
  Require: you can point to the specific line that fails, AND name the attack/scenario.

FALSE_POSITIVE — The code already handles this case correctly.
  Require: you can point to the specific mitigation (which line protects against
  the reported problem).

UNCERTAIN — Cannot determine statically without runtime context, architectural
  discussion, or calling-convention analysis that exceeds what is visible.
  Use when: you would need to know external inputs, when something is called,
  or what the author's intent was.

## Output
Reply with ONLY this JSON, no markdown, no prose:

{
  "verdict": "CONFIRMED" | "FALSE_POSITIVE" | "UNCERTAIN",
  "reason": "<1-3 sentences, quote the key line number(s)>",
  "code_snippet": "<the relevant ±10 lines of code you based your decision on>"
}

Important: reason MUST cite specific line numbers. If CONFIRMED, name the
attack/failure mode. If FALSE_POSITIVE, name the mitigation and where it lives.`;

const VERIFY_TOOL: Anthropic.Tool = {
  name: "read_code_at_location",
  description:
    "Read the actual file contents at a specific line with surrounding context. Use this to verify whether a reported audit finding actually exists in current code.",
  input_schema: {
    type: "object" as const,
    properties: {
      file: {
        type: "string",
        description: "File path relative to repo root (e.g. src/sanitize.py)",
      },
      line: {
        type: "number",
        description: "Center line number (1-based)",
      },
      context_lines: {
        type: "number",
        description: "Lines before and after to include (default 15, max 40)",
      },
    },
    required: ["file", "line"],
  },
};

/** Render file content with line numbers in ±context_lines window. */
function renderCodeWindow(
  filePath: string,
  content: string,
  line: number,
  contextLines: number,
): string {
  const lines = content.split("\n");
  const ctx = Math.min(contextLines, 40);
  const start = Math.max(0, line - ctx - 1);
  const end = Math.min(lines.length, line + ctx);
  const numbered = lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4, " ")}  ${l}`)
    .join("\n");
  return `// ${filePath} (lines ${start + 1}-${end})\n${numbered}`;
}

/** Strip common prefixes that auditor may add but don't exist in repo path. */
function candidatePaths(path: string): string[] {
  const candidates = new Set<string>([path]);
  // Strip ./ prefix
  if (path.startsWith("./")) candidates.add(path.slice(2));
  // Try without common top-level dirs
  for (const prefix of ["backend/", "frontend/", "src/"]) {
    if (path.startsWith(prefix)) candidates.add(path.slice(prefix.length));
  }
  return Array.from(candidates);
}

export interface FileCache {
  /** Map of `${owner}/${repo}:${path}` → file content, or null for not-found. */
  files: Map<string, string | null>;
}

export function createFileCache(): FileCache {
  return { files: new Map() };
}

async function fetchFileWithCache(
  githubToken: string,
  owner: string,
  repo: string,
  path: string,
  cache: FileCache,
): Promise<{ content: string; resolvedPath: string } | null> {
  for (const candidate of candidatePaths(path)) {
    const key = `${owner}/${repo}:${candidate}`;
    const cached = cache.files.get(key);
    if (cached !== undefined) {
      if (cached === null) continue;
      return { content: cached, resolvedPath: candidate };
    }
    try {
      const content = await readRepoFile(githubToken, owner, repo, candidate);
      cache.files.set(key, content);
      return { content, resolvedPath: candidate };
    } catch {
      cache.files.set(key, null);
      continue;
    }
  }
  return null;
}

interface VerifyToolResult {
  text: string;
  error: boolean;
}

async function executeReadCodeTool(
  input: { file?: string; line?: number; context_lines?: number },
  githubToken: string,
  owner: string,
  repo: string,
  cache: FileCache,
): Promise<VerifyToolResult> {
  if (!input.file || typeof input.line !== "number") {
    return { text: "ERROR: missing 'file' or 'line' argument", error: true };
  }
  const result = await fetchFileWithCache(githubToken, owner, repo, input.file, cache);
  if (!result) {
    return { text: `ERROR: could not read ${input.file} (tried path variants)`, error: true };
  }
  const rendered = renderCodeWindow(
    result.resolvedPath,
    result.content,
    input.line,
    input.context_lines ?? 15,
  );
  return { text: rendered, error: false };
}

interface VerifyAgentResponse {
  verdict: Verdict;
  reason: string;
  code_snippet: string | null;
}

/** Extract JSON object from Claude text response (tolerates surrounding prose). */
function parseVerifyResponse(text: string): VerifyAgentResponse | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const verdict = parsed.verdict;
    const reason = parsed.reason;
    if (
      (verdict !== "CONFIRMED" && verdict !== "FALSE_POSITIVE" && verdict !== "UNCERTAIN") ||
      typeof reason !== "string"
    ) {
      return null;
    }
    return {
      verdict,
      reason,
      code_snippet: typeof parsed.code_snippet === "string" ? parsed.code_snippet : null,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a single audit finding against actual code.
 *
 * Returns a VerificationResult with verdict. On transient errors, retries once.
 * On persistent failure, returns a result with `error` set.
 */
export async function verifyFinding(
  client: Anthropic,
  finding: AuditFinding,
  findingIndex: number,
  githubToken: string,
  owner: string,
  repo: string,
  cache: FileCache,
): Promise<VerificationResult> {
  const verifiedAt = new Date().toISOString();
  const base: Omit<VerificationResult, "verdict" | "reason" | "code_snippet" | "error"> = {
    finding_index: findingIndex,
    file: finding.file,
    line: finding.line,
    verified_at: verifiedAt,
    model: VERIFY_MODEL,
  };

  const userMessage = `Finding to verify:
  File: ${finding.file}
  Line: ${finding.line ?? "(unknown)"}
  Severity: ${finding.severity}
  Tool: ${finding.tool}
  Description: ${finding.description}
  Recommendation: ${finding.recommendation}

Verify it now.`;

  let currentMessages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Up to 4 iterations = 1 initial + 3 tool reads
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for (let iter = 0; iter < 4; iter++) {
        const response = await client.messages.create({
          model: VERIFY_MODEL,
          max_tokens: 1024,
          system: VERIFY_SYSTEM_PROMPT,
          tools: [VERIFY_TOOL],
          messages: currentMessages,
        });

        if (response.stop_reason === "tool_use") {
          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
          ];
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type === "tool_use" && block.name === "read_code_at_location") {
              const result = await executeReadCodeTool(
                block.input as { file?: string; line?: number; context_lines?: number },
                githubToken,
                owner,
                repo,
                cache,
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result.text,
                is_error: result.error,
              });
            }
          }
          currentMessages = [
            ...currentMessages,
            { role: "user", content: toolResults },
          ];
          continue;
        }

        // end_turn — parse verdict JSON
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n");
        const parsed = parseVerifyResponse(text);
        if (parsed) {
          return { ...base, ...parsed, error: null };
        }
        lastError = "invalid JSON response from model";
        break;
      }
      // Exhausted iterations without end_turn
      lastError = lastError ?? "verification did not converge within 4 iterations";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // Reset messages and retry once
      currentMessages = [{ role: "user", content: userMessage }];
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Persistent failure — return error result; caller treats as needs-human downstream
  return {
    ...base,
    verdict: "UNCERTAIN",
    reason: `verification failed: ${lastError}`,
    code_snippet: null,
    error: lastError,
  };
}
