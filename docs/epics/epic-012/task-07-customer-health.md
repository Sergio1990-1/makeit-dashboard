# Task-07: Customer Health Score (gauge + sparkline)

## Метаданные
- Epic: epic-012
- GitHub Issue: #365
- Приоритет: P2-high
- Зависит от: Task-01 (claudeBudget), Epic-011 #02 (commitments)
- Параллельно: да (с #08)
- Размер: L

## Описание
Composite-score 0-100 для каждого проекта по 4 компонентам: sentiment, cadence, delivery, paid.

1. `src/utils/customerHealthScore.ts` — `computeHealth(repo) → {score, components, sparkline}`. Формула:
   ```
   score = sentiment×0.3 + cadence×0.3 + delivery×0.3 + paid×0.1
   ```
   - **sentiment** (0-100): Claude Haiku над последними 3 транскриптами → positive/neutral/negative с весами
   - **cadence** (0-100): актуальный интервал встреч vs `client_touch_interval_days` из `driftNorm`. 100 при ≤ baseline, линейный спад до 0 при 3× baseline
   - **delivery** (0-100): % commitments delivered on-time за 90 дней (status=done within due-date)
   - **paid** (0-100): 100 если paid вовремя, 0 при задолженности > 30 дней, линейный спад
   - При отсутствии транскриптов > 120 дней → `score = 'n/a'`
2. Sparkline 90d — массив дневных score-значений. Пересчёт раз в неделю (триггер из manual button или регенерации NBA). Кэш `makeit_health:{repo}` с историей.
3. `src/components/v4/hub/CustomerHealthGauge.tsx` — gauge 0-100 с цветовыми зонами (0-40 красный, 40-70 жёлтый, 70-100 зелёный) + sparkline 90d под ним. При `n/a` — placeholder «нет данных, требуется свежий транскрипт».

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Customer Health Score
- `docs/prds/PRD-008.md` FR-37
- `src/utils/claude.ts` + `src/utils/claudeBudget.ts` (Task-01)
- `src/utils/driftNorm.ts` (Task-06)
- `src/utils/commitmentsExtractor.ts` (Epic-011 #02)
- `src/utils/transcript.ts` — транскрипты per project

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `computeHealth` возвращает score + 4 компонента для тестового repo
- [ ] При отсутствии транскриптов > 120 дней → `score = 'n/a'`, gauge показывает placeholder
- [ ] CustomerHealthGauge подсвечивается по цветовой зоне
- [ ] Sparkline 90d рендерится с дневной гранулярностью
- [ ] Manual «Recompute» button инвалидирует cache и пересчитывает sentiment через Haiku
