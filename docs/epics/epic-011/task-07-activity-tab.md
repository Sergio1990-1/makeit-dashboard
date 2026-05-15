# Task-07: ActivityTab сборка (Pulse + Inbox + Open PRs + Open Runs)

## Метаданные
- Epic: epic-011
- GitHub Issue: #356
- Приоритет: P2-high
- Зависит от: Task-05, Task-06
- Параллельно: нет
- Размер: M

## Описание
Финальная сборка `ActivityTab.tsx`: 4 секции в едином layout + filter by event type + lastVisited tracking.

1. `src/components/v4/hub/tabs/ActivityTab.tsx`:
   - Section «Inbox» (вверху) — unread events (timestamp > lastVisited), визуально выделены.
   - Section «Pulse Timeline» — `<PulseTimeline events={pulse} />` с filter chips по `source` (github / pipeline / transcript / audit).
   - Section «Open PRs» — список открытых PR из GitHub (используем готовый GraphQL запрос или REST).
   - Section «Open Pipeline Runs» — список running pipeline задач из `usePipeline`.
2. `useEffect` на mount → `markVisited(repo)` (after render, чтобы Inbox показался хоть раз).
3. Filter chips — стейт в самом табе, не персистится.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — Activity Tab layout
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` — Activity tab секция
- `docs/prds/PRD-008.md` FR-42, FR-43
- `src/components/v4/hub/PulseTimeline.tsx` (Task-06)
- `src/utils/lastVisitedStore.ts` (Task-05)
- `src/hooks/useProjectHub.ts` — данные `pulse`, `openPRs`, `openRuns`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] 4 секции рендерятся в правильном порядке (Inbox / Pulse / PRs / Runs)
- [ ] Filter chips фильтруют timeline без перезагрузки
- [ ] При открытии таба — `markVisited` вызывается один раз
- [ ] После открытия — badge на табе становится 0
- [ ] Пустые секции показывают empty state (не схлопываются)
