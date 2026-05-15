// Epic-012 Task-04 — Onboarding Readiness Checklist.
//
// Six Layer-2 rules that gauge whether a project is ready for a brand-new
// developer / client onboarding. Authored in TypeScript rather than YAML so
// the dashboard can ship the rule definitions without a synchronised PR to
// makeit-knowledge — a follow-up PR mirrors these into
// `Skills/PROJECT_CHECKLIST.yaml` (tracked as tech-debt).
//
// Two of the six rules introduce check types not present in the YAML
// checklist today (`deploy_doc_present`, `audit_fresh`); the engine in
// `health-engine.ts` knows how to evaluate them.
//
// `applies_to: {}` means the rule fires for every classified project,
// regardless of tier / complex / client — onboarding readiness is universal.

import type { ChecklistRule } from "../types/health";

export const ONBOARDING_READINESS_RULES: ChecklistRule[] = [
  {
    id: "onboarding.readme_fresh",
    title: "README обновлялся за последние 90 дней",
    layer: 2,
    applies_to: {},
    severity: "medium",
    check: {
      type: "doc_freshness",
      path: "README.md",
      max_age_days: 90,
    },
    remediation:
      "Обнови README.md: добавь актуальные ссылки, версии зависимостей, скриншоты. Свежий README — первое, что видит новый разработчик.",
    source: "onboardingReadinessRules.ts",
  },
  {
    id: "onboarding.brief_exists",
    title: "docs/BRIEF.md существует",
    layer: 2,
    applies_to: {},
    severity: "medium",
    check: {
      type: "file_exists",
      path: "docs/BRIEF.md",
    },
    remediation:
      "Создай docs/BRIEF.md с кратким описанием проекта: что делаем, кому продаём, основные решения. Без него онбординг клиента занимает в 3× больше времени.",
    source: "onboardingReadinessRules.ts",
  },
  {
    id: "onboarding.deploy_doc",
    title: "Есть инструкция по деплою",
    layer: 2,
    applies_to: {},
    severity: "high",
    check: {
      type: "deploy_doc_present",
      // Either docs/DEPLOY.md exists OR README.md contains a `## Deploy`
      // section heading. Both are acceptable — pick the one that fits the
      // project's documentation style.
      deploy_doc_path: "docs/DEPLOY.md",
      readme_path: "README.md",
      readme_section: "## Deploy",
    },
    remediation:
      "Добавь docs/DEPLOY.md или раздел `## Deploy` в README — конкретные команды, env vars, проверка health. Без этого следующий деплой делается «по памяти».",
    source: "onboardingReadinessRules.ts",
  },
  {
    id: "onboarding.env_example",
    title: ".env.example существует",
    layer: 2,
    applies_to: {},
    severity: "high",
    check: {
      type: "file_exists",
      path: ".env.example",
    },
    remediation:
      "Закоммить .env.example с перечнем всех нужных переменных (без значений). Иначе новый разработчик гадает, что класть в .env.",
    source: "onboardingReadinessRules.ts",
  },
  {
    id: "onboarding.ci_green",
    title: "Последний CI run на main = success",
    layer: 2,
    applies_to: {},
    severity: "high",
    check: {
      type: "workflow_recent_run_status",
      workflow_match: ["ci", "test"],
      status: "success",
    },
    remediation:
      "Почини main CI: красный билд означает, что проект нельзя собрать с нуля. Это P1 для онбординга.",
    source: "onboardingReadinessRules.ts",
  },
  {
    id: "onboarding.audit_fresh",
    title: "Audit запускался за последние 30 дней",
    layer: 2,
    applies_to: {},
    severity: "medium",
    check: {
      type: "audit_fresh",
      max_age_days: 30,
    },
    remediation:
      "Запусти audit из вкладки «Аудит». Свежий аудит — гарантия, что мы знаем актуальные риски проекта при передаче новому разработчику.",
    source: "onboardingReadinessRules.ts",
  },
];

// Subset check used by UI components (OnboardingChecklist) to filter the full
// findings list down to just onboarding ones. Keeps the prefix coupled to
// rule IDs in one place.
export const ONBOARDING_RULE_PREFIX = "onboarding.";

export function isOnboardingRuleId(ruleId: string): boolean {
  return ruleId.startsWith(ONBOARDING_RULE_PREFIX);
}
