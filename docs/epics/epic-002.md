# Epic-002: Dashboard — Pipeline Hardening v2 Support

## Метаданные
- PRD: PRD-002
- Статус: planning
- Приоритет: P2-high

## Цель

Расширить dashboard для отображения данных из pipeline v3: phase_machine стадии, PhaseResult fields, quality KPIs, timeline, risk classification.

## Архитектурные решения
- Все новые поля — optional TypeScript types, backward-compatible
- Новые API calls добавляются в utils/pipeline.ts
- Новые компоненты: QualityPanel.tsx, IssueTimeline.tsx
- Существующий PipelineControlPanel.tsx расширяется (не заменяется)

## Задачи

| # | Задача | Pipeline зависимость | Wave | Размер |
|---|--------|---------------------|------|--------|
| 01 | Dashboard types + STAGE_ORDER (11 стадий) | pipeline #385 (API models) | 1 | M |
| 02 | Cost display, retry budget, quality KPI panel | pipeline #387 (API endpoints) | 2 | M |
| 03 | Issue timeline modal | pipeline #387 (API endpoints) | 2 | M |
| 04 | Risk badges + execution policy display | pipeline #363-#365 (risk_classifier) | 3 | M |

## Критерии приёмки
- [ ] STAGE_ORDER обновлён для 11 phase_machine стадий
- [ ] Cost и attempts видны для каждого issue
- [ ] QualityPanel показывает weekly KPIs
- [ ] Timeline modal работает
- [ ] Risk badges отображаются
- [ ] Dark/light theme для всех новых элементов
- [ ] Нет regression для existing v2 data

## Риски

| Риск | Влияние | Митигация |
|------|---------|-----------|
| Pipeline API ещё не расширен когда dashboard готов | Средний | Optional fields + graceful fallback |
| Stage names изменятся в pipeline | Низкий | Dashboard использует labels dict, не hardcoded strings |
