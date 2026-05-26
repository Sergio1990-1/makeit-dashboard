import yaml from "js-yaml";
import type {
  ChecklistDocument,
  ChecklistRule,
  ChecklistSettings,
  HealthFinding,
  HealthLayer,
  HealthLayerSummary,
  HealthReport,
  HealthReportDiscovery,
  HealthScore,
  HealthTrend,
  ProjectClassification,
  ProjectYaml,
  ProjectYamlArtifacts,
  ProjectYamlState,
} from "../types/health";
import {
  getRepoMeta,
  listRepoFiles,
  readRepoFile,
  listRepoLabels,
  listWorkflows,
  getLatestWorkflowRun,
  listMilestones,
  listIssuesWithoutMilestone,
  countClosedIssuesSince,
  listCommitsForPath,
  getCommitFiles,
  listMergedPRsInWindow,
  getPRFiles,
} from "./github-actions";
import { Semaphore } from "./semaphore";
import { fetchAuditProjects } from "./auditor";
import type { AuditProjectStatus } from "../types";

const PROJECT_YAML_PATH = ".makeit/project.yaml";
const DISCOVERY_REVIEW_DUE_DEFAULT_DAYS = 90;
const VALID_DISCOVERY_STATUSES = new Set(["completed", "not_required", "in_progress"]);
const VALID_COMPLEXITIES = new Set(["transactional", "simple"]);

// Helper: read a typed param from a check object with a fallback.
function param<T>(obj: Record<string, unknown>, key: string, fallback: T): T {
  return (obj[key] as T | undefined) ?? fallback;
}

// Fetch with bounded exponential backoff. Used for flaky third-party endpoints
// (shields.io) where transient 5xx / network blips are common. Last attempt's
// response is returned as-is so the caller can decide what to do with non-OK
// statuses; only thrown errors propagate after retries are exhausted.
//
// Retry policy: only transient statuses (5xx + 429) and thrown network errors
// are retried. Permanent client errors (401/403/404/422 etc.) are returned
// immediately — retrying them just doubles latency and third-party traffic
// (e.g. shields.io rate-limit pressure) without ever changing the outcome.
//
// AbortError short-circuits the retry loop — once a scan is cancelled there is
// no point burning the backoff timer.
async function fetchWithRetry(
  url: string,
  retries = 1,
  baseDelay = 250,
  signal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { signal });
      if (r.ok) return r;
      // Only retry transient failures. 4xx (except 408 / 429) is the server
      // telling us the request itself is wrong — a second identical request
      // can't fix that, so return immediately and let the caller decide.
      // 408 (Request Timeout) and 429 (Too Many Requests) are both transient
      // by spec.
      const transient = r.status >= 500 || r.status === 408 || r.status === 429;
      if (transient && attempt < retries) {
        await new Promise((res) => setTimeout(res, baseDelay * Math.pow(4, attempt)));
        continue;
      }
      return r;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, baseDelay * Math.pow(4, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

// Resolve a value that may be either a literal or a `{ ref: "settings.X" }`
// pointer into the document's settings block. Used for shared thresholds.
function resolveRef<T>(
  value: unknown,
  settings: ChecklistSettings,
  fallback: T,
): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "object") return value as T;
  const ref = (value as Record<string, unknown>).ref;
  if (typeof ref !== "string") return fallback;
  // Supported namespaces: "settings.<key>".
  const [ns, key] = ref.split(".");
  if (ns !== "settings" || !key) return fallback;
  const v = (settings as unknown as Record<string, unknown>)[key];
  return (v ?? fallback) as T;
}

// Minimal glob matcher — supports the patterns we use in the checklist:
// "app/**", "docs/**", "src/**", "alembic/versions/**", "README.md",
// "CLAUDE.md". No need for a full library.
function pathMatchesGlob(path: string, glob: string): boolean {
  if (glob === path) return true;
  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return path === prefix || path.startsWith(prefix + "/");
  }
  if (glob.endsWith("/*")) {
    const prefix = glob.slice(0, -2);
    if (!path.startsWith(prefix + "/")) return false;
    return !path.slice(prefix.length + 1).includes("/");
  }
  if (glob.includes("*")) {
    // Single-segment wildcard — `*` does NOT cross path separators, so
    // `*.md` matches `foo.md` but not `docs/foo.md`. Use the dedicated
    // `**` shortcuts above for cross-segment matching.
    const re = new RegExp(
      "^" +
        glob
          .split("*")
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*") +
        "$",
    );
    return re.test(path);
  }
  return path === glob;
}

function pathMatchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => pathMatchesGlob(path, g));
}

// External path resolution. Templates use {repo}; when the external repo is
// makeit-knowledge AND classification has a knowledge_path override, that
// override wins — historical knowledge files don't follow the convention
// (mankassa-business-logic.md, tax-research-kg.md, quiet-walls-model.md).
function resolveExternalPath(
  externalRepo: string,
  pathTpl: string,
  classification: ProjectClassification,
  repo: string,
): string {
  if (
    externalRepo === "Sergio1990-1/makeit-knowledge" &&
    classification.knowledge_path
  ) {
    return classification.knowledge_path;
  }
  return pathTpl.replace("{repo}", repo);
}

// Helper: probe whether a path exists in the repo. Caches per-(repo, dir) so
// many file_exists rules under the same directory share one listing.
type DirCache = Map<string, Map<string, { name: string; type: string; path: string }[]>>;

async function listDirCached(
  token: string,
  owner: string,
  repo: string,
  dir: string,
  cache: DirCache,
  signal?: AbortSignal,
): Promise<{ name: string; type: string; path: string }[]> {
  const key = `${owner}/${repo}`;
  let m = cache.get(key);
  if (!m) {
    m = new Map();
    cache.set(key, m);
  }
  const hit = m.get(dir);
  if (hit) return hit;
  try {
    const items = await listRepoFiles(token, owner, repo, dir, signal);
    m.set(dir, items);
    return items;
  } catch (err) {
    // AbortError must propagate — caching `[]` for a cancelled scan would
    // poison the cache for any subsequent scan that tries to reuse it.
    if (err instanceof Error && err.name === "AbortError") throw err;
    m.set(dir, []);
    return [];
  }
}

function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf("/");
  if (idx < 0) return { dir: "", name: path };
  return { dir: path.slice(0, idx), name: path.slice(idx + 1) };
}

// Returns the canonical path (dir + matched basename) when the entry exists,
// or null otherwise. Callers in truthy/falsy patterns keep working; callers
// that need to read the file (e.g. file_contains with case_insensitive) must
// use the returned canonical path so every segment matches actual repo casing.
// When `caseInsensitive` is true, every path segment is resolved via a
// case-insensitive walk through `listDirCached`, so nested paths like
// `Docs/Readme.md` vs `docs/README.md` resolve correctly. The non-CI fast
// path (single directory listing + exact basename compare) is preserved.
async function pathExists(
  token: string,
  owner: string,
  repo: string,
  path: string,
  cache: DirCache,
  expect?: "file" | "dir",
  caseInsensitive: boolean = false,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!caseInsensitive) {
    const { dir, name } = splitPath(path);
    const items = await listDirCached(token, owner, repo, dir, cache, signal);
    const found = items.find((i) => i.name === name);
    if (!found) return null;
    if (expect === "file" && found.type !== "file") return null;
    if (expect === "dir" && found.type !== "dir") return null;
    return dir ? `${dir}/${found.name}` : found.name;
  }

  // Case-insensitive walk: resolve each segment against the actual repo
  // listing so the dir portion picks up real casing. Reuses listDirCached so
  // cache invalidation behaves identically to the fast path.
  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  let canonicalDir = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const items = await listDirCached(token, owner, repo, canonicalDir, cache, signal);
    const lower = segment.toLowerCase();
    const match = items.find((it) => it.name.toLowerCase() === lower);
    if (!match) return null;
    const isLast = i === segments.length - 1;
    if (!isLast && match.type !== "dir") return null;
    if (isLast) {
      if (expect === "file" && match.type !== "file") return null;
      if (expect === "dir" && match.type !== "dir") return null;
    }
    canonicalDir = canonicalDir ? `${canonicalDir}/${match.name}` : match.name;
  }
  return canonicalDir;
}

function resolveClassification(
  doc: ChecklistDocument,
  repo: string,
): ProjectClassification | null {
  return doc.project_classification[repo] ?? null;
}

function ruleApplies(rule: ChecklistRule, cls: ProjectClassification): boolean {
  const a = rule.applies_to ?? {};
  if (a.tiers && !a.tiers.includes(cls.tier)) return false;
  // Tri-state: undefined = no constraint, true = only complex, false = only NOT complex.
  if (a.complex !== undefined && a.complex !== cls.complex) return false;
  if (a.client !== undefined && a.client !== cls.client) return false;
  return true;
}

// Sentinel so the UI can distinguish "this repo isn't classified yet" from
// generic GitHub/network errors without relying on substring matches against
// human-readable error text.
export class ClassificationMissingError extends Error {
  readonly repo: string;
  constructor(repo: string) {
    super(`Repo ${repo} is not classified in PROJECT_CHECKLIST.yaml`);
    this.name = "ClassificationMissingError";
    this.repo = repo;
  }
}

interface RunCtx {
  token: string;
  owner: string;
  repo: string;
  classification: ProjectClassification;
  doc: ChecklistDocument;
  dirCache: DirCache;
  inGrace: boolean;
  // Shared lazy promise so multiple rules in the same scan don't each refetch
  // the auditor project list. `null` means the service was unreachable.
  auditProjectsPromise?: Promise<AuditProjectStatus[] | null>;
  // Shared lazy promise for `.makeit/project.yaml`. Resolved once per repo
  // scan and reused by every artifact-path-aware rule + by runHealthCheck
  // for HealthReport.discovery. AbortError propagates as with dirCache.
  projectYamlPromise?: Promise<ProjectYamlState>;
  // Forwarded to every fetch helper. When this aborts, all in-flight rule
  // checks reject with AbortError and the top-level Promise.all reflects it.
  signal?: AbortSignal;
}

function getAuditProjects(ctx: RunCtx): Promise<AuditProjectStatus[] | null> {
  if (!ctx.auditProjectsPromise) {
    ctx.auditProjectsPromise = fetchAuditProjects().catch((err) => {
      if (err instanceof Error && err.name === "AbortError") throw err;
      return null;
    });
  }
  return ctx.auditProjectsPromise;
}

// Read and parse `.makeit/project.yaml` from the repo via GitHub Contents API.
// Returns one of three states:
//   - { kind: "loaded", data } — parsed successfully + minimal structure ok
//   - { kind: "missing" } — file not present (legacy/pre-retrofit, not error)
//   - { kind: "invalid", reason } — file present but malformed
// Result is cached on `ctx.projectYamlPromise` for the lifetime of the scan.
function getProjectYaml(ctx: RunCtx): Promise<ProjectYamlState> {
  if (ctx.projectYamlPromise) return ctx.projectYamlPromise;
  ctx.projectYamlPromise = (async (): Promise<ProjectYamlState> => {
    let text: string;
    try {
      text = await readRepoFile(ctx.token, ctx.owner, ctx.repo, PROJECT_YAML_PATH, ctx.signal);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // readRepoFile throws on 404 — treat as missing, not invalid.
      return { kind: "missing" };
    }
    let parsed: unknown;
    try {
      parsed = yaml.load(text);
    } catch (err) {
      return { kind: "invalid", reason: `YAML parse error: ${(err as Error).message}` };
    }
    const validation = validateProjectYaml(parsed);
    if (validation.kind === "invalid") return validation;
    return { kind: "loaded", data: validation.data };
  })();
  return ctx.projectYamlPromise;
}

// Structural + enum + paired-field validation of the parsed project.yaml.
// Returns `{ kind: "loaded", data }` if valid, `{ kind: "invalid", reason }`
// otherwise. Codex review d118a6a P2: paired_fields_xor is part of contract
// validity, folded in here.
// Exported для direct unit testing (см. health-engine.test.ts) — это pure
// function, не требует mocking RunCtx или GitHub API.
export function validateProjectYaml(
  parsed: unknown,
):
  | { kind: "loaded"; data: ProjectYaml }
  | { kind: "invalid"; reason: string } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "invalid", reason: "корневой объект не найден" };
  }
  const p = parsed as Record<string, unknown>;

  if (p.version !== 1) {
    return { kind: "invalid", reason: `version должно быть 1, получено ${JSON.stringify(p.version)}` };
  }
  if (typeof p.project_name !== "string" || p.project_name.length === 0) {
    return { kind: "invalid", reason: "project_name отсутствует или не строка" };
  }
  if (typeof p.complexity !== "string" || !VALID_COMPLEXITIES.has(p.complexity)) {
    return { kind: "invalid", reason: `complexity должно быть transactional|simple, получено ${JSON.stringify(p.complexity)}` };
  }
  if (!p.discovery || typeof p.discovery !== "object") {
    return { kind: "invalid", reason: "discovery блок отсутствует" };
  }

  const disc = p.discovery as Record<string, unknown>;
  if (typeof disc.status !== "string" || !VALID_DISCOVERY_STATUSES.has(disc.status)) {
    return { kind: "invalid", reason: `discovery.status должно быть completed|not_required|in_progress, получено ${JSON.stringify(disc.status)}` };
  }

  // Paired-field validation для market_research / market_research_na_reason.
  // Codex review d118a6a P2: эти поля — часть contract validity, не косметика.
  if (disc.artifacts && typeof disc.artifacts === "object") {
    const arts = disc.artifacts as Record<string, unknown>;
    if ("market_research" in arts || "market_research_na_reason" in arts) {
      const mr = arts.market_research;
      const naReason = arts.market_research_na_reason;
      const mrIsPath = typeof mr === "string" && mr.length > 0;
      const naIsReason = typeof naReason === "string" && naReason.length > 0;
      if (!mrIsPath && !naIsReason) {
        return { kind: "invalid", reason: "market_research и market_research_na_reason оба пусты — нарушение парного контракта (нужно одно из двух)" };
      }
      if (mrIsPath && naIsReason) {
        return { kind: "invalid", reason: "market_research и market_research_na_reason оба заполнены — нарушение парного контракта (взаимоисключающие)" };
      }
    }
  }

  return { kind: "loaded", data: parsed as ProjectYaml };
}

// Resolves the artifact path to actually check on disk:
// 1. If `.makeit/project.yaml` is loaded AND has `discovery.artifacts[key]`
//    as a non-null string → use that path (the canonical one written by
//    makeit-discovery skill).
// 2. Otherwise → use the rule's hardcoded `fallback` path (legacy behavior).
// 3. Returns null if artifacts[key] is explicitly null (marker for "this
//    project skipped this artifact with a reason", e.g. market_research:null
//    + market_research_na_reason set).
//
// Codex review d118a6a P1: artifact-path dereferencing is critical, not P3.
// Without it, retrofitted projects fail health on legacy paths even though
// discovery succeeded.
async function resolveArtifactPath(
  ctx: RunCtx,
  artifactKey: keyof ProjectYamlArtifacts | undefined,
  fallback: string,
): Promise<{ path: string; source: "project_yaml" | "fallback"; intentional_skip?: boolean }> {
  if (!artifactKey) return { path: fallback, source: "fallback" };
  const state = await getProjectYaml(ctx);
  if (state.kind !== "loaded") return { path: fallback, source: "fallback" };
  const arts = state.data.discovery.artifacts;
  if (!arts || !(artifactKey in arts)) return { path: fallback, source: "fallback" };
  const value = arts[artifactKey];
  if (value === null) {
    // Explicit skip marker (e.g. market_research:null + na_reason set).
    return { path: fallback, source: "project_yaml", intentional_skip: true };
  }
  if (typeof value === "string" && value.length > 0) {
    return { path: value, source: "project_yaml" };
  }
  return { path: fallback, source: "fallback" };
}

async function executeCheck(rule: ChecklistRule, ctx: RunCtx): Promise<HealthFinding> {
  const base: Omit<HealthFinding, "status" | "detail"> = {
    rule_id: rule.id,
    title: rule.title,
    layer: rule.layer,
    severity: rule.severity,
    remediation: rule.remediation,
    source: rule.source,
  };
  const c = rule.check;

  // Grace period: skip non-critical rules for fresh projects.
  if (ctx.inGrace && !ctx.doc.no_grace_severities.includes(rule.severity)) {
    return { ...base, status: "skipped", detail: `Grace period (${ctx.doc.settings.grace_period_days}d)` };
  }

  try {
    switch (c.type) {
      case "file_exists": {
        const fallbackPath = param(c, "path", "");
        const artifactKey = param<keyof ProjectYamlArtifacts | undefined>(c, "artifact_key", undefined);
        const caseInsensitive = param<boolean>(c, "case_insensitive", false);
        const resolved = await resolveArtifactPath(ctx, artifactKey, fallbackPath);
        if (resolved.intentional_skip) {
          return { ...base, status: "skipped", detail: `${artifactKey}: явно пропущен в .makeit/project.yaml (см. *_na_reason)` };
        }
        const ok = await pathExists(ctx.token, ctx.owner, ctx.repo, resolved.path, ctx.dirCache, "file", caseInsensitive, ctx.signal);
        const sourceTag = resolved.source === "project_yaml" ? " (из .makeit/project.yaml)" : "";
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok ? `${resolved.path}${sourceTag}` : `Нет файла ${resolved.path}${sourceTag}`,
        };
      }

      case "file_not_empty": {
        const path = param(c, "path", "");
        const minBytes = param<number>(c, "min_bytes", 1);
        const ok = await pathExists(ctx.token, ctx.owner, ctx.repo, path, ctx.dirCache, "file", false, ctx.signal);
        if (!ok) return { ...base, status: "fail", detail: `Нет файла ${path}` };
        try {
          const text = await readRepoFile(ctx.token, ctx.owner, ctx.repo, path, ctx.signal);
          const isOk = text.length >= minBytes;
          return { ...base, status: isOk ? "pass" : "fail", detail: isOk ? path : `${path}: ${text.length} байт` };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          return { ...base, status: "unknown", detail: `Не удалось прочитать ${path}` };
        }
      }

      case "file_contains": {
        const fallbackPath = param(c, "path", "");
        const artifactKey = param<keyof ProjectYamlArtifacts | undefined>(c, "artifact_key", undefined);
        const contains = param<string | undefined>(c, "contains", undefined);
        const containsAny = param<string[] | undefined>(c, "contains_any", undefined);
        const caseInsensitive = param<boolean>(c, "case_insensitive", false);
        const resolved = await resolveArtifactPath(ctx, artifactKey, fallbackPath);
        if (resolved.intentional_skip) {
          return { ...base, status: "skipped", detail: `${artifactKey}: явно пропущен в .makeit/project.yaml` };
        }
        const path = resolved.path;
        const canonicalPath = await pathExists(ctx.token, ctx.owner, ctx.repo, path, ctx.dirCache, "file", caseInsensitive, ctx.signal);
        if (!canonicalPath) {
          return { ...base, status: "fail", detail: `Нет файла ${path}` };
        }
        try {
          const text = await readRepoFile(ctx.token, ctx.owner, ctx.repo, canonicalPath, ctx.signal);
          const ok = contains
            ? text.includes(contains)
            : Array.isArray(containsAny) && containsAny.some((s) => text.includes(s));
          return {
            ...base,
            status: ok ? "pass" : "fail",
            detail: ok ? `${path} ✓` : `${path} не содержит «${contains ?? containsAny?.join(" / ")}»`,
          };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          return { ...base, status: "unknown", detail: `Не удалось прочитать ${path}` };
        }
      }

      case "file_absent_glob": {
        // Глобы простые: имя файла без подстановок (используем как exact-match
        // на уровне корня + поиск по всему дереву через GitHub git tree, если
        // нужно). MVP — проверяем только корень репо.
        const globAny = param<string[]>(c, "glob_any", [param<string>(c, "glob", "")]);
        const items = await listDirCached(ctx.token, ctx.owner, ctx.repo, "", ctx.dirCache, ctx.signal);
        const found = items.find((i) => globAny.includes(i.name));
        return {
          ...base,
          status: found ? "fail" : "pass",
          detail: found ? `Найден ${found.path}` : "В корне нет",
        };
      }

      case "dir_not_empty": {
        const fallbackPath = param(c, "path", "");
        const artifactKey = param<keyof ProjectYamlArtifacts | undefined>(c, "artifact_key", undefined);
        const resolved = await resolveArtifactPath(ctx, artifactKey, fallbackPath);
        if (resolved.intentional_skip) {
          return { ...base, status: "skipped", detail: `${artifactKey}: явно пропущен в .makeit/project.yaml` };
        }
        const path = resolved.path;
        const items = await listDirCached(ctx.token, ctx.owner, ctx.repo, path, ctx.dirCache, ctx.signal);
        const ok = items.length > 0;
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok ? `${path}/ — ${items.length} файлов` : `${path}/ пуста или отсутствует`,
        };
      }

      case "repo_label_present": {
        const required = param<string[]>(c, "names_all_of", []);
        const labels = await listRepoLabels(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const set = new Set(labels);
        const missing = required.filter((n) => !set.has(n));
        return {
          ...base,
          status: missing.length === 0 ? "pass" : "fail",
          detail: missing.length === 0 ? "Все стандартные лейблы есть" : `Не хватает: ${missing.join(", ")}`,
        };
      }

      case "repo_label_absent": {
        const forbidden = param<string[]>(c, "names_any_of", []);
        const labels = await listRepoLabels(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const set = new Set(labels);
        const found = forbidden.filter((n) => set.has(n));
        return {
          ...base,
          status: found.length === 0 ? "pass" : "fail",
          detail: found.length === 0 ? "Запрещённых лейблов нет" : `Найдены: ${found.join(", ")}`,
        };
      }

      case "workflow_with_tests": {
        const matches = param<string[]>(c, "filename_match", ["test", "ci"]);
        const workflows = await listWorkflows(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const hit = workflows.find((w) => {
          const haystack = `${w.name} ${w.path}`.toLowerCase();
          return matches.some((m) => haystack.includes(m.toLowerCase()));
        });
        return {
          ...base,
          status: hit ? "pass" : "fail",
          detail: hit ? `Workflow ${hit.path}` : `Нет workflow с тестами`,
        };
      }

      case "workflow_recent_run_status": {
        const matches = param<string[]>(c, "workflow_match", ["test", "ci"]);
        const wantStatus = param<string>(c, "status", "success");
        const workflows = await listWorkflows(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const wf = workflows.find((w) => {
          const haystack = `${w.name} ${w.path}`.toLowerCase();
          return matches.some((m) => haystack.includes(m.toLowerCase()));
        });
        if (!wf) return { ...base, status: "fail", detail: "Нет workflow с тестами" };
        const run = await getLatestWorkflowRun(ctx.token, ctx.owner, ctx.repo, wf.id, ctx.signal);
        if (!run) return { ...base, status: "unknown", detail: `Нет запусков ${wf.name}` };
        const ok = run.conclusion === wantStatus;
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: `${wf.name}: последний run ${run.conclusion ?? run.status}`,
        };
      }

      case "issues_without_milestone": {
        const max = resolveRef<number>(
          c.max_count,
          ctx.doc.settings,
          ctx.doc.settings.issues_no_milestone_threshold,
        );
        const numbers = await listIssuesWithoutMilestone(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const ok = numbers.length <= max;
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: `${numbers.length} issues без milestone (порог ${max})${
            numbers.length > 0 ? `: ${numbers.slice(0, 5).map((n) => `#${n}`).join(", ")}` : ""
          }`,
        };
      }

      case "stale_milestones": {
        const max = param<number>(c, "max_count", 0);
        const ms = await listMilestones(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const today = new Date().toISOString().slice(0, 10);
        const stale = ms.filter(
          (m) => m.state === "open" && m.due_on && m.due_on.slice(0, 10) < today,
        );
        const ok = stale.length <= max;
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok
            ? `Нет просроченных milestones`
            : `Просрочено: ${stale.map((m) => m.title).slice(0, 3).join(", ")}${stale.length > 3 ? "..." : ""}`,
        };
      }

      case "external_file_exists": {
        const externalRepo = param<string>(c, "repo", "");
        const pathTpl = param<string>(c, "path_template", param<string>(c, "path", ""));
        const path = resolveExternalPath(externalRepo, pathTpl, ctx.classification, ctx.repo);
        const [extOwner, extRepoName] = externalRepo.split("/");
        if (!extOwner || !extRepoName) return { ...base, status: "unknown", detail: "Bad external repo" };
        const ok = await pathExists(ctx.token, extOwner, extRepoName, path, ctx.dirCache, "file", false, ctx.signal);
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok ? `${externalRepo}:${path}` : `Нет ${externalRepo}:${path}`,
        };
      }

      case "new_project_missing_doc": {
        const externalRepo = param<string>(c, "external_repo", "");
        const pathTpl = param<string>(c, "path_template", "");
        const ageMin = param<number>(c, "project_age_days_min", 7);
        const path = resolveExternalPath(externalRepo, pathTpl, ctx.classification, ctx.repo);
        const meta = await getRepoMeta(ctx.token, ctx.owner, ctx.repo, ctx.signal);
        const ageDays = (Date.now() - new Date(meta.created_at).getTime()) / 86400000;
        if (ageDays < ageMin) {
          return { ...base, status: "skipped", detail: `Проект ${Math.floor(ageDays)} дн., grace ${ageMin}` };
        }
        const [extOwner, extRepoName] = externalRepo.split("/");
        if (!extOwner || !extRepoName) return { ...base, status: "unknown", detail: "Bad external repo" };
        const ok = await pathExists(ctx.token, extOwner, extRepoName, path, ctx.dirCache, "file", false, ctx.signal);
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok
            ? `${externalRepo}:${path}`
            : `Проекту ${Math.floor(ageDays)} дн., нет ${externalRepo}:${path}`,
        };
      }

      case "doc_freshness": {
        const externalRepo = param<string | undefined>(c, "external_repo", undefined);
        const pathTpl = param<string | undefined>(c, "path_template", undefined);
        const literalPath = param<string | undefined>(c, "path", undefined);
        const artifactKey = param<keyof ProjectYamlArtifacts | undefined>(c, "artifact_key", undefined);
        let path: string;
        if (externalRepo && pathTpl) {
          // External repo path — artifact_key не применяется (artifacts только
          // в проекте под scan, не в makeit-knowledge).
          path = resolveExternalPath(externalRepo, pathTpl, ctx.classification, ctx.repo);
        } else {
          const fallbackPath = (pathTpl ? pathTpl.replace("{repo}", ctx.repo) : literalPath) ?? "";
          const resolved = await resolveArtifactPath(ctx, artifactKey, fallbackPath);
          if (resolved.intentional_skip) {
            return { ...base, status: "skipped", detail: `${artifactKey}: явно пропущен в .makeit/project.yaml` };
          }
          path = resolved.path;
        }
        if (!path) return { ...base, status: "unknown", detail: "doc_freshness: нет пути" };

        let owner = ctx.owner;
        let repo = ctx.repo;
        if (externalRepo) {
          const [eo, er] = externalRepo.split("/");
          if (!eo || !er) return { ...base, status: "unknown", detail: "doc_freshness: bad external_repo" };
          owner = eo;
          repo = er;
        }

        const maxAge = resolveRef<number>(c.max_age_days, ctx.doc.settings, 90);
        const maxClosedSince = resolveRef<number | undefined>(
          c.max_closed_issues_since,
          ctx.doc.settings,
          undefined as unknown as number,
        );
        const minLines = resolveRef<number>(
          c.min_meaningful_change_lines,
          ctx.doc.settings,
          0,
        );

        const commits = await listCommitsForPath(ctx.token, owner, repo, path, 10, ctx.signal);
        if (commits.length === 0) {
          // Без коммитов нельзя ни о чём судить — file_exists ловит реальное
          // отсутствие файла, здесь возвращаем unknown.
          return { ...base, status: "unknown", detail: `Нет истории коммитов для ${path}` };
        }

        // Find the last *meaningful* commit by walking newest → oldest and
        // accumulating additions+deletions until we cross min_meaningful.
        let cumulative = 0;
        let meaningfulDate: string | null = null;
        if (minLines <= 0) {
          meaningfulDate = commits[0].date;
        } else {
          for (const cm of commits) {
            const files = await getCommitFiles(ctx.token, owner, repo, cm.sha, ctx.signal);
            const f = files.find((x) => x.filename === path);
            if (f) cumulative += f.additions + f.deletions;
            if (cumulative >= minLines) {
              meaningfulDate = cm.date;
              break;
            }
          }
        }
        // If we never reached the threshold within the 10-commit window —
        // the doc has only had typo-level edits. We anchor to the oldest
        // commit in the window so "age" reflects "since the last truly
        // meaningful edit", not "since the last keystroke".
        const onlyTrivialEdits = meaningfulDate === null;
        const refDate = meaningfulDate ?? commits[commits.length - 1].date;
        const ageDays = Math.floor((Date.now() - new Date(refDate).getTime()) / 86400000);

        const reasons: string[] = [];
        if (ageDays > maxAge) {
          reasons.push(
            onlyTrivialEdits
              ? `${ageDays} дн. без содержательных правок (только typo-уровень, порог ${maxAge})`
              : `${ageDays} дн. без правок (порог ${maxAge})`,
          );
        }

        // Closed-issue counter against the *target* repo (the project itself,
        // even if the doc lives in makeit-knowledge — issues are closed in
        // the project repo, that's where the work happens).
        if (typeof maxClosedSince === "number" && maxClosedSince > 0) {
          const closedCount = await countClosedIssuesSince(
            ctx.token,
            ctx.owner,
            ctx.repo,
            refDate,
            ctx.signal,
          );
          if (closedCount >= maxClosedSince) {
            reasons.push(`закрыто ${closedCount} issues с правки (порог ${maxClosedSince})`);
          }
        }

        if (reasons.length === 0) {
          return {
            ...base,
            status: "pass",
            detail: `Свежо (${ageDays} дн., ${commits.length} коммитов в окне)`,
          };
        }
        return { ...base, status: "fail", detail: reasons.join("; ") };
      }

      case "coverage_badge_present": {
        const path = param<string>(c, "path", "README.md");
        if (!(await pathExists(ctx.token, ctx.owner, ctx.repo, path, ctx.dirCache, "file", false, ctx.signal))) {
          return { ...base, status: "fail", detail: `Нет ${path}` };
        }
        try {
          const text = await readRepoFile(ctx.token, ctx.owner, ctx.repo, path, ctx.signal);
          const re = /(codecov|coveralls)\.io|shields\.io\/(codecov|coveralls)|img\.shields\.io\/codecov/i;
          const ok = re.test(text);
          return {
            ...base,
            status: ok ? "pass" : "fail",
            detail: ok ? "Coverage badge найден в README" : "В README нет coverage-бейджа (codecov/coveralls)",
          };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          return { ...base, status: "unknown", detail: `Не удалось прочитать ${path}` };
        }
      }

      case "coverage_threshold": {
        const thresholds = ctx.doc.settings.coverage_thresholds;
        const tier = ctx.classification.tier;
        if (tier === 3) {
          return { ...base, status: "skipped", detail: "Tier 3 — coverage не требуется" };
        }
        let threshold = 0;
        if (tier === 1) {
          threshold = ctx.classification.complex ? thresholds.tier_1_complex : thresholds.tier_1;
        } else if (tier === 2) {
          threshold = thresholds.tier_2;
        }

        // Try shields.io public JSON for codecov first; works even when the
        // dashboard repo's own GitHub token is not authorised for codecov.
        // shields.io occasionally returns transient 5xx — retry once with
        // exponential backoff before giving up as `unknown`.
        const url = `https://img.shields.io/codecov/c/github/${ctx.owner}/${ctx.repo}.json`;
        try {
          const r = await fetchWithRetry(url, 1, 250, ctx.signal);
          if (!r.ok) {
            return { ...base, status: "unknown", detail: `coverage сервис недоступен (HTTP ${r.status})` };
          }
          const json = await r.json();
          const value = String(json.value ?? "").trim();
          const m = value.match(/(\d+(?:\.\d+)?)\s*%/);
          if (!m) {
            return { ...base, status: "unknown", detail: `coverage = "${value}", не получилось распарсить` };
          }
          const pct = Number(m[1]);
          const ok = pct >= threshold;
          return {
            ...base,
            status: ok ? "pass" : "fail",
            detail: `${pct}% (порог tier ${tier}${ctx.classification.complex ? " complex" : ""}: ${threshold}%)`,
          };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          const msg = err instanceof Error ? err.message : "fetch error";
          return { ...base, status: "unknown", detail: `coverage сервис недоступен: ${msg}` };
        }
      }

      case "pr_touches_code_not_docs": {
        const windowDays = resolveRef<number>(c.window_days, ctx.doc.settings, 30);
        const maxCount = resolveRef<number>(c.max_count, ctx.doc.settings, 3);
        const codeGlobs = param<string[]>(c, "code_globs", ["app/**", "src/**"]);
        const docGlobs = param<string[]>(c, "doc_globs", ["docs/**", "README.md", "CLAUDE.md"]);
        // The drift rule is defined over *all* merged PRs in the window.
        // Raise the cap to 200 (was 30) so older in-window PRs in busy repos
        // aren't silently dropped — the paginator now scales pages from
        // hardLimit, so 200 actually delivers up to 200 PRs (previously the
        // inline 5-page cap clamped output at 150 regardless of hardLimit).
        // The window short-circuits pagination once sorted-desc updated_at
        // crosses it, so quiet repos still cost just a single REST page.
        const prs = await listMergedPRsInWindow(ctx.token, ctx.owner, ctx.repo, windowDays, 200, ctx.signal);
        if (prs.length === 0) {
          return { ...base, status: "pass", detail: `Нет смерженных PR за ${windowDays} дн.` };
        }
        // Fan out getPRFiles with a small concurrency cap so a 200-PR window
        // doesn't serialize 200 sequential REST calls. 5 concurrent keeps
        // GitHub well under its secondary-rate-limit thresholds while cutting
        // worst-case wall time ~5×.
        const PR_FILES_CONCURRENCY = 5;
        let driftCount = 0;
        const driftPrs: number[] = [];
        for (let i = 0; i < prs.length; i += PR_FILES_CONCURRENCY) {
          const chunk = prs.slice(i, i + PR_FILES_CONCURRENCY);
          const chunkResults = await Promise.all(
            chunk.map((pr) =>
              getPRFiles(ctx.token, ctx.owner, ctx.repo, pr.number, ctx.signal).then(
                (files) => ({ pr, files }),
              ),
            ),
          );
          for (const { pr, files } of chunkResults) {
            const touchesCode = files.some((f) => pathMatchesAny(f, codeGlobs));
            const touchesDocs = files.some((f) => pathMatchesAny(f, docGlobs));
            if (touchesCode && !touchesDocs) {
              driftCount++;
              driftPrs.push(pr.number);
            }
          }
        }
        const ok = driftCount <= maxCount;
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok
            ? `${driftCount} PR без обновления доков за ${windowDays} дн. (порог ${maxCount})`
            : `${driftCount} PR за ${windowDays} дн. без правок в docs/: ${driftPrs.slice(0, 5).map((n) => `#${n}`).join(", ")}`,
        };
      }

      // ── Onboarding Readiness (Epic-012 Task-04) ──────────────────────────
      case "deploy_doc_present": {
        // Passes if either docs/DEPLOY.md exists OR README.md contains a
        // recognisable "## Deploy" section heading. Either form of deploy
        // instruction is acceptable — small projects keep it inline, larger
        // ones split it into a dedicated doc.
        const deployPath = param<string>(c, "deploy_doc_path", "docs/DEPLOY.md");
        const readmePath = param<string>(c, "readme_path", "README.md");
        const readmeSection = param<string>(c, "readme_section", "## Deploy");

        const deployExists = await pathExists(
          ctx.token,
          ctx.owner,
          ctx.repo,
          deployPath,
          ctx.dirCache,
          "file",
          false,
          ctx.signal,
        );
        if (deployExists) {
          return { ...base, status: "pass", detail: `${deployPath} ✓` };
        }

        const readmeCanonical = await pathExists(
          ctx.token,
          ctx.owner,
          ctx.repo,
          readmePath,
          ctx.dirCache,
          "file",
          false,
          ctx.signal,
        );
        if (!readmeCanonical) {
          return {
            ...base,
            status: "fail",
            detail: `Нет ${deployPath} и нет ${readmePath}`,
          };
        }
        try {
          const text = await readRepoFile(
            ctx.token,
            ctx.owner,
            ctx.repo,
            readmeCanonical,
            ctx.signal,
          );
          // Match on a heading at start-of-line so "## Deployment notes"
          // counts but a stray mention of "deploy" in prose doesn't.
          const re = new RegExp(
            `^${readmeSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            "im",
          );
          const ok = re.test(text);
          return {
            ...base,
            status: ok ? "pass" : "fail",
            detail: ok
              ? `${readmePath}: раздел «${readmeSection}» ✓`
              : `Нет ${deployPath} и нет раздела «${readmeSection}» в ${readmePath}`,
          };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          return { ...base, status: "unknown", detail: `Не удалось прочитать ${readmePath}` };
        }
      }

      case "audit_fresh": {
        // Reads the Auditor service to find the latest run for this repo.
        // The service is optional in many environments (local dev without
        // an auditor running) — return `unknown` rather than `fail` so a
        // missing service doesn't ding the score.
        // Uses a scan-scoped memo so portfolio scans don't refetch the
        // full project list once per repo.
        const maxAgeDays = param<number>(c, "max_age_days", 30);
        const projects = await getAuditProjects(ctx);
        if (projects === null) {
          return { ...base, status: "unknown", detail: "Auditor service недоступен" };
        }
        // Match by `repo` first (canonical), fall back to `name` for legacy
        // projects whose auditor entry pre-dates the `repo` field.
        const entry = projects.find((p) => p.repo === ctx.repo || p.name === ctx.repo);
        if (!entry) {
          return {
            ...base,
            status: "fail",
            detail: `Проект не зарегистрирован в auditor`,
          };
        }
        if (!entry.last_run) {
          return {
            ...base,
            status: "fail",
            detail: `Audit ещё не запускался (порог ${maxAgeDays} дн.)`,
          };
        }
        const ageMs = Date.now() - new Date(entry.last_run.timestamp).getTime();
        const ageDays = Math.floor(ageMs / 86400000);
        const ok = ageDays <= maxAgeDays;
        return {
          ...base,
          status: ok ? "pass" : "fail",
          detail: ok
            ? `Свежий audit (${ageDays} дн. назад)`
            : `Audit ${ageDays} дн. назад (порог ${maxAgeDays})`,
        };
      }

      // ── Discovery contract checks (P1 from Codex review d118a6a) ─────────

      case "project_yaml_valid": {
        // Validates structural integrity of .makeit/project.yaml: parseable,
        // required fields, enum для status/complexity, paired market_research
        // contract. File absence is acceptable here (legacy project) — surface
        // as "skipped" not "fail" so legacy projects don't burn score until
        // they get retrofitted.
        const state = await getProjectYaml(ctx);
        if (state.kind === "missing") {
          return { ...base, status: "skipped", detail: "Нет .makeit/project.yaml (legacy / pre-retrofit)" };
        }
        if (state.kind === "invalid") {
          return { ...base, status: "fail", detail: state.reason };
        }
        return { ...base, status: "pass", detail: "Контракт корректен" };
      }

      case "classification_consistent": {
        // Codex review d118a6a P1: silent override of complexity via
        // .makeit/project.yaml will mask divergence from
        // PROJECT_CHECKLIST.yaml::project_classification. Until we collapse to
        // a single source of truth, fail loudly on mismatch — no silent
        // preference. After all projects converge, this rule will reduce to
        // tautology and can be retired.
        const state = await getProjectYaml(ctx);
        if (state.kind === "missing") {
          return { ...base, status: "skipped", detail: "Нет .makeit/project.yaml — fallback на CHECKLIST classification" };
        }
        if (state.kind === "invalid") {
          // project_yaml_valid rule already surfaces the parse failure;
          // here we can't make a consistency decision, return unknown.
          return { ...base, status: "unknown", detail: "project.yaml невалиден — consistency не проверить" };
        }
        const yamlComplexity = state.data.complexity;
        const checklistComplex = ctx.classification.complex;
        const yamlIsComplex = yamlComplexity === "transactional";
        if (yamlIsComplex === checklistComplex) {
          return { ...base, status: "pass", detail: `${yamlComplexity} ↔ complex:${checklistComplex}` };
        }
        return {
          ...base,
          status: "fail",
          detail:
            `Расхождение: .makeit/project.yaml::complexity=${yamlComplexity} ` +
            `vs PROJECT_CHECKLIST.yaml::project_classification.complex=${checklistComplex}. ` +
            `Один из источников устарел — синхронизировать.`,
        };
      }

      case "discovery_not_stale": {
        // Codex review d118a6a P2: apply к completed И not_required (оба
        // green-состояния имеют review_due). `review_due` из файла wins over
        // computed completed_at + default. in_progress всегда fail.
        const state = await getProjectYaml(ctx);
        if (state.kind === "missing") {
          return { ...base, status: "skipped", detail: "Нет .makeit/project.yaml — нечего проверять на stale" };
        }
        if (state.kind === "invalid") {
          return { ...base, status: "unknown", detail: "project.yaml невалиден" };
        }
        const disc = state.data.discovery;
        if (disc.status === "in_progress") {
          const failuresHint = disc.validation_failures?.length
            ? ` (${disc.validation_failures.length} validation_failures, см. .makeit/project.yaml)`
            : "";
          return { ...base, status: "fail", detail: `Discovery в статусе in_progress${failuresHint}` };
        }
        // For green statuses (completed | not_required) — check freshness.
        const defaultDays = ctx.doc.settings.discovery_review_due_days ?? DISCOVERY_REVIEW_DUE_DEFAULT_DAYS;
        const reviewDue = disc.review_due
          ? new Date(disc.review_due)
          : disc.completed_at
            ? new Date(new Date(disc.completed_at).getTime() + defaultDays * 86400000)
            : null;
        if (!reviewDue || Number.isNaN(reviewDue.getTime())) {
          return { ...base, status: "unknown", detail: "Нет review_due и нет completed_at — не вычислить срок" };
        }
        const today = new Date();
        if (today < reviewDue) {
          const daysLeft = Math.ceil((reviewDue.getTime() - today.getTime()) / 86400000);
          return { ...base, status: "pass", detail: `Discovery ${disc.status}, до review_due ${daysLeft} дн.` };
        }
        const daysOverdue = Math.floor((today.getTime() - reviewDue.getTime()) / 86400000);
        return { ...base, status: "fail", detail: `Discovery просрочен на ${daysOverdue} дн. (review_due ${reviewDue.toISOString().slice(0, 10)})` };
      }

      // ── Layer 4 (LLM) — отложено, реализуется в iteration 3. ─────────────
      case "ai_template_filled":
      case "ai_doc_code_sync":
      case "ai_contract_milestones_sync":
      case "ai_knowledge_coverage":
      case "ai_claude_md_freshness":
        return { ...base, status: "unknown", detail: `LLM-проверка ${c.type} в разработке` };

      default:
        return { ...base, status: "unknown", detail: `Неизвестный тип проверки ${c.type}` };
    }
  } catch (err) {
    // AbortError must propagate up to runHealthCheck → the consumer hook,
    // otherwise a cancelled scan looks like a successful run with N "Ошибка
    // проверки: aborted" findings and gets persisted to cache.
    if (err instanceof Error && err.name === "AbortError") throw err;
    const msg = err instanceof Error ? err.message : "ошибка";
    return { ...base, status: "unknown", detail: `Ошибка проверки: ${msg}` };
  }
}

function computeScore(findings: HealthFinding[], doc: ChecklistDocument): HealthScore {
  let deduct = 0;
  for (const f of findings) {
    if (f.status !== "fail") continue;
    deduct += doc.severity_weights[f.severity] ?? 0;
  }
  const raw = Math.max(0, 100 - deduct);
  const grade: HealthScore["grade"] =
    raw >= 90 ? "A" : raw >= 75 ? "B" : raw >= 60 ? "C" : raw >= 40 ? "D" : "F";
  return { raw, grade };
}

// Trend history is stored in localStorage as a list of up to 7 score values.
// Updated on every successful scan, so the sparkline reflects "last 7 scans".
const TREND_PREFIX = "makeit_health_trend_";
const TREND_MAX = 7;

function loadTrendHistory(repo: string): number[] {
  try {
    const raw = localStorage.getItem(TREND_PREFIX + repo);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Reject NaN/Infinity and out-of-range values — protects sparkline math
    // (Math.min/max with NaN poisons the result) and any future mistakes
    // where score wasn't clamped before persistence.
    return parsed.filter(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
    );
  } catch {
    return [];
  }
}

function saveTrendHistory(repo: string, points: number[]): void {
  try {
    localStorage.setItem(TREND_PREFIX + repo, JSON.stringify(points));
  } catch {
    /* quota — drop silently */
  }
}

function buildTrend(repo: string, currentScore: number): HealthTrend {
  const prev = loadTrendHistory(repo);
  // Append current; cap at TREND_MAX to keep recent only.
  const points = [...prev, currentScore].slice(-TREND_MAX);
  saveTrendHistory(repo, points);
  const oldest = points[0];
  const delta = points.length > 1 ? currentScore - oldest : 0;
  const direction: HealthTrend["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { points, delta, direction };
}

function summarizeByLayer(findings: HealthFinding[]): Record<HealthLayer, HealthLayerSummary> {
  const empty: HealthLayerSummary = { total: 0, pass: 0, fail: 0, unknown: 0, skipped: 0 };
  const out: Record<HealthLayer, HealthLayerSummary> = {
    1: { ...empty },
    2: { ...empty },
    3: { ...empty },
    4: { ...empty },
  };
  for (const f of findings) {
    const s = out[f.layer];
    s.total++;
    s[f.status]++;
  }
  return out;
}

export async function runHealthCheck(
  token: string,
  owner: string,
  repo: string,
  doc: ChecklistDocument,
  signal?: AbortSignal,
): Promise<HealthReport> {
  const cls = resolveClassification(doc, repo);
  if (!cls) {
    throw new ClassificationMissingError(repo);
  }

  // Grace check — uses repo creation date.
  let inGrace = false;
  try {
    const meta = await getRepoMeta(token, owner, repo, signal);
    const ageDays = (Date.now() - new Date(meta.created_at).getTime()) / 86400000;
    inGrace = ageDays < doc.settings.grace_period_days;
  } catch (err) {
    // Cancellation must abort the whole scan, not silently flip into a
    // non-grace run that fans out N more rule fetches before failing.
    if (err instanceof Error && err.name === "AbortError") throw err;
    inGrace = false;
  }

  const ctx: RunCtx = {
    token,
    owner,
    repo,
    classification: cls,
    doc,
    dirCache: new Map(),
    inGrace,
    signal,
  };

  // Apply applicable rules. We run with limited concurrency so a single repo
  // doesn't fan out 50 GitHub calls in parallel and trip secondary rate limits.
  // Semaphore gives smooth concurrency — a new rule starts as soon as a slot
  // frees, instead of waiting for the whole batch to finish.
  const applicable = doc.rules.filter((r) => ruleApplies(r, cls));
  const RULE_CONCURRENCY = 5;
  const sem = new Semaphore(RULE_CONCURRENCY);
  // executeCheck is total — its global try/catch maps any throw to an
  // `unknown` finding — so this Promise.all never rejects in practice.
  const findings: HealthFinding[] = await Promise.all(
    applicable.map((rule) => sem.run(() => executeCheck(rule, ctx))),
  );

  // Surface skipped (not-applicable) rules so the UI can show coverage too.
  for (const r of doc.rules) {
    if (ruleApplies(r, cls)) continue;
    findings.push({
      rule_id: r.id,
      title: r.title,
      layer: r.layer,
      severity: r.severity,
      status: "skipped",
      detail: "Не применимо к этому tier'у",
      remediation: r.remediation,
      source: r.source,
    });
  }

  const score = computeScore(findings, doc);
  const trend = buildTrend(repo, score.raw);
  const discovery = await summarizeDiscovery(ctx);
  return {
    repo,
    generated_at: new Date().toISOString(),
    classification: cls,
    in_grace_period: inGrace,
    grace_period_days: doc.settings.grace_period_days,
    findings,
    score,
    by_layer: summarizeByLayer(findings),
    trend,
    discovery,
  };
}

// First-class discovery summary for HealthReport — UI badge reads from here.
// Codex review d118a6a P3: discovery state must be a first-class report field,
// not derived from findings (skipped/unknown/missing cases make findings fragile).
async function summarizeDiscovery(ctx: RunCtx): Promise<HealthReportDiscovery> {
  const state = await getProjectYaml(ctx);
  if (state.kind === "missing") {
    return { status: "missing" };
  }
  if (state.kind === "invalid") {
    return { status: "invalid" };
  }
  const data = state.data;
  const disc = data.discovery;
  const defaultDays = ctx.doc.settings.discovery_review_due_days ?? DISCOVERY_REVIEW_DUE_DEFAULT_DAYS;
  const reviewDueDate = disc.review_due
    ? new Date(disc.review_due)
    : disc.completed_at
      ? new Date(new Date(disc.completed_at).getTime() + defaultDays * 86400000)
      : null;
  const reviewDueIso =
    reviewDueDate && !Number.isNaN(reviewDueDate.getTime())
      ? reviewDueDate.toISOString().slice(0, 10)
      : undefined;
  const isGreen = disc.status === "completed" || disc.status === "not_required";
  const fresh = isGreen && reviewDueDate ? new Date() < reviewDueDate : isGreen && !reviewDueDate ? true : false;
  return {
    status: disc.status,
    complexity: data.complexity,
    completed_at: disc.completed_at,
    review_due: reviewDueIso,
    fresh,
    validation_failures: disc.validation_failures,
  };
}
