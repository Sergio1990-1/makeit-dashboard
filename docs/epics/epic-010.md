# Epic-010: Portfolio Surface Redesign

## Метаданные
- PRD: PRD-008
- Epic-issue: #369
- Milestone: #11
- Дедлайн: 2026-06-19 (7 задач × 1.5 дня + 3 буфер) — стартует после Epic-011 + Epic-012
- Статус: planning
- Приоритет: P2-high

## Обзор

Финальный эпик, склеивающий портфельный уровень. Переделать страницу «Проекты» в превью-сетку `ProjectScorecard` + 4 портфельных виджета сверху (Next Actions, Renewals, Promise Tracker, Digest). Использует данные, собранные в Epic-011 и Epic-012.

После эпика: владелец открывает `/?tab=projects`, за 10 секунд видит состояние всех 12 проектов + топ-5 действий по портфелю + ближайшие expiry + overdue commitments + последний weekly digest.

## Архитектурные решения

- **Scorecard** — расширение существующего ProjectCard, не замена. Старые поля сохраняются как fallback при отсутствии новых данных.
- **DriftDots** — отдельный компонент, 4 цветных дота с tooltip. Цвет: green (в норме), yellow (≥1.5× нормы), red (≥3× нормы). Норма — из `useDriftNorm(repo)` (Epic-012).
- **PortfolioNextActions** — расширение существующего AIInsightsPanel. Текущий показывает портфельный health, новый добавляет ranked actions с обоснованием и линком на проект. Кэш — `localStorage` ключ `makeit_portfolio_nba`, week-cached.
- **PortfolioPromiseTracker / PortfolioRenewals** — простые агрегаторы данных из Epic-011 (читают `commitments`/`renewals` по всем 12 репо, агрегируют, сортируют).
- **PortfolioDigestPanel** — показывает превью последнего digest из `digests/{YYYY-WW}-portfolio.md` (cross-project version, генерируется Epic-012). Кнопка «Сгенерировать новый» триггерит regen.
- **Sidebar badge** — `useDashboard()` hook + portfolio NBA count → `<span class="sidebar-badge">`.

## Изменения в БД

N/A.

## API изменения

N/A (consumes data from Epic-011, Epic-012).

## Frontend изменения

- `src/components/v4/portfolio/ProjectScorecard.tsx` — новый
- `src/components/v4/portfolio/DriftDots.tsx` — новый
- `src/components/v4/portfolio/PortfolioNextActions.tsx` — новый (расширяет AIInsightsPanel)
- `src/components/v4/portfolio/PortfolioPromiseTracker.tsx` — новый
- `src/components/v4/portfolio/PortfolioRenewals.tsx` — новый
- `src/components/v4/portfolio/PortfolioDigestPanel.tsx` — новый
- `src/components/v4/ProjectsView.tsx` — рефакторинг: вместо grid ProjectCard → 4-widget header + Scorecard grid
- `src/components/Topbar.tsx` (или Sidebar) — badge с count NBA
- `src/styles/v4.css` — секция `Portfolio Surface`

## Влияние на существующий код

- `ProjectsView.tsx` — полностью переработан layout, но routing (handle selectedRepo → Hub) из Epic-009 не трогается
- `ProjectCard.tsx` — становится legacy, заменяется на `ProjectScorecard`. Старый файл удалить
- `AIInsightsPanel.tsx` — продолжает работать на Дашборде (вкладка «Дашборд»); параллельно создаётся `PortfolioNextActions` на странице «Проекты». Не дублирование — разные сценарии (Дашборд = общее здоровье портфеля, Проекты = action-oriented)
- Sidebar — добавляется badge, остальное не трогается
- E2E-сценарий dashboard.spec — может потребовать обновления селекторов на новые компоненты

## Целостность бизнес-логики

N/A.

## Задачи

| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `ProjectScorecard` + `DriftDots` (data from useProjectHealth + useDriftNorm из Epic-012) | Epic-009 #03, Epic-012 #06 | — | M |
| 02 | `PortfolioNextActions` (расширение AIInsightsPanel с ranked actions + cache) | Epic-012 #05 | да (с #03..#05) | M |
| 03 | `PortfolioPromiseTracker` (cross-project agg from Epic-011 commitments) | Epic-011 #02 | да | S |
| 04 | `PortfolioRenewals` (cross-project agg from Epic-011 renewals) | Epic-011 #04 | да | S |
| 05 | `PortfolioDigestPanel` (preview last digest + regen button) | Epic-012 #02 | да | M |
| 06 | `ProjectsView` redesign: 4-widget header + Scorecard grid + responsive (3/2/1 col) | 01..05 | — | M |
| 07 | Sidebar NBA badge + E2E test (Portfolio → Scorecard → Hub → all tabs → back) | 06 | — | M |
