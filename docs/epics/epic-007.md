# Epic-007: Layer 4 — LLM drift checks

## Метаданные
- PRD: PRD-006
- Epic-issue: #139
- Milestone: #7
- Дедлайн: 2026-05-22 (7 задач × 1.5 дня + 3 буфер)
- Статус: planning
- Приоритет: P3-medium

## Обзор
Реализовать 7 правил Layer 4, которые сейчас возвращают `unknown`. Запускаются по кнопке «Просканировать drift». LLM (Claude API) для семантических проверок, regex для template-checking.

## Архитектурные решения
- Отдельный модуль `src/utils/health-llm.ts` с функцией `runDriftScan(token, owner, repo, doc, claudeKey)`. Не вмешивается в основной `runHealthCheck`.
- Кэш по tree-sha (`localStorage` ключ `makeit_drift_cache:{repo}:{tree_sha}:{rule_id}`) — pendant к существующему `sessionStorage` кэшу health-отчёта.
- Promts вынесены в `src/utils/prompts/` — отдельный файл на правило.
- Anthropic tool use для structured output — один tool `report_finding` с полями `status, detail, remediation, confidence`.
- `claude-haiku-4-5-20251001` для большинства правил, `claude-opus-4-7` для семантически сложных (state_machines vs code, knowledge_coverage).
- При confidence < 0.7 — статус ставим `unknown` с пометкой.

## Изменения в БД
N/A.

## API изменения
- `src/utils/claude.ts` расширяется: `callClaudeWithTool(prompt, toolDef, model, maxTokens)` — обёртка для tool-use ответов
- `src/utils/github-actions.ts`: `getRepoTreeSha(token, owner, repo, branch)` — для кэш-ключа

## Frontend изменения
- `src/components/v4/health/Hero.tsx` — кнопка drift из no-op в активную, прогресс-бар
- `src/hooks/useProjectHealth.ts` — новый метод `scanDrift()` + поле `driftScanning: boolean`
- `src/components/v4/health/ProjectHealthPage.tsx` — пробрасывает `scanDrift` в Hero
- (опц.) `src/components/v4/health/DriftCostTooltip.tsx` — показывает ожидаемую стоимость

## Влияние на существующий код
- `health-engine.ts` — Layer 4 case'ы остаются (возвращают unknown по-умолчанию). После drift-скана отчёт обновляется поверх через merge. Если drift-скан не запускали — поведение прежнее.
- При отсутствии Claude key кнопка drift disabled — никаких side-effects.

## Целостность бизнес-логики
- Каждое правило получает evidence от детерминированного collector'а (read file / list dir / search code) → отдаёт LLM. LLM не дёргает GitHub API напрямую — defensive.
- Структурированный output с tool use → если Claude вернёт неожиданный формат (вряд ли с tool use, но), fail-safe в `unknown`.
- Privacy: код проектов уходит в Anthropic API → задокументировать в `docs/SECURITY.md` (создаётся в этом эпике).

## Задачи
| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `callClaudeWithTool` обёртка + `getRepoTreeSha` хелпер + cache-utils для drift | — | — | M |
| 02 | `runDriftScan` оркестратор + skeleton всех 7 правил + Hero кнопка с прогрессом | 01 | — | M |
| 03 | `ai_template_filled` (regex-only, без LLM) — детектор плейсхолдеров | 02 | да (с #04..#07) | S |
| 04 | `ai_contract_milestones_sync` — Claude haiku, prompt + parse | 02 | да | M |
| 05 | `ai_doc_code_sync` (state_machines vs FSM/enum) — Claude opus, evidence сборка через searchCodeSymbol | 02 | да | L |
| 06 | `ai_knowledge_coverage` — Claude opus, evidence через listRepoFiles('docs/DOMAINS') | 02 | да | M |
| 07 | `ai_claude_md_freshness` — Claude haiku, evidence через listRepoFiles + readRepoFile | 02 | да | M |
