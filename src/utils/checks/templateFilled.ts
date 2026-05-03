// Layer-4 detector: ai_template_filled.
//
// Pure regex (no LLM). Walks the file(s) named by `rule.check.path` or
// `rule.check.paths_glob`, counts MakeIT-template placeholders + generic
// XXX/TODO/TBD markers, and decides pass/fail/unknown.
//
// Glob support is intentionally minimal — only `dir/**/*.ext` (recursive) and
// `dir/*.ext` (single level). Anything more exotic is treated as a literal
// path; that matches every real rule in PROJECT_CHECKLIST.yaml today and
// keeps the walker easy to reason about.

import type { ChecklistRule, HealthFinding } from "../../types/health";
import { listRepoFiles, readRepoFile } from "../github-actions";

interface DetectorArgs {
  rule: ChecklistRule;
  token: string;
  owner: string;
  repo: string;
}

// MakeIT brief / contract / SPEC template tokens like `[Название проекта]`,
// `[YYYY-MM-DD]`, `[сумма]`. Case-insensitive so `[название]` also matches.
const TEMPLATE_TOKEN_RE =
  /\[(?:Название|YYYY-MM-DD|сумма|номер|описание|Имя|клиента|MM-DD)[^\]]*\]/gi;

// Generic placeholder markers. Word boundaries on both sides so we only match
// standalone tokens — `XXXL`, `TODOs`, `TBDs` don't trip the detector.
const GENERIC_MARKERS = [/\bXXX\b/g, /\bTODO\b/g, /\bTBD\b/g];

// Detail string is rendered into a tooltip / list item — keep it readable.
const MAX_DETAIL_LEN = 250;
const MAX_EXAMPLE_LEN = 40;
const FAIL_THRESHOLD = 5;

// Glob recursion safety. GitHub trees aren't circular, but a defensive cap
// prevents a runaway walk if the API returns something unexpected.
const MAX_GLOB_DEPTH = 5;

/**
 * Resolve `rule.check.path` / `rule.check.paths_glob` to a concrete list of
 * paths in the repo. Returns at most a few hundred paths in practice.
 *
 * Supported glob shapes:
 * - `dir/**\/*.ext` — recursive, all `.ext` files under `dir`
 * - `dir/*.ext`     — single level, `.ext` files directly in `dir`
 *
 * Anything else (including bare strings without a `*`) is returned as a
 * single literal path — `readRepoFile` will 404 on a typo, which the caller
 * handles by simply not contributing to the count.
 */
async function resolvePaths(
  token: string,
  owner: string,
  repo: string,
  check: Record<string, unknown>,
): Promise<string[]> {
  const literal = typeof check.path === "string" ? check.path : null;
  if (literal) return [literal];

  const glob = typeof check.paths_glob === "string" ? check.paths_glob : null;
  if (!glob) return [];

  // Recursive: dir/**/*.ext
  const recursive = glob.match(/^(.+?)\/\*\*\/\*\.([A-Za-z0-9]+)$/);
  if (recursive) {
    const [, root, ext] = recursive;
    return walkRecursive(token, owner, repo, root, ext.toLowerCase());
  }

  // Single level: dir/*.ext
  const single = glob.match(/^(.+?)\/\*\.([A-Za-z0-9]+)$/);
  if (single) {
    const [, dir, ext] = single;
    const entries = await safeList(token, owner, repo, dir);
    return entries
      .filter((e) => e.type === "file" && e.name.toLowerCase().endsWith(`.${ext.toLowerCase()}`))
      .map((e) => e.path);
  }

  // Unknown shape — treat as literal so the caller still gets a single
  // attempt rather than silently dropping the rule.
  return [glob];
}

async function walkRecursive(
  token: string,
  owner: string,
  repo: string,
  dir: string,
  ext: string,
): Promise<string[]> {
  const found: string[] = [];
  const stack: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];
  while (stack.length > 0) {
    const { path, depth } = stack.pop()!;
    if (depth > MAX_GLOB_DEPTH) continue;
    const entries = await safeList(token, owner, repo, path);
    for (const e of entries) {
      if (e.type === "dir") {
        stack.push({ path: e.path, depth: depth + 1 });
      } else if (e.type === "file" && e.name.toLowerCase().endsWith(`.${ext}`)) {
        found.push(e.path);
      }
    }
  }
  return found;
}

// listRepoFiles throws on 404 / auth failure. For a missing directory we want
// to treat it as "no files" (the file_exists rule covers actual absence), but
// for an auth failure we still want to surface it via Promise.allSettled at
// the call site of readRepoFile. So: swallow listing errors here and log in
// dev. The detector will simply produce an `unknown` finding when the
// directory is missing (zero files read).
async function safeList(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<{ name: string; type: string; path: string }[]> {
  try {
    return await listRepoFiles(token, owner, repo, path);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[templateFilled] list ${path} failed:`, err);
    return [];
  }
}

interface FileResult {
  matches: string[];
}

async function readAndScan(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<FileResult | null> {
  let content: string;
  try {
    content = await readRepoFile(token, owner, repo, path);
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[templateFilled] read ${path} failed:`, err);
    return null;
  }
  const matches: string[] = [];
  const tplMatches = content.match(TEMPLATE_TOKEN_RE);
  if (tplMatches) matches.push(...tplMatches);
  for (const re of GENERIC_MARKERS) {
    const found = content.match(re);
    if (found) matches.push(...found);
  }
  return { matches };
}

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

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export async function checkTemplateFilled(args: DetectorArgs): Promise<HealthFinding> {
  const { rule, token, owner, repo } = args;
  const check = (rule.check ?? {}) as Record<string, unknown>;
  const paths = await resolvePaths(token, owner, repo, check);

  // Per-file try/catch already happened in readAndScan; allSettled is belt &
  // braces so a single rogue rejection from anywhere can't kill the rule.
  const results = await Promise.allSettled(
    paths.map((p) => readAndScan(token, owner, repo, p)),
  );

  const fileResults: FileResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) fileResults.push(r.value);
  }

  if (fileResults.length === 0) {
    return {
      ...findingBase(rule),
      status: "unknown",
      detail: "Файл(ы) для проверки шаблонов не найден(ы)",
    };
  }

  const allMatches = fileResults.flatMap((f) => f.matches);
  const count = allMatches.length;
  const fileCount = fileResults.length;

  if (count > FAIL_THRESHOLD) {
    const examples = allMatches.slice(0, 3).map((m) => clip(m, MAX_EXAMPLE_LEN));
    const detail = clip(
      `${count} плейсхолдеров в ${fileCount} файлах: ${examples.join(", ")}`,
      MAX_DETAIL_LEN,
    );
    return { ...findingBase(rule), status: "fail", detail };
  }

  return {
    ...findingBase(rule),
    status: "pass",
    detail: `Шаблоны заполнены (${fileCount} файл(ов), ${count} плейсхолдеров)`,
  };
}
