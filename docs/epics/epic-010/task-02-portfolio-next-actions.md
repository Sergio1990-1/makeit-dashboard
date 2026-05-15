# Task-02: PortfolioNextActions

## Метаданные
- Epic: epic-010
- GitHub Issue: #344
- Приоритет: P2-high
- Зависит от: Epic-012 #05 (Claude NBA aggregator)
- Параллельно: да (с #03, #04, #05)
- Размер: M

## Описание
Виджет в верхней 2×2-сетке Portfolio Surface. Показывает top-5 ranked next-best-actions по всему портфелю: каждая строка — `action` (1 строка), `rationale` (1-2 строки серым), ссылка на проект (→ Hub Overview конкретного репо).

Это **расширение существующего `AIInsightsPanel`** (Дашборд) — не дублирование. `AIInsightsPanel` показывает общее здоровье портфеля, новый компонент — action-oriented top-5. Можно вынести общий fetch-слой в hook (`usePortfolioNba()`), но компоненты разные.

Кэш — `localStorage` ключ `makeit_portfolio_nba`, формат `{ generatedAt: ISO, actions: NbaItem[] }`. TTL — 7 дней. Кнопка «Регенерировать» сбрасывает кэш и перезапрашивает (`generatePortfolioNba()` из Epic-012 #05). Если кэш свежий — кнопка показывает «Сгенерирован N дней назад».

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — раздел «Архитектурные решения», `PortfolioNextActions`
- `docs/prds/PRD-008.md` FR-5, FR-6
- `src/components/v4/AIInsightsPanel.tsx` — существующий компонент-референс
- `docs/epics/epic-012/task-05-*.md` — формат NBA aggregator output

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Открыл Portfolio → виджет «Next Actions» с 5 строками или empty-state «Действия не требуются»
- [ ] Каждая строка кликабельна, ведёт в `?tab=projects&repo=X&subtab=overview`
- [ ] Кнопка «Регенерировать» сбрасывает `localStorage.makeit_portfolio_nba` и перезапрашивает
- [ ] При наличии свежего кэша (<7д) показывается «Сгенерирован N дней назад», запроса не делает
- [ ] Loading / error states обработаны
