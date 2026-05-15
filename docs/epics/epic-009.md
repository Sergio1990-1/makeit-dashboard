# Epic-009: Project Hub Foundation

## Метаданные
- PRD: PRD-008
- Epic-issue: #368
- Milestone: #10
- Дедлайн: 2026-05-25 (5 задач × 1 день + 5 буфер на интеграцию)
- Статус: planning
- Приоритет: P2-high

## Обзор

Базовая инфраструктура страницы проекта: routing, header, tabs, Overview tab, агрегирующий хук `useProjectHub`, миграция существующей `ProjectHealthPage` как контента вкладки Health.

После эпика: можно открыть `?tab=projects&repo=X` → попасть в Hub Overview → переключить вкладку → попасть в Health (без визуальной регрессии). Activity/Decisions/Delivery — пустые placeholder'ы с пометкой «в разработке (Epic-011/012)».

## Архитектурные решения

- **URL scheme**: `?tab=projects&repo=X&subtab=Y`. Default subtab при отсутствии — `overview`. Старые `?tab=projects&repo=X` ведут на Overview (поведение Health-as-default отменяется); при первом таком переходе — toast-подсказка «Health теперь во вкладке».
- **Routing** — продолжение существующего паттерна `URLSearchParams` + `pushState` + `popstate` (см. `ProjectsView.tsx:154+`). Никаких роутер-библиотек.
- **`useProjectHub(repo)`** — композиция: оборачивает `useProjectHealth(repo)` + добавляет stub-поля для Decisions/Risks/Commitments/Renewals/Pulse/Inbox/Digest/DORA/CustomerHealth/Onboarding/NBA. В Epic-009 stub'ы возвращают `null`/`[]`; реальные источники заполняются в Epic-011/012.
- **Tab content lazy** — каждый tab — отдельный React.lazy chunk. Skeleton при первой загрузке.
- **inbox-badge** — placeholder = 0 в Epic-009; реальный счёт включится в Epic-011.

## Изменения в БД

N/A.

## API изменения

N/A (внутренние типы только).

## Frontend изменения

- `src/types/hub.ts` — новые типы: `HubTab`, `ProjectHubData`, stub-типы для будущих сущностей (Decision/Risk/Commitment/Renewal/PulseEvent/DigestEntry/DoraMetrics/CustomerHealthScore/NextBestAction)
- `src/hooks/useProjectHub.ts` — новый хук
- `src/components/v4/hub/ProjectHubPage.tsx` — корневой компонент Hub
- `src/components/v4/hub/ProjectHubHeader.tsx` — header
- `src/components/v4/hub/ProjectHubTabs.tsx` — навигация вкладок
- `src/components/v4/hub/tabs/OverviewTab.tsx` — Overview content
- `src/components/v4/hub/tabs/HealthTab.tsx` — wrapper над существующим `ProjectHealthPage`
- `src/components/v4/hub/tabs/{ActivityTab,DecisionsRisksTab,DeliveryTab}.tsx` — placeholder'ы
- `src/components/v4/ProjectsView.tsx` — при `selectedRepo` рендерит `ProjectHubPage` вместо `ProjectHealthPage`; URL расширяется `subtab` параметром
- `src/styles/v4.css` — секция `Project Hub` (table tabs, header layout)

## Влияние на существующий код

- `ProjectsView.tsx` — изменение branch при `selectedRepo`. Старое поведение (открытие ProjectHealthPage) недоступно — теперь Health внутри Hub.
- `ProjectHealthPage.tsx` — рендерится как content внутри `HealthTab.tsx`. Все props/handlers пробрасываются как было. Визуально не меняется.
- URL `?tab=projects&repo=X` без `subtab` — теперь Overview (раньше — Health). Toast при первом переходе из старого bookmark.
- AIInsightsPanel на Дашборде — не трогаем (Portfolio surface не входит в Epic-009).

## Целостность бизнес-логики

N/A.

## Задачи

| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `src/types/hub.ts` + skeleton `useProjectHub` (stub all new fields, wrap useProjectHealth) | — | да | M |
| 02 | `ProjectHubPage` + `ProjectHubHeader` + URL routing (`subtab` param + popstate) | 01 | — | M |
| 03 | `ProjectHubTabs` + 5 tab components (Overview real, остальные — placeholders), lazy-loading | 02 | — | M |
| 04 | `OverviewTab` с 4 mini-blocks (NBA, Pulse-summary, Risks-summary, Commitments-summary) — все на stub data из useProjectHub | 03 | да (с #05) | M |
| 05 | Migration ProjectsView: при selectedRepo → ProjectHubPage; one-time toast при переходе со старого URL без subtab | 02 | да (с #04) | S |
