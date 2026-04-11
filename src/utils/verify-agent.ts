import Anthropic from "@anthropic-ai/sdk";
import type { AuditFinding, Verdict, VerificationResult } from "../types";
import {
  CodeSearchRateLimitError,
  CodeSearchUnavailableError,
  readRepoFile,
  searchCodeSymbol,
} from "./github-actions";

export const VERIFY_MODEL = "claude-sonnet-4-20250514";

const VERIFY_SYSTEM_PROMPT = `You are a skeptical senior code reviewer verifying an automated audit finding.

## First question: is this about CODE?
If the finding is a tooling/environment configuration issue (missing type stubs,
module resolution, mypy/ruff config, "import-not-found", "import-untyped",
"attr-defined" for installed framework modules like alembic.op, sqlalchemy.ext.*,
redis.asyncio), return verdict NOT_A_BUG immediately without reading code.
These are fixable by a single config edit — they do not describe code defects.

Otherwise: determine whether the reported issue EXISTS in the CURRENT code at the
reported location. Automated audits have a ~50% false positive rate because they
miss existing mitigations (validators called earlier in the stack, type guards,
SQLAlchemy-provided escaping, framework protections, dead code paths, etc).

## Known auditor problem: line number drift

The auditor has a known bug where finding line numbers can be off by HUNDREDS of
lines (observed drift of 2758 lines in one case). When read_code_at_location at
the reported line shows code that does NOT match the finding's description, DO
NOT immediately return FALSE_POSITIVE or UNCERTAIN. The described code likely
exists elsewhere in the same file — you must search for it before giving up.

## Your process
1. Call read_code_at_location(file, line, context_lines=15) to fetch the actual
   code around the reported finding.

2. If the code at that line does NOT match the finding's description (e.g. finding
   talks about "user_messages" but line contains cache init), DO NOT give up yet:
   a. Extract a distinctive identifier from the description: function name, a
      specific assignment, error string, class name.
   b. Call grep_file(file, pattern) to find where that identifier actually lives
      in the SAME file.
   c. If matches found, call read_code_at_location at each match line to verify.
   d. Only after grep_file returns zero matches can you conclude the code doesn't
      exist in the file.

3. If the finding references an external class or function (e.g. "QueueManager
   logs the token" but the current file only imports QueueManager), use
   find_symbol_definition(symbol, hint_file=current_file) to read the actual
   implementation. You MUST check external implementations before returning
   UNCERTAIN with reason "cannot locate X".

4. If the issue spans multiple functions or requires understanding the caller,
   call read_code_at_location again on other relevant files/lines (max 5 reads
   total across all tools).

5. Decide whether the reported problem is real in CURRENT code.

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

NOT_A_BUG — The finding is not about a code defect at all.
  Use when the finding describes:
  • A type-checker environment issue (missing stubs, "import-not-found",
    "import-untyped", "attr-defined" for installed framework modules)
  • A tooling configuration issue (mypy/ruff/linter config, not code quality)
  • A style/naming suggestion without correctness impact
  Require: explain why the finding is outside the scope of "is this code buggy".

CONFIRMED — The bug exists in current code with no existing mitigation.
  Require: you can point to the specific line that fails, AND name the attack/scenario.

FALSE_POSITIVE — The code already handles this case correctly.
  Require: you can point to the specific mitigation (which line protects against
  the reported problem).

UNCERTAIN — Cannot determine statically without runtime context, architectural
  discussion, or calling-convention analysis that exceeds what is visible.
  Use when: you would need to know external inputs, when something is called,
  or what the author's intent was.
  DO NOT use UNCERTAIN just because the initial read_code_at_location didn't
  find the described code — you MUST try grep_file and/or find_symbol_definition
  first. "Cannot locate X" is a valid UNCERTAIN reason ONLY if you searched for
  X with grep_file or find_symbol_definition and still didn't find it.

## Output
Reply with ONLY this JSON, no markdown, no prose:

{
  "verdict": "CONFIRMED" | "FALSE_POSITIVE" | "UNCERTAIN" | "NOT_A_BUG",
  "reason": "<1-3 sentences, quote the key line number(s)>",
  "code_snippet": "<the relevant ±10 lines of code you based your decision on>"
}

Important: reason MUST cite specific line numbers (unless NOT_A_BUG). If CONFIRMED,
name the attack/failure mode. If FALSE_POSITIVE, name the mitigation and where it
lives. If NOT_A_BUG, explain why it's out of scope.`;

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

const VERIFY_GREP_TOOL: Anthropic.Tool = {
  name: "grep_file",
  description:
    "Search for a pattern within a file and return all matching line numbers with ±3 lines of context. " +
    "Use this when read_code_at_location shows code that does NOT match what the finding describes — " +
    "the auditor has known line-number drift, so the described function/pattern may exist elsewhere in " +
    "the same file. Prefer a distinctive identifier from the finding description (function name, specific " +
    "assignment like `user_messages = []`, error class name). Case-sensitive literal substring match.",
  input_schema: {
    type: "object" as const,
    properties: {
      file: {
        type: "string",
        description: "File path relative to repo root (same format as read_code_at_location)",
      },
      pattern: {
        type: "string",
        description:
          "Literal substring to search for. Choose something distinctive from the finding description — " +
          "function/class name, a specific code pattern, or an error string. Avoid common words.",
      },
      max_matches: {
        type: "number",
        description: "Max matches to return (default 10, cap 20).",
      },
    },
    required: ["file", "pattern"],
  },
};

const VERIFY_FIND_SYMBOL_TOOL: Anthropic.Tool = {
  name: "find_symbol_definition",
  description:
    "Find where a Python class or function is defined across the repo by symbol name, then read its body. " +
    "Use when the finding references an external symbol (e.g. 'QueueManager logs the token') and the current " +
    "file only imports it — you need to see the actual implementation to confirm or refute the claim. " +
    "Returns up to 3 most likely definitions with ±20 lines of context each.",
  input_schema: {
    type: "object" as const,
    properties: {
      symbol: {
        type: "string",
        description:
          "Exact Python identifier: class name (e.g. 'QueueManager'), function name (e.g. 'sanitize_exception'). " +
          "Do NOT include parentheses or module prefixes.",
      },
      hint_file: {
        type: "string",
        description:
          "Optional: file that imports or references this symbol, to guide path resolution. " +
          "The implementation uses this to narrow search to likely sibling paths first.",
      },
    },
    required: ["symbol"],
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

/** Guard against runaway token use — never return more than this many lines. */
const GREP_MAX_OUTPUT_LINES = 3000;

/** Format a single grep hit as a ±3 line window in the same style as renderCodeWindow. */
function renderGrepMatch(lines: string[], lineno: number): string {
  const start = Math.max(0, lineno - 3 - 1);
  const end = Math.min(lines.length, lineno + 3);
  return lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4, " ")}  ${l}`)
    .join("\n");
}

async function executeGrepFileTool(
  input: { file?: string; pattern?: string; max_matches?: number },
  githubToken: string,
  owner: string,
  repo: string,
  cache: FileCache,
): Promise<VerifyToolResult> {
  if (!input.file || !input.pattern) {
    return { text: "ERROR: missing 'file' or 'pattern' argument", error: true };
  }
  const result = await fetchFileWithCache(githubToken, owner, repo, input.file, cache);
  if (!result) {
    return { text: `ERROR: could not read ${input.file} (tried path variants)`, error: true };
  }
  const lines = result.content.split("\n");
  const matchLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(input.pattern)) {
      matchLines.push(i + 1); // 1-based
    }
  }
  if (matchLines.length === 0) {
    return {
      text: `No matches for '${input.pattern}' in ${result.resolvedPath}`,
      error: false,
    };
  }
  const cap = Math.min(Math.max(1, input.max_matches ?? 10), 20);
  const shown = matchLines.slice(0, cap);
  const omitted = matchLines.length - shown.length;
  const header = `// ${result.resolvedPath} — ${matchLines.length} match${matchLines.length === 1 ? "" : "es"} for '${input.pattern}'`;
  const blocks = shown.map((ln) => renderGrepMatch(lines, ln));
  let body = [header, ...blocks].join("\n\n---\n\n");
  if (omitted > 0) {
    body += `\n\n... ${omitted} more match${omitted === 1 ? "" : "es"} omitted`;
  }
  // Hard cap total output size to protect token budget.
  const outLines = body.split("\n");
  if (outLines.length > GREP_MAX_OUTPUT_LINES) {
    body =
      outLines.slice(0, GREP_MAX_OUTPUT_LINES).join("\n") +
      "\n\n... truncated, use read_code_at_location for specific lines";
  }
  return { text: body, error: false };
}

/**
 * Try sequential path-guessing fallbacks when GitHub Code Search is unavailable
 * (unindexed repo, 422). Returns candidate file paths in priority order.
 */
function guessSymbolPaths(symbol: string, hintFile?: string): string[] {
  const lower = symbol.toLowerCase();
  const out = new Set<string>();
  if (hintFile) {
    const lastSlash = hintFile.lastIndexOf("/");
    const dir = lastSlash >= 0 ? hintFile.slice(0, lastSlash) : "";
    if (dir) {
      out.add(`${dir}/${lower}.py`);
      // Walk up one directory level too.
      const parentSlash = dir.lastIndexOf("/");
      const parent = parentSlash >= 0 ? dir.slice(0, parentSlash) : "";
      if (parent) {
        out.add(`${parent}/${lower}.py`);
        out.add(`${parent}/${lower}/__init__.py`);
      }
    }
  }
  out.add(`src/${lower}.py`);
  out.add(`${lower}.py`);
  return Array.from(out);
}

/** Find the first line number where the symbol is defined, or -1 if absent. */
function findDefinitionLine(content: string, symbol: string): number {
  const lines = content.split("\n");
  // Match `class <sym>`, `def <sym>`, `async def <sym>` followed by ( or :  or space.
  const re = new RegExp(`^(\\s*)(class|def|async\\s+def)\\s+${symbol}\\b`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

async function executeFindSymbolTool(
  input: { symbol?: string; hint_file?: string },
  githubToken: string,
  owner: string,
  repo: string,
  cache: FileCache,
): Promise<VerifyToolResult> {
  const symbol = input.symbol?.trim();
  if (!symbol || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol)) {
    return { text: "ERROR: missing or invalid 'symbol' argument (must be a bare Python identifier)", error: true };
  }

  // 1. Try GitHub Code Search.
  let hits: { path: string; fragment: string }[] = [];
  let searchUnavailable = false;
  try {
    hits = await searchCodeSymbol(githubToken, owner, repo, symbol, 10);
  } catch (e) {
    if (e instanceof CodeSearchRateLimitError) {
      return { text: "GitHub code search rate limited, retry later", error: true };
    }
    if (e instanceof CodeSearchUnavailableError) {
      searchUnavailable = true;
    } else {
      // Unknown error — propagate as tool error.
      return {
        text: `ERROR: code search failed: ${e instanceof Error ? e.message : String(e)}`,
        error: true,
      };
    }
  }

  // 2. Filter hits to those that look like definitions (fragment contains class/def).
  const defRe = new RegExp(`(class|def|async\\s+def)\\s+${symbol}\\b`);
  const defHits = hits.filter((h) => defRe.test(h.fragment));

  // Use defHits if we got any, otherwise fall through to path guessing below.
  const rendered: string[] = [];
  const seenPaths = new Set<string>();

  for (const hit of defHits) {
    if (rendered.length >= 3) break;
    if (seenPaths.has(hit.path)) continue;
    seenPaths.add(hit.path);
    const file = await fetchFileWithCache(githubToken, owner, repo, hit.path, cache);
    if (!file) continue;
    const line = findDefinitionLine(file.content, symbol);
    if (line < 0) continue;
    rendered.push(renderCodeWindow(file.resolvedPath, file.content, line, 20));
  }

  // 3. If search returned nothing useful (either unavailable or no definitions),
  //    fall back to sequential path guessing.
  if (rendered.length === 0) {
    for (const candidate of guessSymbolPaths(symbol, input.hint_file)) {
      if (rendered.length >= 3) break;
      if (seenPaths.has(candidate)) continue;
      seenPaths.add(candidate);
      const file = await fetchFileWithCache(githubToken, owner, repo, candidate, cache);
      if (!file) continue;
      const line = findDefinitionLine(file.content, symbol);
      if (line < 0) continue;
      rendered.push(renderCodeWindow(file.resolvedPath, file.content, line, 20));
    }
  }

  if (rendered.length === 0) {
    if (searchUnavailable) {
      return {
        text: `Symbol '${symbol}' not found via code search (repo may not be indexed). Consider using grep_file on a specific file.`,
        error: false,
      };
    }
    return {
      text: `No definition of '${symbol}' found in repo. Try grep_file or check import statements in the current file.`,
      error: false,
    };
  }

  const header = `// find_symbol_definition('${symbol}') — ${rendered.length} definition${rendered.length === 1 ? "" : "s"}`;
  return {
    text: [header, ...rendered].join("\n\n=== next definition ===\n\n"),
    error: false,
  };
}

interface VerifyAgentResponse {
  verdict: Verdict;
  reason: string;
  code_snippet: string | null;
}

/**
 * Extract JSON object from Claude text response (tolerates surrounding prose).
 * Uses a last-match approach: scans for every top-level `{...}` block and tries
 * to parse from the last one backwards — the model's verdict JSON is typically
 * the final object in the response, so this avoids false matches on code
 * snippets containing braces earlier in the text.
 */
function parseVerifyResponse(text: string): VerifyAgentResponse | null {
  // Collect start indices of all top-level '{' characters.
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") starts.push(i);
  }

  // Try from the last '{' backwards — first valid parse wins.
  for (let k = starts.length - 1; k >= 0; k--) {
    const candidate = text.slice(starts[k]);
    // Find the matching closing brace by tracking nesting depth.
    // Skip braces inside JSON string literals to avoid false depth changes.
    let depth = 0;
    let end = -1;
    let inString = false;
    for (let j = 0; j < candidate.length; j++) {
      const ch = candidate[j];
      if (inString) {
        if (ch === "\\" ) { j++; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) continue;

    try {
      const parsed = JSON.parse(candidate.slice(0, end + 1)) as Record<string, unknown>;
      const verdict = parsed.verdict;
      const reason = parsed.reason;
      if (
        (verdict !== "CONFIRMED" &&
          verdict !== "FALSE_POSITIVE" &&
          verdict !== "UNCERTAIN" &&
          verdict !== "NOT_A_BUG") ||
        typeof reason !== "string"
      ) {
        continue;
      }
      return {
        verdict,
        reason,
        code_snippet: typeof parsed.code_snippet === "string" ? parsed.code_snippet : null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Verify a single audit finding against actual code.
 *
 * Returns a VerificationResult with verdict. On transient errors (API failure
 * or invalid JSON), retries once with 2s backoff and fresh message history.
 * On persistent failure, returns a result with `error` set.
 *
 * AbortError is rethrown so the caller can discard partial batch results.
 */
export async function verifyFinding(
  client: Anthropic,
  finding: AuditFinding,
  findingIndex: number,
  githubToken: string,
  owner: string,
  repo: string,
  cache: FileCache,
  signal?: AbortSignal,
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

  // Up to 2 attempts × MAX_ITERATIONS iterations each. Each attempt starts with
  // fresh message history so a bad assistant reply in attempt 1 doesn't poison
  // attempt 2. Within an attempt, an invalid-JSON response gets ONE nudge back
  // with the original reasoning preserved — after that we break and retry from
  // scratch. The iteration counter is the total tool-use loop budget across
  // all tools (read_code_at_location, grep_file, find_symbol_definition).
  const MAX_ITERATIONS = 12;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let currentMessages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];
    let iterationDidFail = false;
    let jsonNudgeUsed = false;

    try {
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const response = await client.messages.create(
          {
            model: VERIFY_MODEL,
            max_tokens: 1024,
            system: VERIFY_SYSTEM_PROMPT,
            tools: [VERIFY_TOOL, VERIFY_GREP_TOOL, VERIFY_FIND_SYMBOL_TOOL],
            messages: currentMessages,
          },
          { signal },
        );

        if (response.stop_reason === "tool_use") {
          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
          ];
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            let result: VerifyToolResult;
            switch (block.name) {
              case "read_code_at_location":
                result = await executeReadCodeTool(
                  block.input as { file?: string; line?: number; context_lines?: number },
                  githubToken,
                  owner,
                  repo,
                  cache,
                );
                break;
              case "grep_file":
                result = await executeGrepFileTool(
                  block.input as { file?: string; pattern?: string; max_matches?: number },
                  githubToken,
                  owner,
                  repo,
                  cache,
                );
                break;
              case "find_symbol_definition":
                result = await executeFindSymbolTool(
                  block.input as { symbol?: string; hint_file?: string },
                  githubToken,
                  owner,
                  repo,
                  cache,
                );
                break;
              default:
                result = { text: `ERROR: unknown tool '${block.name}'`, error: true };
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.text,
              is_error: result.error,
            });
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
        // One-shot nudge: keep the assistant's prior reasoning in history and
        // ask it to reformat into JSON. If that also fails, give up this
        // attempt and let the outer retry start over with fresh history.
        if (!jsonNudgeUsed) {
          jsonNudgeUsed = true;
          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
            {
              role: "user",
              content:
                "Your previous response was not valid JSON. Respond ONLY with the JSON object starting with { and ending with }, no prose before or after.",
            },
          ];
          continue;
        }
        iterationDidFail = true;
        break;
      }
      if (!iterationDidFail) {
        lastError = `verification did not converge within ${MAX_ITERATIONS} iterations`;
      }
    } catch (e) {
      // Propagate abort up so caller can discard the whole batch
      if (e instanceof Error && (e.name === "AbortError" || signal?.aborted)) {
        throw e;
      }
      lastError = e instanceof Error ? e.message : String(e);
    }

    // Backoff before second attempt
    if (attempt === 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 2000);
        if (signal) {
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }
      });
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
