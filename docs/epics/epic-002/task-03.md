# Task-03: Issue timeline modal

## Epic: epic-002
## Зависимости: task-01, makeit-pipeline #387 (timeline API endpoint)

## Описание

Клик по issue number в results table → modal с детальным логом фаз.

### Новый компонент: IssueTimeline.tsx

```
┌─ Issue #42: Fix login validation ──────────────┐
│                                                 │
│ ● queued        10:15:03  —                    │
│ ● dev           10:15:05  $0.18  3m 24s        │
│ ● self_check    10:18:29  —      12s           │
│ ● pr_opened     10:18:41  —      2s            │
│ ● in_review     10:18:43  $0.05  45s  APPROVED │
│ ● qa_verifying  10:19:28  $0.02  30s  PASS     │
│ ● merged        10:19:58  —      3s            │
│                                                 │
│ Total: $0.25 | Duration: 4m 55s | Attempt 1/3  │
└─────────────────────────────────────────────────┘
```

- Colored dots: green=success, yellow=partial, red=failure
- Footer: total cost, total duration, attempt number
- Loading/empty states
- Close: Escape, click outside

### Новый API call: fetchTimeline()

```typescript
export async function fetchTimeline(repo: string, issue: number): Promise<TimelineEntry[]> {
  return fetchJSON(`/pipeline/timeline/${repo}/${issue}`);
}
```

### Контекст для Claude Code
- src/components/ — новый IssueTimeline.tsx
- src/utils/pipeline.ts — fetchTimeline()
- src/components/PipelineControlPanel.tsx — onClick на issue number

## Критерии выполнения
- [ ] Клик по issue → timeline modal
- [ ] Фазы с timestamps, cost, duration
- [ ] Colored dots по status
- [ ] Loading/empty states
- [ ] Close по Escape и клику вне modal
- [ ] Dark/light theme
- [ ] Линтер чист
