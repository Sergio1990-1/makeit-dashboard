# Task-08: DecisionsRisksTab сборка (4 секции + якоря)

## Метаданные
- Epic: epic-011
- GitHub Issue: #357
- Приоритет: P2-high
- Зависит от: Task-01, Task-02, Task-03, Task-04
- Параллельно: нет
- Размер: M

## Описание
Финальная сборка таба с 4 разделами + section anchors для deep-link из Overview NBA.

1. `src/components/v4/hub/tabs/DecisionsRisksTab.tsx` — layout с 4 секциями (в порядке): Decision Log → Risk Register → Commitments → Renewals.
2. Section anchors: `<section id="decisions">`, `id="risks"`, `id="commitments"`, `id="renewals"`. На mount читать `location.hash` → `scrollIntoView({behavior: 'smooth'})`.
3. Sticky sidebar (или горизонтальные tabs внутри таба на узких экранах) с навигацией между секциями. Active section detection через IntersectionObserver.
4. Header каждой секции — title + кол-во записей + кнопка «Add» (где применимо).

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — структура таба
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.3 Decisions & Risks
- `docs/prds/PRD-008.md` FR-23..FR-32
- `src/components/v4/hub/DecisionLog.tsx`, `RiskRegisterTable.tsx`, `CommitmentsTable.tsx`, `RenewalsTable.tsx`
- `src/components/v4/hub/tabs/OverviewTab.tsx` — NBA блок (источник deep-link)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] 4 секции рендерятся в правильном порядке с якорями
- [ ] `#risks` в URL → scroll к Risk Register после загрузки
- [ ] Sidebar показывает active section при скролле
- [ ] Counters в header каждой секции совпадают с `data.length`
- [ ] Empty state каждой секции делегирован соответствующему компоненту
