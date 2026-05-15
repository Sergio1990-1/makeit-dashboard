# Task-05: Миграция ProjectsView на ProjectHubPage + legacy toast

## Метаданные
- Epic: epic-009
- GitHub Issue: #342
- Приоритет: P2-high
- Зависит от: task-02
- Параллельно: да (с task-04)
- Размер: S

## Описание
Переключить рендер `ProjectsView.tsx`: при `selectedRepo` вместо текущего `<ProjectHealthPage>` рендерить `<ProjectHubPage>`. Добавить one-time toast при переходе со старого bookmark (URL без `subtab`).

1. В `src/components/v4/ProjectsView.tsx`:
   - В ветке `if (selectedRepo)` заменить `<ProjectHealthPage>` на `<ProjectHubPage>` с пробросом `repo`, `project`, `onBackToList={() => onSelectRepo(null)}`
   - Удалить прямой импорт `ProjectHealthPage` (теперь используется внутри `HealthTab`)
2. One-time legacy toast:
   - В mount-эффекте, который читает `URLSearchParams`: если `?repo=X` присутствует и `?subtab=` отсутствует — поставить флаг
   - Через `useToast()` показать сообщение «Health теперь во вкладке. Переключитесь сверху, чтобы вернуться к привычному виду» с длительностью ~6s
   - Сохранять в `localStorage` ключ `makeit_hub_legacy_toast_shown = "1"` чтобы повторно не показывать
3. Расширить URL-логику: при `selectedRepo` без `subtab` — НЕ добавлять `subtab=overview` автоматически (это сделает `ProjectHubPage` через свой mount-эффект); ProjectsView отвечает только за `repo`

## Контекст для Claude Code
Прочитай:
- `src/components/v4/ProjectsView.tsx:130-240` — текущая URL-логика
- `src/components/v4/toastContext.tsx` — API `useToast`
- `docs/epics/epic-009.md` — раздел «Влияние на существующий код»
- `docs/prds/PRD-008.md` FR-12

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Открыл `?tab=projects&repo=Beer_bot` (без subtab) → попал на Overview + увидел toast «Health теперь во вкладке»
- [ ] Повторный визит того же URL → toast не показывается (флаг в localStorage)
- [ ] Открыл `?tab=projects&repo=Beer_bot&subtab=health` → toast НЕ показывается (явная вкладка)
- [ ] `ProjectHealthPage` не импортируется напрямую в `ProjectsView.tsx`
