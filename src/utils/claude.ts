import Anthropic from "@anthropic-ai/sdk";
import type { ProjectData, SummaryMetrics, Issue, AuditFinding, GeneratedIssue, Verdict } from "../types";
import { GITHUB_OWNER, GITHUB_PROJECT_NUMBER, getToken } from "./config";
import {
  listRepoFiles,
  readRepoFile,
  createIssue,
  closeIssue,
  addLabels,
  addComment,
  listMilestones,
  createMilestone,
  updateMilestone,
  setIssueMilestone,
  listRepoIssues,
  addIssueToProject,
} from "./github-actions";

interface DashboardContext {
  projects: ProjectData[];
  summary: SummaryMetrics;
  blockedIssues: Issue[];
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Tools definition ──

const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_project_docs",
    description: "Прочитать документацию проекта (PRD, эпики, архитектуру) из репозитория на GitHub. Используй ПЕРЕД созданием issues, чтобы понять контекст проекта, naming conventions и структуру.",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория (например Sewing-ERP)" },
        path: { type: "string", description: "Путь к файлу или папке (например docs/ или docs/prds/PRD-001.md). По умолчанию docs/" },
      },
      required: ["repo"],
    },
  },
  {
    name: "create_issue",
    description: "Создать новый issue в репозитории и автоматически добавить его в MakeIT Tracker project. Перед использованием ОБЯЗАТЕЛЬНО прочитай документацию проекта через read_project_docs.",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        title: { type: "string", description: "Заголовок issue" },
        body: { type: "string", description: "Описание issue в markdown" },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Лейблы: P1-critical, P2-high, P3-medium, bug, feature, tech-debt, code-review, security",
        },
        milestone_title: {
          type: "string",
          description: "Название milestone (если нужно привязать)",
        },
      },
      required: ["repo", "title", "body"],
    },
  },
  {
    name: "close_issue",
    description: "Закрыть issue",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        issue_number: { type: "number", description: "Номер issue" },
      },
      required: ["repo", "issue_number"],
    },
  },
  {
    name: "add_labels",
    description: "Добавить лейблы к issue",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        issue_number: { type: "number", description: "Номер issue" },
        labels: { type: "array", items: { type: "string" }, description: "Лейблы: P1-critical, P2-high, P3-medium, bug, feature, tech-debt, code-review, security" },
      },
      required: ["repo", "issue_number", "labels"],
    },
  },
  {
    name: "add_comment",
    description: "Добавить комментарий к issue",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        issue_number: { type: "number", description: "Номер issue" },
        body: { type: "string", description: "Текст комментария в markdown" },
      },
      required: ["repo", "issue_number", "body"],
    },
  },
  {
    name: "list_repo_issues",
    description: "Получить список issues репозитория с датами создания и закрытия. Используй для анализа velocity (скорости закрытия задач).",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Фильтр по состоянию (default: all)" },
      },
      required: ["repo"],
    },
  },
  {
    name: "create_milestone",
    description: "Создать новый milestone в репозитории с дедлайном",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        title: { type: "string", description: "Название milestone" },
        description: { type: "string", description: "Описание milestone" },
        due_on: { type: "string", description: "Дедлайн в формате ISO (например 2026-04-15T00:00:00Z)" },
      },
      required: ["repo", "title"],
    },
  },
  {
    name: "update_milestone",
    description: "Обновить milestone: изменить дедлайн, описание, закрыть/открыть",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        milestone_number: { type: "number", description: "Номер milestone" },
        title: { type: "string", description: "Новое название" },
        description: { type: "string", description: "Новое описание" },
        due_on: { type: "string", description: "Новый дедлайн (ISO)" },
        state: { type: "string", enum: ["open", "closed"], description: "Состояние" },
      },
      required: ["repo", "milestone_number"],
    },
  },
  {
    name: "assign_issue_to_milestone",
    description: "Привязать issue к milestone или отвязать (milestone_number: null)",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
        issue_number: { type: "number", description: "Номер issue" },
        milestone_number: { type: "number", description: "Номер milestone (или null для отвязки)" },
      },
      required: ["repo", "issue_number", "milestone_number"],
    },
  },
  {
    name: "list_milestones",
    description: "Получить все milestones репозитория с их дедлайнами и прогрессом",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Название репозитория" },
      },
      required: ["repo"],
    },
  },
];

// ── Tool execution ──

interface ToolInput {
  repo?: string;
  path?: string;
  title?: string;
  body?: string;
  description?: string;
  due_on?: string;
  state?: string;
  milestone_number?: number;
  labels?: string[];
  milestone_title?: string;
  issue_number?: number;
}

async function executeTool(name: string, input: ToolInput): Promise<string> {
  const token = getToken();
  if (!token) return "Ошибка: GitHub token не настроен";

  try {
    switch (name) {
      case "read_project_docs": {
        const path = input.path || "docs";
        const files = await listRepoFiles(token, GITHUB_OWNER, input.repo!, path);

        if (files.length === 0) {
          // Maybe it's a file, not a directory
          try {
            const content = await readRepoFile(token, GITHUB_OWNER, input.repo!, path);
            return `## ${path}\n\n${content}`;
          } catch {
            return `Папка/файл ${path} не найден в ${input.repo}`;
          }
        }

        // If directory — list files, then read .md files
        const mdFiles = files.filter((f) => f.name.endsWith(".md"));

        let result = `## Файлы в ${input.repo}/${path}\n`;
        result += files.map((f) => `- ${f.type === "dir" ? "📁" : "📄"} ${f.name}`).join("\n");

        // Auto-read up to 5 markdown files for full context
        for (const f of mdFiles.slice(0, 5)) {
          try {
            const content = await readRepoFile(token, GITHUB_OWNER, input.repo!, f.path);
            result += `\n\n---\n## ${f.name}\n\n${content.slice(0, 4000)}`;
          } catch { /* skip unreadable */ }
        }

        return result;
      }

      case "create_issue": {
        // Find milestone number by title if specified
        let milestoneNumber: number | undefined;
        if (input.milestone_title) {
          const milestones = await listMilestones(token, GITHUB_OWNER, input.repo!);
          const found = milestones.find(
            (m) => m.title.toLowerCase() === input.milestone_title!.toLowerCase()
          );
          if (found) milestoneNumber = found.number;
        }

        const issue = await createIssue(
          token, GITHUB_OWNER, input.repo!,
          input.title!, input.body!,
          input.labels ?? [], milestoneNumber
        );

        // Auto-add to MakeIT Tracker project
        try {
          await addIssueToProject(token, GITHUB_OWNER, input.repo!, issue.number, GITHUB_PROJECT_NUMBER);
        } catch (e) {
          return `Issue #${issue.number} создан (${issue.url}), но не удалось добавить в проект: ${e}`;
        }

        return `Issue #${issue.number} создан и добавлен в MakeIT Tracker.\nURL: ${issue.url}`;
      }

      case "close_issue": {
        await closeIssue(token, GITHUB_OWNER, input.repo!, input.issue_number!);
        return `Issue #${input.issue_number} в ${input.repo} закрыт.`;
      }

      case "add_labels": {
        const result = await addLabels(token, GITHUB_OWNER, input.repo!, input.issue_number!, input.labels!);
        const createdNote = result.created.length > 0
          ? ` (лейблы ${result.created.join(", ")} были созданы, т.к. не существовали)`
          : "";
        return `Лейблы ${result.added.join(", ")} добавлены к issue #${input.issue_number} в ${input.repo}.${createdNote}`;
      }

      case "add_comment": {
        await addComment(token, GITHUB_OWNER, input.repo!, input.issue_number!, input.body!);
        return `Комментарий добавлен к issue #${input.issue_number} в ${input.repo}.`;
      }

      case "list_repo_issues": {
        const state = (input.state as "open" | "closed" | "all") || "all";
        const issues = await listRepoIssues(token, GITHUB_OWNER, input.repo!, state);
        if (issues.length === 0) return `Нет issues в ${input.repo} (state: ${state})`;

        const closed = issues.filter((i) => i.closed_at);
        const open = issues.filter((i) => i.state === "open");

        // Group closed by day
        const byDay: Record<string, { count: number; labels: string[] }> = {};
        for (const i of closed) {
          const day = i.closed_at!.split("T")[0];
          if (!byDay[day]) byDay[day] = { count: 0, labels: [] };
          byDay[day].count++;
          byDay[day].labels.push(...i.labels);
        }

        // Velocity per ACTIVE day (days with at least 1 closure)
        const now = Date.now();
        const last7 = closed.filter((i) => now - new Date(i.closed_at!).getTime() < 7 * 86400000);
        const last14 = closed.filter((i) => now - new Date(i.closed_at!).getTime() < 14 * 86400000);
        const activeDays7 = new Set(last7.map((i) => i.closed_at!.split("T")[0])).size;
        const activeDays14 = new Set(last14.map((i) => i.closed_at!.split("T")[0])).size;
        const vel7 = activeDays7 > 0 ? last7.length / activeDays7 : 0;
        const vel14 = activeDays14 > 0 ? last14.length / activeDays14 : 0;

        // Priority breakdown for open
        const openP1 = open.filter((i) => i.labels.some((l) => l.match(/^P1/i)));
        const openP2 = open.filter((i) => i.labels.some((l) => l.match(/^P2/i)));
        const openP3 = open.filter((i) => i.labels.some((l) => l.match(/^P3/i)));
        const openOther = open.length - openP1.length - openP2.length - openP3.length;

        let velocityInfo = "\n\n## Velocity данные";
        velocityInfo += `\nЗакрыто за 7 дней: ${last7.length} за ${activeDays7} рабочих дней (${vel7.toFixed(1)}/рабочий день)`;
        velocityInfo += `\nЗакрыто за 14 дней: ${last14.length} за ${activeDays14} рабочих дней (${vel14.toFixed(1)}/рабочий день)`;

        velocityInfo += "\n\n## Закрытия по дням (последние 14 дней):";
        const sortedDays = Object.entries(byDay)
          .filter(([day]) => now - new Date(day).getTime() < 14 * 86400000)
          .sort(([a], [b]) => b.localeCompare(a));
        for (const [day, data] of sortedDays) {
          const pLabels = data.labels.filter((l) => l.match(/^P[1-4]/i));
          const pBreakdown = pLabels.length > 0 ? ` (${pLabels.join(", ")})` : "";
          velocityInfo += `\n${day}: ${data.count} закрыто${pBreakdown}`;
        }

        velocityInfo += `\n\n## Открытые задачи: ${open.length}`;
        velocityInfo += `\nP1: ${openP1.length}, P2: ${openP2.length}, P3: ${openP3.length}, без приоритета: ${openOther}`;
        velocityInfo += `\nВзвешенная сложность: ~${(openP1.length * 2 + openP2.length * 1 + openP3.length * 0.3 + openOther * 0.5).toFixed(0)} человеко-дней`;

        const lines = issues.map((i) => {
          const labels = i.labels.length > 0 ? ` [${i.labels.join(", ")}]` : "";
          const ms = i.milestone ? ` (ms: ${i.milestone})` : "";
          const closedAt = i.closed_at ? ` закрыт: ${i.closed_at.split("T")[0]}` : "";
          return `#${i.number} ${i.title}${labels}${ms} | ${i.created_at.split("T")[0]}${closedAt}`;
        });

        return `## Issues в ${input.repo} (${state}): ${issues.length}\n${lines.join("\n")}${velocityInfo}`;
      }

      case "create_milestone": {
        const ms = await createMilestone(
          token, GITHUB_OWNER, input.repo!,
          input.title!, input.description || "",
          input.due_on
        );
        return `Milestone "${ms.title}" (#${ms.number}) создан в ${input.repo}.\nURL: ${ms.url}`;
      }

      case "update_milestone": {
        const updates: { title?: string; description?: string; due_on?: string; state?: "open" | "closed" } = {};
        if (input.title) updates.title = input.title;
        if (input.description) updates.description = input.description;
        if (input.due_on) updates.due_on = input.due_on;
        if (input.state === "open" || input.state === "closed") updates.state = input.state;
        await updateMilestone(token, GITHUB_OWNER, input.repo!, input.milestone_number!, updates);
        return `Milestone #${input.milestone_number} в ${input.repo} обновлён.`;
      }

      case "assign_issue_to_milestone": {
        await setIssueMilestone(token, GITHUB_OWNER, input.repo!, input.issue_number!, input.milestone_number ?? null);
        return `Issue #${input.issue_number} привязан к milestone #${input.milestone_number} в ${input.repo}.`;
      }

      case "list_milestones": {
        const milestones = await listMilestones(token, GITHUB_OWNER, input.repo!);
        if (milestones.length === 0) return `Нет milestones в ${input.repo}`;
        const lines = milestones.map((m) => {
          const due = m.due_on ? m.due_on.split("T")[0] : "без дедлайна";
          return `#${m.number} ${m.title} (${m.state}) | ${m.closed_issues}/${m.open_issues + m.closed_issues} done | дедлайн: ${due}`;
        });
        return `## Milestones в ${input.repo}: ${milestones.length}\n${lines.join("\n")}`;
      }

      default:
        return `Неизвестный инструмент: ${name}`;
    }
  } catch (e) {
    return `Ошибка: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ── System prompt ──

// Static part of system prompt (cached across requests)
const SYSTEM_RULES = `Ты — AI-помощник менеджера проектов MakeIT. Ты опытный технический директор. Отвечай на русском, кратко и по делу.

## ПРАВИЛА РАБОТЫ С ИНСТРУМЕНТАМИ (лимит: 20 вызовов)
- Вызывай несколько tools ПАРАЛЛЕЛЬНО если они независимы (например read_project_docs + list_milestones)
- Создание issues: read_project_docs → create_issue (2 вызова)
- Velocity: list_repo_issues("all") → анализ (1 вызов, данные velocity УЖЕ есть в контексте ниже)
- Лейблы по названию: ОБЯЗАТЕЛЬНО list_repo_issues("open") → найти номер → add_labels
- Лейблы: ТОЛЬКО P1-critical, P2-high, P3-medium, bug, feature, tech-debt, code-review, security. ЗАПРЕЩЕНО: "P1", "critical", "blocked" отдельно
- НЕ добавляй "blocked" если issue не заблокирован внешним фактором
- При создании issue ОБЯЗАТЕЛЬНО привяжи к milestone через milestone_title если очевиден из контекста
- НИКОГДА не выдумывай номера issues — ВСЕГДА через list_repo_issues
- НИКОГДА не говори "готово" если инструмент вернул ошибку
- Действия (create/update) ТОЛЬКО после подтверждения пользователя

## VELOCITY
- Считай по АКТИВНЫМ дням (дни с ≥1 закрытием), не календарным
- P1 = 1-3 дня, P2 = 0.5-1 день, P3 = мелкие
- +25% буфер. Если данных <3 дней — предупреди
- НЕ меняй мнение без новых данных

## СОЗДАНИЕ ISSUES ИЗ АУДИТА (когда пользователь просит создать задачи по результатам LLM-аудита)
ЗАПРЕЩЕНО создавать по одному issue на каждую находку — это создаёт 100+ микрозадач.
Думай как тимлид, раздающий задачи на спринт:

ГРУППИРУЙ в одну задачу если:
- Одна и та же root cause (например "нет валидации входных данных в API endpoints")
- Одинаковый паттерн исправления (например "заменить float на Decimal для денег")
- Одна подсистема/модуль с несколькими схожими проблемами
- Косметика одного типа (unused imports, type hints, etc.)

ОТДЕЛЬНАЯ задача только если:
- Самостоятельная уязвимость безопасности (SQL injection, etc.)
- Критический баг с потерей данных
- Требует отдельного архитектурного решения

РАЗМЕР: 15–25 задач итого. Каждая на 1–4 часа работы, не на 5 минут.
Тело задачи: список конкретных файлов/строк как чеклист "- [ ] \`file.py:42\` — описание".
Лейблы для аудит-задач: ОБЯЗАТЕЛЬНО добавляй "audit" + приоритет + тип (bug/security/tech-debt).`;

function buildSystemPrompt(ctx: DashboardContext): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allIssues = ctx.projects.flatMap((p) => p.issues);
  const closedToday = allIssues.filter((i) => i.closedAt && new Date(i.closedAt) >= today);

  const projectLines = ctx.projects.map((p) => {
    const finance = p.budget > 0 ? `$${p.paid}/$${p.budget} (ост. $${p.remaining})` : "";
    const vel = p.velocity7d > 0 ? `v=${p.velocity7d.toFixed(1)}/д` : "";
    const eta = p.etaDays ? `ETA ~${p.etaDays}д` : "";
    const stale = p.daysSinceActivity && p.daysSinceActivity > 0 ? `${p.daysSinceActivity}д⏸` : "";
    const ms = p.milestones.filter((m) => m.state === "OPEN");
    const msLine = ms.length > 0 ? " ms:" + ms.map((m) => {
      const d = m.dueOn ? m.dueOn.split("T")[0] : "?";
      return `${m.title}(${m.closedIssues}/${m.openIssues + m.closedIssues},${d})`;
    }).join(",") : "";
    return `${p.repo}|${p.client}|P1:${p.priorityCounts.P1} P2:${p.priorityCounts.P2} P3:${p.priorityCounts.P3}|${p.doneCount}/${p.totalCount}(${p.progress}%)|${[finance, vel, eta, stale].filter(Boolean).join(" ")}${msLine}`;
  });

  const blocked = ctx.blockedIssues.map((i) => `${i.repo}:${i.title}(${i.priority ?? "-"})`);

  return `## Сегодня: ${formatDate(new Date().toISOString())}. Закрыто сегодня: ${closedToday.length}
${ctx.summary.projectCount} проектов | ${ctx.summary.totalIssues} задач (${ctx.summary.todoCount} todo, ${ctx.summary.doneCount} done) | $${ctx.summary.totalBudget}/$${ctx.summary.totalPaid}(ост.$${ctx.summary.totalRemaining})

## Проекты
${projectLines.join("\n")}

## Blocked (${blocked.length}): ${blocked.join("; ") || "нет"}
## Репозитории: ${ctx.projects.map((p) => p.repo).join(", ")}`;
}

// ── Audit findings → GitHub Issues (grouped by theme, one Claude call per group) ──

interface AuditTheme {
  key: string;
  label: string;
  keywords: string[];
}

const AUDIT_THEMES: AuditTheme[] = [
  {
    key: "security",
    label: "Security vulnerabilities",
    keywords: ["path traversal", "traversal", "injection", "xss", "csrf", "credential", "secret"],
  },
  {
    key: "race_condition",
    label: "Race conditions & concurrency",
    keywords: ["race condition", "race", "concurrent", "deadlock"],
  },
  {
    key: "float_decimal",
    label: "Float vs Decimal in financial calculations",
    keywords: ["float", "decimal", "округл", "monetary", "денег", "деньг"],
  },
  {
    key: "transaction",
    label: "Missing database transactions",
    keywords: ["транзакц", "transaction", "db.begin", "rollback", "atomicit"],
  },
  {
    key: "auth",
    label: "Missing authentication & authorization",
    keywords: ["auth", "права", "доступ", "permission", "role", "require_role", "unauthorized"],
  },
  {
    key: "error_handling",
    label: "Unhandled exceptions & error handling",
    keywords: ["исключен", "exception", "unhandled", "error handling"],
  },
  {
    key: "data_integrity",
    label: "Data integrity & validation",
    keywords: ["integrity", "constraint", "валидац", "validation", "refresh", "flush", "foreign key"],
  },
  {
    key: "other",
    label: "Other code quality issues",
    keywords: [],
  },
];

function groupFindingsByTheme(
  findings: AuditFinding[],
): Array<{ theme: AuditTheme; findings: AuditFinding[] }> {
  const groups = new Map<string, AuditFinding[]>(AUDIT_THEMES.map((t) => [t.key, []]));

  for (const finding of findings) {
    const text = (finding.description + " " + (finding.recommendation ?? "")).toLowerCase();
    let assigned = false;
    for (const theme of AUDIT_THEMES.slice(0, -1)) {
      if (theme.keywords.some((kw) => text.includes(kw))) {
        groups.get(theme.key)!.push(finding);
        assigned = true;
        break;
      }
    }
    if (!assigned) groups.get("other")!.push(finding);
  }

  return AUDIT_THEMES.map((theme) => ({ theme, findings: groups.get(theme.key)! })).filter(
    (g) => g.findings.length > 0,
  );
}

const _AUDIT_BATCH_PROMPT = `You are a senior code reviewer creating GitHub issues from audit findings.
You receive findings for ONE specific theme. Create 1–5 focused issues (not more).

Group by module/subsystem that needs the same fix (e.g., "financial API layer", "auth endpoints", "export service").
Do NOT create one issue per finding.

Return JSON array only — no markdown fences, no prose:
[{
  "title": "<≤80 chars: area + problem>",
  "body": "**Problem:** <why risky in production>\\n\\n**Findings:**\\n- [ ] \`file:line\` — description\\n\\n**Recommendation:** <concrete fix>",
  "labels": ["audit", "<P1-critical|P2-high|P3-medium>", "<bug|security|tech-debt>"],
  "severity": "<critical|high|medium|low>",
  "finding_index": <index of first finding in group>
}]

PRIORITY RULE (most important — do not ignore):
The priority label MUST reflect the HIGHEST severity finding in the group.
- ANY finding with severity="critical" in the group → label MUST be "P1-critical"
- ANY finding with severity="high" (and none critical) → label MUST be "P2-high"
- All findings severity="medium" or lower → "P3-medium"
Never average or downgrade — one critical finding makes the whole issue P1-critical.

Rules: list ALL file:line pairs in Findings checklist; labels exactly as shown above.`;

export async function generateIssuesFromFindings(
  findings: AuditFinding[],
  repoName: string,
  anthropicApiKey: string,
  onProgress?: (current: number, total: number, groupLabel: string) => void,
  verdictByFinding?: Map<AuditFinding, Verdict>,
): Promise<GeneratedIssue[]> {
  // Include critical + high; expand to medium if fewer than 30
  let filtered = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (filtered.length < 30) {
    filtered = findings.filter(
      (f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium",
    );
  }

  const groups = groupFindingsByTheme(filtered);
  const client = new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true });
  const allIssues: GeneratedIssue[] = [];

  for (let i = 0; i < groups.length; i++) {
    const { theme, findings: groupFindings } = groups[i];
    onProgress?.(i + 1, groups.length, theme.label);

    // Per-group cap: 100 findings max (enough for 1-5 issues, output stays small)
    const batch = groupFindings.slice(0, 100);

    // Check if any finding in this batch is UNCERTAIN — those groups get needs-human
    const hasUncertain = verdictByFinding
      ? batch.some((f) => verdictByFinding.get(f) === "UNCERTAIN")
      : false;

    const findingsJson = JSON.stringify(
      batch.map((f, idx) => ({
        index: idx,
        severity: f.severity,
        file: f.file.replace(/^backend\/app\//, "").replace(/^frontend\/src\//, "fe/"),
        line: f.line,
        description: f.description,
        recommendation: f.recommendation,
      })),
    );

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: _AUDIT_BATCH_PROMPT,
        messages: [
          {
            role: "user",
            content: `Theme: ${theme.label}\nRepository: ${repoName}\n\nFindings (${batch.length}):\n${findingsJson}\n\nCreate 1-5 grouped issues. Return JSON array.`,
          },
        ],
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as GeneratedIssue[];
        if (Array.isArray(parsed)) {
          // Inject needs-human label for groups with UNCERTAIN findings
          if (hasUncertain) {
            for (const issue of parsed) {
              if (!issue.labels.includes("needs-human")) issue.labels.push("needs-human");
            }
          }
          allIssues.push(...parsed);
        }
      }
    } catch (e) {
      // One group failing shouldn't abort everything — log and continue
      console.warn(`Audit issue generation failed for theme "${theme.label}":`, e);
    }
  }

  return allIssues;
}

// ── Chat with tool use loop ──

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(
  apiKey: string,
  messages: ClaudeMessage[],
  context: DashboardContext,
  onToolUse?: (toolName: string, input: unknown) => void,
): Promise<string> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const dynamicData = buildSystemPrompt(context);

  // Limit history to last 10 messages to reduce token usage
  const recentMessages = messages.slice(-10);
  let currentMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Tool use loop — max 20 iterations
  for (let i = 0; i < 20; i++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [
        { type: "text", text: SYSTEM_RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamicData },
      ],
      tools: TOOLS,
      messages: currentMessages,
    });

    // Check if we need to handle tool calls
    if (response.stop_reason === "tool_use") {
      // Add assistant message with all content blocks
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: response.content },
      ];

      // Process each tool use
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          onToolUse?.(block.name, block.input);
          const result = await executeTool(block.name, block.input as ToolInput);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Add tool results
      currentMessages = [
        ...currentMessages,
        { role: "user", content: toolResults },
      ];

      continue; // Next iteration
    }

    // No more tool calls — extract text response
    const textBlocks = response.content.filter((b) => b.type === "text");
    return textBlocks.map((b) => b.type === "text" ? b.text : "").join("\n") || "Готово.";
  }

  return "Превышен лимит итераций инструментов.";
}
