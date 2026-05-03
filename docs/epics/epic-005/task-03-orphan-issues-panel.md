# Task-03: OrphanIssuesPanel — график orphan-issues за 30 дней

## Метаданные
- Epic: epic-005
- GitHub Issue: #143
- Приоритет: P2-high
- Зависит от: task-01
- Параллельно: да (с task-02)
- Размер: M (~140 строк)

## Описание
Новый компонент `src/components/v4/OrphanIssuesPanel.tsx`. График: количество open-issues без milestone по дням за последние 30 дней (агрегат по портфелю + drill-down в tooltip).

Источник данных:
1. Расширить `listIssuesWithoutMilestone` в `github-actions.ts` — возвращать не только `number[]`, а `[{number, created_at, repo}]`. Имя новой функции: `listOrphanIssuesWithMeta`.
2. Из всех 12 reports (или прямо в этом компоненте — отдельный запрос на рендер) собрать orphan-issues. Для каждого взять `created_at`, посчитать `days_open = (now - created_at) / 86400000`.
3. Для каждого дня за последние 30 дней посчитать сколько issues были open и без milestone в этот день: `was_open_at(day) = created_at <= day && (closed_at == null || closed_at > day)`. Для open issues `closed_at == null`. Это упрощённая версия — мы не учитываем когда milestone был добавлен/удалён, но для MVP достаточно.

Для MVP можно проще: показать только текущее значение на каждый день за 30 дней — т.е. сколько issues, открытых сегодня, существовали и без milestone в каждый из последних 30 дней. Это монотонно неубывающая линия (старые issues всегда были open).

Стиль: как `ClosedChart30d.tsx`. Пик — высоту, tooltip — `repo: count` разбивка.

Размещение: в `DashboardView` под `AIInsightsPanel`, full-width.

## Контекст для Claude Code
Прочитай:
- `src/components/v4/ClosedChart30d.tsx` — паттерн графика для 30-дневной серии
- `src/utils/github-actions.ts:listIssuesWithoutMilestone` — текущая функция (возвращает только numbers)
- `src/components/v4/DashboardView.tsx` — куда вставить панель

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] График показывает 30 точек, ось X — даты, ось Y — count
- [ ] Tooltip на hover точки показывает разбивку по проектам
- [ ] При 0 orphan-issues — empty state «Все issues распределены по milestones»
- [ ] Visual smoke на живых данных
