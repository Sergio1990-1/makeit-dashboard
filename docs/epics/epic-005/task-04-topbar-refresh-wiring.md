# Task-04: Wire Topbar refresh → portfolio rescan

## Метаданные
- Epic: epic-005
- GitHub Issue: #144
- Приоритет: P2-high
- Зависит от: task-01
- Параллельно: да (с task-02, task-03)
- Размер: S (~30 строк)

## Описание
Кнопка «Обновить» в `Topbar.tsx` сейчас триггерит `useDashboard.refetch`. Должна также инвалидировать `usePortfolioHealth`-кэш и запустить новый портфельный скан.

Подход:
1. Поднять `usePortfolioHealth` в `App.tsx` (или там где живёт `useDashboard`).
2. Передать `refresh` callback в Topbar prop.
3. `Topbar.onRefresh` вызывает оба: `useDashboard.refetch()` + `portfolio.refresh()`.

## Контекст для Claude Code
Прочитай:
- `src/components/v4/Topbar.tsx` — кнопка «Обновить» и текущий handler
- `src/App.tsx` — где живут хуки и пропсы

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Клик «Обновить» одновременно перезапускает useDashboard и портфельный health-scan
- [ ] localStorage `makeit_portfolio_health_v1` после клика содержит свежий `generated_at`
