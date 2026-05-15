# Task-07: Sidebar badge + E2E

## Метаданные
- Epic: epic-010
- GitHub Issue: #349
- Приоритет: P2-high
- Зависит от: #06
- Параллельно: нет (финальный)
- Размер: M

## Описание
Завершающая задача эпика: визуальный полиш + E2E-проверка полного user journey.

**Часть 1 — Sidebar badge (FR-10):**
- В компоненте sidebar (или Topbar — где живёт навигация по вкладкам) на пункте «Проекты» добавить `<span class="sidebar-badge">` с числом NBA портфеля.
- Источник числа: тот же кэш, что использует `PortfolioNextActions` (`localStorage.makeit_portfolio_nba`). Если кэша нет — badge не отображается (не триггерим Claude-запрос ради badge).
- Стиль: компактный pill, цвет — `var(--v4-warn-700)` если NBA > 0, скрыт если 0.
- Обновление: при `storage`-event и при переключении на вкладку «Проекты».

**Часть 2 — E2E сценарий:**
Расширить `tests/e2e/dashboard.spec.ts` (или создать `portfolio-hub.spec.ts`) сценарием:
1. Открыть `?tab=projects` → дождаться рендера Scorecard grid.
2. Кликнуть по первой Scorecard → URL стал `?tab=projects&repo=X&subtab=overview`, рендерится Hub Overview.
3. Переключить все 5 табов Hub (overview / health / activity / decisions / delivery) → каждая отрисовывает свой контент, URL обновляется.
4. Browser back → возврат в Portfolio Surface, `selectedRepo` сброшен, scroll preserved (тестировать через `window.scrollY`).
5. Sidebar badge виден если кэш NBA непустой (mock localStorage перед открытием).

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — раздел «Архитектурные решения», sidebar badge
- `docs/prds/PRD-008.md` FR-10, FR-16, FR-17
- `tests/e2e/` — существующие E2E сценарии и setup (Playwright)
- `src/components/Sidebar.tsx` / `Topbar.tsx` — где находится навигация

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Sidebar pill с числом NBA виден когда `localStorage.makeit_portfolio_nba` непустой, скрыт когда пустой
- [ ] E2E сценарий проходит: Portfolio → Scorecard → Hub → все 5 табов → back возвращает на Portfolio
- [ ] После back: `scrollY` сохранён (минимум — не равен 0 если до клика был scroll)
- [ ] Badge обновляется при `storage`-event без перезагрузки
- [ ] Все существующие E2E (dashboard.spec) проходят без регрессий
