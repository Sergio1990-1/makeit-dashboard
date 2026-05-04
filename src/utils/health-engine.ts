import type {
  ChecklistDocument,
  ChecklistRule,
  ChecklistSettings,
  HealthFinding,
  HealthLayer,
  HealthLayerSummary,
  HealthReport,
  HealthScore,
  HealthTrend,
  ProjectClassification,
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

// Helper: read a typed param from a check object with a fallback.
function param<T>(obj: Record<string, unknown>, key: string, fallback: T): T {
  return (obj[key] as T | undefined) ?? fallback;
}

// Fetch with bounded exponential backoff. Used for flaky third-party endpoints
// (shields.io) where transient 5xx / network blips are common. Last attempt's
// response is returned as-is so the caller can decide what to do with non-OK
// statuses; only thrown errors propagate after retries are exhausted.
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
      if (attempt < retries) {
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
// use the returned canonical path so the basename matches actual repo casing.
// `caseInsensitive` only normalizes the basename — the directory portion is
// passed verbatim to GitHub's `/contents/{dir}` endpoint, which is
// case-sensitive. For YAML rules currently using the flag (root-level docs
// like README.md / CHANGELOG.md) this is sufficient; nested paths with
// uncertain dir casing would need a per-segment walk.
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
  const { dir, name } = splitPath(path);
  const items = await listDirCached(token, owner, repo, dir, cache, signal);
  const found = caseInsensitive
    ? items.find((i) => i.name.toLowerCase() === name.toLowerCase())
    : items.find((i) => i.name === name);
  if (!found) return null;
  if (expect === "file" && found.type !== "file") return null;
  if (expect === "dir" && found.type !== "dir") return null;
  return dir ? `${dir}/${found.name}` : found.name;
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
  // Forwarded to every fetch helper. When this aborts, all in-flight rule
  // checks reject with AbortError and the top-level Promise.all reflects it.
  signal?: AbortSignal;
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
        const path = param(c, "path", "");
        const caseInsensitive = param<boolean>(c, "case_insensitive", false);
        const ok = await pathExists(ctx.token, ctx.owner, ctx.repo, path, ctx.dirCache, "file", caseInsensitive, ctx.signal);
        return { ...base, status: ok ? "pass" : "fail", detail: ok ? path : `Нет файла ${path}` };
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
        const path = param(c, "path", "");
        const contains = param<string | undefined>(c, "contains", undefined);
        const containsAny = param<string[] | undefined>(c, "contains_any", undefined);
        const caseInsensitive = param<boolean>(c, "case_insensitive", false);
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
        const path = param(c, "path", "");
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
        let path: string;
        if (externalRepo && pathTpl) {
          path = resolveExternalPath(externalRepo, pathTpl, ctx.classification, ctx.repo);
        } else {
          path = (pathTpl ? pathTpl.replace("{repo}", ctx.repo) : literalPath) ?? "";
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
        const prs = await listMergedPRsInWindow(ctx.token, ctx.owner, ctx.repo, windowDays, 30, ctx.signal);
        if (prs.length === 0) {
          return { ...base, status: "pass", detail: `Нет смерженных PR за ${windowDays} дн.` };
        }
        let driftCount = 0;
        const driftPrs: number[] = [];
        for (const pr of prs) {
          const files = await getPRFiles(ctx.token, ctx.owner, ctx.repo, pr.number, ctx.signal);
          const touchesCode = files.some((f) => pathMatchesAny(f, codeGlobs));
          const touchesDocs = files.some((f) => pathMatchesAny(f, docGlobs));
          if (touchesCode && !touchesDocs) {
            driftCount++;
            driftPrs.push(pr.number);
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
  };
}
