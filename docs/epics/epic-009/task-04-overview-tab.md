# Task-04: OverviewTab с 4 mini-блоками

## Метаданные
- Epic: epic-009
- GitHub Issue: #341
- Приоритет: P2-high
- Зависит от: task-03
- Параллельно: да (с task-05)
- Размер: M

## Описание
Реализовать вкладку Overview — первое, что видит пользователь после клика на Scorecard. Контент состоит из 4 mini-блоков: NBA, Pulse-summary, Risks-summary, Commitments-summary. Все данные из `useProjectHub` (в Epic-009 — stub-значения, реальные источники подключаются в Epic-011/012).

1. Реализовать `src/components/v4/hub/tabs/OverviewTab.tsx`:
   - Props: `{ data: ProjectHubData, onOpenTab: (tab: HubTab) => void }`
   - Layout: 2×2 grid @1024px, stack @<768px
2. Mini-блоки (каждый — отдельный sub-компонент в том же файле или в `hub/overview/`):
   - **NBA-блок** (раскрытый): `data.nba[0]` — текст + обоснование + кнопки stub «Создать issue» / «Отметить сделанным». Если `nba` пуст → empty state «NBA пока не сгенерирован»
   - **Pulse-summary**: 5 последних `data.pulse` (timestamp + type + label). Empty state «Пока нет событий» → линк «Открыть Activity»
   - **Risks-summary**: top-3 `data.risks` filtered `severity in {critical, high}`. Empty state «Активных рисков нет»
   - **Commitments-summary**: top-3 `data.commitments` filtered overdue + due-this-week. Empty state «Все обещания в срок»
3. Каждый блок имеет footer-линк «Открыть полностью →», вызывает `onOpenTab("activity")` / `"decisions"` (FR-20)
4. Использовать существующие токены `v4-*` из `src/styles/v4.css`; новых акцентных цветов не добавлять

## Контекст для Claude Code
Прочитай:
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.3 (строка Overview), §6 (иерархия внимания)
- `docs/prds/PRD-008.md` FR-19, FR-20
- `src/styles/v4.css` — секции severity-цвета и существующие card-стили

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] При stub-данных (все пусто) Overview рендерит 4 блока с осмысленными empty states, не падает
- [ ] Линк «Открыть полностью» в Risks-блоке переключает subtab=decisions, URL обновляется
- [ ] Layout 2×2 на ≥1024px, stack на <768px (проверить devtools)
- [ ] Светлая + тёмная темы — оба читаются
