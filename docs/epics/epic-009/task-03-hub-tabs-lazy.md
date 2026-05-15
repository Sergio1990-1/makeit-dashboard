# Task-03: ProjectHubTabs + 5 tab-компонентов с lazy-loading

## Метаданные
- Epic: epic-009
- GitHub Issue: #340
- Приоритет: P2-high
- Зависит от: task-02
- Параллельно: нет
- Размер: M

## Описание
Реализовать табы Hub и 5 tab-компонентов: Overview/Health — реальный контент, остальные — placeholder с пометкой «в разработке (Epic-011/012)». Каждый tab — отдельный chunk через `React.lazy`.

1. Создать `src/components/v4/hub/ProjectHubTabs.tsx`:
   - Props: `{ active: HubTab, onChange: (tab: HubTab) => void, inboxCount: number }`
   - 5 кнопок с ARIA `role="tab"`, активная подсвечена
   - На «Activity» — inbox-badge с `inboxCount` (в Epic-009 всегда 0 → бейдж не рендерится)
2. Создать 5 файлов в `src/components/v4/hub/tabs/`:
   - `OverviewTab.tsx` — в этой задаче пустой стаб `<div>Overview placeholder</div>` (real content — task-04)
   - `HealthTab.tsx` — рендерит существующий `ProjectHealthPage` с пробросом `repo`/`project`
   - `ActivityTab.tsx`, `DecisionsRisksTab.tsx`, `DeliveryTab.tsx` — placeholder вида: иконка + текст «Вкладка в разработке (Epic-011/Epic-012)» + ссылка на соответствующий epic doc
3. В `ProjectHubPage.tsx`:
   - Обернуть импорты табов в `React.lazy(() => import("./tabs/..."))`
   - Активный tab оборачивается в `<Suspense fallback={<TabSkeleton />}>` (skeleton — простой div с классом `v4-tab-skeleton`)
   - `inboxCount` — из `data.inboxCount` (stub 0 в Epic-009)

## Контекст для Claude Code
Прочитай:
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.3 — таблица вкладок
- `src/components/v4/health/ProjectHealthPage.tsx:1-60` — props HealthTab
- React docs: `lazy` + `Suspense`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `npm run build` создаёт 4+ дополнительных chunk'а для tab-компонентов
- [ ] Переключение subtab=health показывает существующий ProjectHealthPage без визуальной регрессии
- [ ] Placeholder-вкладки рендерят текст с упоминанием Epic-011/Epic-012
- [ ] Skeleton мелькает при первом открытии тяжёлого tab (Health)
