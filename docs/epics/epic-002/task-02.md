# Task-02: Cost display, retry budget, quality KPI panel

## Epic: epic-002
## Зависимости: task-01, makeit-pipeline #387 (API endpoints)

## Описание

Добавить отображение стоимости, retry budget и quality KPIs.

### Изменения в PipelineControlPanel.tsx

**Results table — новые колонки:**
- Cost: `$0.45` (из PipelineResult.cost_usd)
- Attempts: `1/3` (attempt_number / max_attempts)
- Warning icon если budget_remaining_usd < 0.30

**Statistics panel — расширить:**
- Добавить: first_pass_rate (%), avg duration (m:ss), cost/task ($)

### Новый компонент: QualityPanel.tsx

Панель с weekly KPIs:
```
┌─ Quality (last 7 days) ─────────────────┐
│ First pass rate:  87%  ████████░░       │
│ Avg duration:     18m                   │
│ Cost/task:        $0.25                 │
│ Retry rate:       13%                   │
│ QA pass rate:     94%                   │
│ Top errors: push_rejected (3)           │
└─────────────────────────────────────────┘
```

### Новый API call: fetchQualitySnapshot()

В src/utils/pipeline.ts:
```typescript
export async function fetchQualitySnapshot(project: string): Promise<QualitySnapshot> {
  return fetchJSON(`/pipeline/quality/snapshot?project=${project}`);
}
```

### Контекст для Claude Code
- src/components/PipelineControlPanel.tsx
- src/utils/pipeline.ts — добавить fetchQualitySnapshot()
- src/hooks/usePipeline.ts — добавить quality state

## Критерии выполнения
- [ ] Cost отображается для каждого result ($X.XX)
- [ ] Attempts отображается (N/M)
- [ ] Warning при budget < $0.30
- [ ] first_pass_rate, avg_duration, cost в statistics panel
- [ ] QualityPanel показывает weekly KPIs
- [ ] Graceful fallback если данные недоступны
- [ ] Dark/light theme
- [ ] Линтер чист
