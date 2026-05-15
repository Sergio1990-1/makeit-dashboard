# Task-02: ProjectHubPage + Header + URL routing с subtab

## Метаданные
- Epic: epic-009
- GitHub Issue: #339
- Приоритет: P2-high
- Зависит от: task-01
- Параллельно: нет
- Размер: M

## Описание
Создать корневой компонент Hub и Header, расширить URL-роутинг параметром `subtab`. После задачи: открыл `?tab=projects&repo=X&subtab=health` — увидел Header + placeholder под tabs/content; back/forward работает.

1. Создать `src/components/v4/hub/ProjectHubPage.tsx`:
   - Props: `{ repo: string, project?: ProjectData, onBackToList: () => void }`
   - Внутри: `useProjectHub(repo)`, локальный state `activeTab: HubTab` (default из URL → `"overview"`)
   - Layout: `← Все проекты` → `<ProjectHubHeader>` → slot под `<ProjectHubTabs>` (placeholder div в этой задаче) → slot под tab content
2. Создать `src/components/v4/hub/ProjectHubHeader.tsx`:
   - Props: `{ data: ProjectHubData }`
   - Слева: repo (monospace), tier-pill, phase-badge, client, last activity
   - Справа: health-grade крупно, score %, sparkline placeholder (`<div className="v4-sparkline-placeholder" />`)
   - Центр: NBA-строка «Next Best Action: ...» (из `data.nba[0]?.text ?? "—"`), кнопка «Регенерировать» (disabled stub)
3. Расширить URL-роутинг в `ProjectHubPage` (паттерн из `ProjectsView.tsx:153+`):
   - Mount: читать `URLSearchParams.get('subtab')`, валидировать против `HubTab`, fallback `"overview"`
   - `setActiveTab` → `pushState` с `?tab=projects&repo=X&subtab=Y`
   - `popstate` listener синхронизирует `activeTab` с URL
   - Использовать `lastSyncedSubtabRef` + `didMountPushRef` как в существующем коде

## Контекст для Claude Code
Прочитай:
- `src/components/v4/ProjectsView.tsx:130-240` — паттерн URL persistence
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.1, §4.2 — layout Header
- `docs/prds/PRD-008.md` FR-11..FR-18

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `?tab=projects&repo=Beer_bot&subtab=health` на refresh восстанавливает state `activeTab = "health"`
- [ ] Невалидный `subtab=foo` → fallback на `overview` + URL переписывается без `subtab=foo`
- [ ] Browser back/forward переключает subtab без перезагрузки
- [ ] Кнопка «← Все проекты» вызывает `onBackToList()` и снимает `repo`+`subtab` из URL
