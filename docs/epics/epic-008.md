# Epic-008: Project Health — гигиенические правки

## Метаданные
- PRD: PRD-007
- Epic-issue: #140
- Milestone: #8
- Дедлайн: 2026-05-10 (5 задач × 0.5 дня + 2 буфер)
- Статус: planning
- Приоритет: P3-medium

## Обзор
Закрыть медиум-находки code-review PR #131 и пару UX-проблем замеченных в эксплуатации. Все задачи мелкие, делаются параллельно где возможно.

## Архитектурные решения
- URL persistence через `history.pushState` + `popstate` listener — без подключения роутера, project держит SPA-стиль
- Удаление дубликата правил — отдельный PR в `makeit-knowledge`, после мержа дашборд автоматически подхватит (он читает YAML с raw URL)
- `case_insensitive` — параметр на уровне правила (в YAML), не глобальный флаг
- shields.io retry — простой `for` loop с `await new Promise(r => setTimeout(r, delay))`
- Semaphore — отдельный утиль, переиспользуемый

## Изменения в БД
N/A.

## API изменения
- `pathExists` принимает опциональный `case_insensitive: boolean`
- `coverage_threshold` имеет внутренний retry

## Frontend изменения
- `src/components/v4/ProjectsView.tsx` — useEffect URL-sync
- `src/utils/health-engine.ts` — case-insensitive support, retry, замена batch-loop на Semaphore
- `src/utils/semaphore.ts` — новый файл
- `Skills/PROJECT_CHECKLIST.yaml` (makeit-knowledge) — удаление дубликата, флаг case_insensitive

## Влияние на существующий код
- Удаление правила `ops.new_project_missing_business_logic` — у проектов которые его триггерили, score сдвинется. Не страшно (для большинства проектов уже был fail с тем же сигналом через `knowledge.business_logic_present`).
- URL persistence — на текущих закладках без `?repo=` поведение прежнее (показывается список).

## Целостность бизнес-логики
N/A.

## Задачи
| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | URL persistence для selectedRepo (`?repo=X` + popstate) | — | да (со всеми) | S |
| 02 | PR в makeit-knowledge: удалить `ops.new_project_missing_business_logic`, добавить `case_insensitive: true` к `hygiene.readme` | — | да | S |
| 03 | `pathExists` поддерживает `case_insensitive` параметр | 02 | да (после мержа #02) | S |
| 04 | shields.io retry в `coverage_threshold` (1 retry, exponential backoff) | — | да | S |
| 05 | `Semaphore` утиль + замена batched-loop | — | да | M |
