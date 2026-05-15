# Task-04: Onboarding Readiness Checklist (6 правил)

## Метаданные
- Epic: epic-012
- GitHub Issue: #362
- Приоритет: P2-high
- Зависит от: —
- Параллельно: да
- Размер: M

## Описание
Расширение health-engine Layer 2 шестью правилами готовности проекта к onboarding нового разработчика/клиента. Отдельный компонент показывает текущее состояние правил.

1. `src/utils/onboardingReadinessRules.ts` — экспортирует массив из 6 rule-объектов в формате health-engine Layer 2:
   - `onboarding.readme_fresh` — last commit на `README.md` за 90 дней
   - `onboarding.brief_exists` — `docs/BRIEF.md` существует
   - `onboarding.deploy_doc` — `docs/DEPLOY.md` существует ИЛИ в README есть `## Deploy`
   - `onboarding.env_example` — `.env.example` существует
   - `onboarding.ci_green` — последний CI run на `main` = success
   - `onboarding.audit_fresh` — audit запускался за последние 30 дней
2. Регистрация правил в `src/utils/health-engine.ts` Layer 2 (общее количество правил растёт с 50 до 56).
3. `src/components/v4/hub/OnboardingChecklist.tsx` — рендер 6 правил в виде списка с ✓/✗ и tooltip-remediation (текст из rule.remediation).
4. PR в makeit-knowledge: `Skills/PROJECT_CHECKLIST.yaml` — добавить 6 новых правил с описанием и remediation-инструкциями.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Onboarding Readiness
- `docs/prds/PRD-008.md` FR-36
- `src/utils/health-engine.ts` — формат rule-объектов Layer 2
- `src/utils/github-actions.ts` — чтение файлов и CI runs
- makeit-knowledge `Skills/PROJECT_CHECKLIST.yaml` — текущая структура

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] 6 правил подключены в health-engine, общее число правил = 56
- [ ] Каждое правило корректно возвращает pass/fail для тестового repo
- [ ] OnboardingChecklist рендерит ✓/✗ + tooltip с remediation
- [ ] PR в makeit-knowledge с обновлённым `Skills/PROJECT_CHECKLIST.yaml` создан
- [ ] Release note в `docs/DELIVERY.md` или CHANGELOG: «health scores могут сдвинуться вниз из-за 6 новых правил»
