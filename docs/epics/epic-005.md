# Epic-005: AI-инсайты на главной — портфельный health на дашборде

## Метаданные
- PRD: PRD-004
- Epic-issue: #137
- Milestone: #5
- Дедлайн: 2026-05-12 (5 задач × 1 день + 2 буфер)
- Статус: planning
- Приоритет: P2-high

## Обзор
Куратор должен видеть «что горит сегодня» прямо на дашборде, не открывая страницу каждого проекта. Реализуем портфельный сканер всех 12 репо через тот же health-engine, что используется на странице проекта (`useProjectHealth`). Агрегируем fail-findings, показываем топ-5 на `AIInsightsPanel`, отдельной панелью — график orphan-issues по дням за 30 дней.

## Архитектурные решения
- Новый хук `usePortfolioHealth()` поверх существующего `useProjectHealth`-движка. Не дёргает индивидуальный хук в цикле — а вызывает `runHealthCheck` напрямую через очередь с concurrency=3.
- Кэш в localStorage `makeit_portfolio_health_v1` — TTL 30 минут.
- Sсuрки и кнопка «Обновить» в Topbar связаны через event bus или callback prop.
- `OrphanIssuesPanel` использует существующий `listIssuesWithoutMilestone` + `created_at` каждого issue для бакетирования по дням.

## Изменения в БД
N/A.

## API изменения
N/A — новые хелперы только клиентские:
- `getOrphanIssuesWithDates(token, owner, repo)` — вернуть `[{number, created_at}]` для open-issues без milestone (расширение `listIssuesWithoutMilestone` с метаданными)

## Frontend изменения
- `src/hooks/usePortfolioHealth.ts` — новый хук
- `src/components/v4/AIInsightsPanel.tsx` — переписан под реальные триггеры
- `src/components/v4/OrphanIssuesPanel.tsx` — новый компонент (график)
- `src/components/v4/DashboardView.tsx` — расположение новой панели
- `src/components/v4/Topbar.tsx` — onClick «Обновить» теперь триггерит и `usePortfolioHealth.refresh`

## Влияние на существующий код
- `AIInsightsPanel` — полностью переписан, prop API меняется (старый `{insights}` vs новый `{report, onOpenHealth, loading}`). Прямые потребители — только `DashboardView`. Риск: тесты (если есть) на panel.
- `useDashboard` — не меняется, `usePortfolioHealth` живёт отдельно (другой триггер скана).
- При первом mount дашборда — задержка 1.5 сек до старта portfolio scan, чтобы не мешать первому painted.

## Целостность бизнес-логики
N/A — frontend, без транзакций.

## Задачи
| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `usePortfolioHealth` hook + multi-repo runner с concurrency=3 + localStorage cache + TTL | — | — | M |
| 02 | Переписать `AIInsightsPanel` — потребляет portfolio report, показывает топ-5 fail карточек, severity-сортировка, кнопка «Открыть Health» с проброс через onJumpToTab | 01 | — | M |
| 03 | `OrphanIssuesPanel` — компонент-график 30-дневной серии orphan-issues (агрегат по портфелю), стиль как `ClosedChart30d` | 01 | да (с #02) | M |
| 04 | Wire «Обновить» в Topbar → инвалидация и `useDashboard` и `usePortfolioHealth` | 01 | да (с #02, #03) | S |
| 05 | Sidebar badge с числом критичных fails в портфеле (если ≥ 1) | 01 | да (с #04) | S |
