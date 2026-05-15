# Task-06: ProjectsView redesign

## Метаданные
- Epic: epic-010
- GitHub Issue: #348
- Приоритет: P2-high
- Зависит от: #01, #02, #03, #04, #05
- Параллельно: нет (intеграция)
- Размер: M

## Описание
Полный рефакторинг layout `ProjectsView.tsx`. Новая структура:

```
<v4-content>
  <PageHeader />                          // заголовок + финансы
  <PortfolioWidgets>                      // 2×2 grid @1024+, stack <768
    <PortfolioNextActions />
    <PortfolioRenewals />
    <PortfolioPromiseTracker />
    <PortfolioDigestPanel />
  </PortfolioWidgets>
  <FiltersBar />                          // phase / sort / search / group-by
  <ScorecardGrid>                         // 3-col @1024+, 2-col @768, 1-col <768
    <ProjectScorecard ... />              // ← вместо ProjectCardV4 + Health-кнопки
  </ScorecardGrid>
</v4-content>
```

Что **сохраняется**:
- Toolbar (фильтры, поиск, сортировка, group-by-phase) — без изменений.
- Aggregate strip (count / open / P1 / stale / progress) — без изменений.
- URL persistence + popstate logic (Epic-008 #01) — без изменений.
- Ветка `if (selectedRepo) return <ProjectHubPage />` из Epic-009 — без изменений (Hub-routing не трогаем).

Что **удаляется**:
- `ProjectCardV4.tsx` → удаляется после миграции (карточка-кнопка Health больше не нужна, клик по Scorecard сам ведёт в Hub).
- `v4-project-health-btn` стиль в `v4.css` — удалить.

Что **добавляется**:
- `src/styles/v4.css` секция `/* Portfolio Surface */` — grid для widgets (2×2 → stack) и Scorecard grid.
- Responsive breakpoints: 1024px, 768px.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — целевая структура
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §3.1 — layout схема
- `docs/prds/PRD-008.md` FR-1, FR-5
- `src/components/v4/ProjectsView.tsx` — текущий код
- `src/styles/v4.css` — найди существующие секции для consistency

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Открыл `?tab=projects` → виден 4-widget header + Scorecard grid; ширины 1024 / 768 / <768 переключают grid 3/2/1
- [ ] Виджеты сверху адаптивны: 2×2 на 1024+, stack на <768
- [ ] Клик по Scorecard ведёт в Hub Overview (Epic-009 routing работает без регрессии)
- [ ] `ProjectCardV4.tsx` удалён, импортов на него нет, `npm run build` чистый
- [ ] URL persistence (`?repo=`, back/forward) работает как до рефакторинга
- [ ] Все существующие toolbar-функции (phase filter / sort / search / group-by) работают
