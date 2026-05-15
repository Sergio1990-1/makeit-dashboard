# Task-03: PortfolioPromiseTracker

## Метаданные
- Epic: epic-010
- GitHub Issue: #345
- Приоритет: P2-high
- Зависит от: Epic-011 #02 (commitments per-project hook)
- Параллельно: да (с #02, #04, #05)
- Размер: S

## Описание
Cross-project агрегатор обещаний. Читает `docs/commitments.yaml` по всем 12 репо (через hook из Epic-011 #02), фильтрует `status === 'open'`, группирует по `client`, сортирует:
1. **Overdue** (due < today) — наверху, красным.
2. **Due this week** (due ≤ today + 7д) — желтым.
3. Остальные — не показываются (полный список — в Hub Decisions & Risks).

Каждая запись — одна строка: `[client] · текст обещания · due (relative)`. Клик → `?tab=projects&repo=X&subtab=decisions#commitments`.

Empty state: «Все обещания в срок ✓» (приглушённым).

Запросы по 12 репо параллелизировать через `Promise.all`. Кэш — sessionStorage `makeit_portfolio_promises`, TTL 5 минут (commitments меняются редко).

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — раздел `PortfolioPromiseTracker`
- `docs/prds/PRD-008.md` FR-5, FR-8
- `docs/epics/epic-011/task-02-*.md` — формат `commitments.yaml` и hook
- `src/utils/config.ts` — список 12 проектов

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Виджет показывает overdue (красный) + due-this-week (жёлтый), сгруппировано по клиенту
- [ ] При отсутствии overdue/due-this-week — empty state «Все обещания в срок ✓»
- [ ] Клик по строке открывает соответствующий Hub Decisions & Risks
- [ ] Параллельная загрузка 12 репо не блокирует UI (skeleton до завершения)
- [ ] Кэш в sessionStorage работает (повторное открытие — без сетевых запросов в течение 5 мин)
