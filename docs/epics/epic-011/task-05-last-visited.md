# Task-05: lastVisitedStore + inbox-badge на Activity Tab

## Метаданные
- Epic: epic-011
- GitHub Issue: #354
- Приоритет: P2-high
- Зависит от: Epic-009 #03
- Параллельно: да (с #01..#04)
- Размер: S

## Описание
Per-device sessionStorage-tracking «когда последний раз открывал Activity для проекта». На основе этого — badge с unread-count для каждого репо.

1. `src/utils/lastVisitedStore.ts`:
   - `getLastVisited(repo: string): ISO | null` — читает `sessionStorage['makeit_hub_last_visited:' + repo]`.
   - `markVisited(repo: string): void` — пишет `new Date().toISOString()`.
   - `unreadCount(events: PulseEvent[], repo: string): number` — фильтрует events по `timestamp > lastVisited` (если lastVisited null — возвращает 0, не events.length, чтобы первое открытие не флудило).
2. Wiring: `ActivityTab` на mount → `markVisited(currentRepo)`. Badge `<InboxBadge count={unreadCount(...)} />` на табе.
3. По design — sessionStorage (не localStorage): close tab = новая сессия = всё свежее.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — секция lastVisitedStore
- `docs/prds/PRD-008.md` FR-39
- `src/components/v4/hub/tabs/ActivityTab.tsx` (stub из Epic-009)
- `src/types/hub.ts` — `PulseEvent`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `getLastVisited` возвращает null для нового репо, ISO после markVisited
- [ ] `unreadCount` возвращает 0 при `lastVisited === null` (первое открытие)
- [ ] Badge на ActivityTab показывает корректное число до открытия таба
- [ ] После открытия ActivityTab — badge становится 0 (markVisited вызвался)
- [ ] Reload страницы сохраняет lastVisited; close tab — теряет
