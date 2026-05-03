# Epic-006: Action wiring — создание issues из health-findings

## Метаданные
- PRD: PRD-005
- Epic-issue: #138
- Milestone: #6
- Дедлайн: 2026-05-08 (3 задачи × 1 день + 2 буфер)
- Статус: planning
- Приоритет: P2-high

## Обзор
Каждый health-fail должен превращаться в GitHub issue одним кликом — с правильным title/body/labels, добавленный в трекер MakeIT, без дублирования.

## Архитектурные решения
- Используем существующие `createIssue`, `addIssueToProject` из `github-actions.ts`. Новый хелпер `findOpenIssueByTitle` для дедупа.
- Body issue формируется из `HealthFinding` + `ChecklistRule` (для `source` ссылки на YAML).
- Severity → priority label маппинг в utils, переиспользуется single и bulk режимами.
- Bulk modal — отдельный компонент, использует существующий `ToastHost`.

## Изменения в БД
N/A.

## API изменения
N/A — новый хелпер `findOpenIssueByTitle(token, owner, repo, title)` в `github-actions.ts`.

## Frontend изменения
- `src/utils/health-issue.ts` — построение title/body/labels из finding (тестируемая чистая функция)
- `src/components/v4/health/FindingsBoard.tsx` — кнопка `→ issue` на каждом fail
- `src/components/v4/health/BulkCreateModal.tsx` — новый компонент
- `src/components/v4/health/Hero.tsx` — кнопка «Создать issues по всем» открывает modal

## Влияние на существующий код
- `FindingsBoard` получает новый callback `onCreateIssue(finding)` от родителя.
- `ProjectHealthPage` держит state модалки + handler создания (использует `useState` + callbacks).
- Toast feedback — переиспользуется `ToastHost`.

## Целостность бизнес-логики
- **Дедуп по title**: если два разных finding имеют одинаковый `rule.title` (вряд ли, но возможно при изменении YAML) — toast сообщает «уже есть» с номером существующего.
- **Bulk-режим**: создаётся последовательно с pause 1с между запросами (secondary rate limit).

## Задачи
| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `health-issue.ts` (build title/body/labels) + `findOpenIssueByTitle` хелпер. Чистые функции с unit-тестами | — | — | S |
| 02 | Single-issue button на FindingsBoard fail-карточке + toast feedback + handle duplicate detection | 01 | — | M |
| 03 | BulkCreateModal с чекбоксами, preview body, последовательное создание с прогрессом | 01, 02 | — | L |
