# Task-01: Dashboard types + STAGE_ORDER для phase_machine

## Epic: epic-002
## Зависимости: makeit-pipeline #385 (API response models)

## Описание

Обновить TypeScript типы для поддержки новых полей из PhaseResult и обновить
STAGE_ORDER для 11 стадий phase_machine.

### Что изменить

**src/types/index.ts — extend interfaces:**
```typescript
interface PipelineStageEntry {
  stage: string;  // "queued"|"dev"|"self_check"|"pr_opened"|"in_review"|"qa_verifying"|"ready_to_merge"|"merged"|"needs_human"
  status: string;
  ts: number;
  detail?: string;
  elapsed?: number;
  cost_usd?: number;           // NEW
  duration_seconds?: number;   // NEW
}

interface PipelineResult {
  // existing fields unchanged
  cost_usd?: number;           // NEW
  phase_status?: string;       // NEW
  human_summary?: string;      // NEW
  attempt_number?: number;     // NEW
  max_attempts?: number;       // NEW
  budget_remaining_usd?: number; // NEW
  risk_level?: "low" | "medium" | "high";  // NEW (Wave 3)
  execution_policy?: string;   // NEW (Wave 3)
}

interface PipelineStats {
  // existing fields unchanged
  first_pass_rate?: number;    // NEW
  avg_duration_seconds?: number; // NEW
  cost_per_task_usd?: number;  // NEW
}
```

**src/components/PipelineControlPanel.tsx:**
```typescript
const STAGE_ORDER = [
  "queued", "dev", "self_check", "pr_opened",
  "in_review", "qa_verifying", "ready_to_merge", "merged"
];

const STAGE_LABELS: Record<string, string> = {
  queued: "Очередь",
  dev: "Разработка",
  self_check: "Самопроверка",
  pr_opened: "PR создан",
  in_review: "Ревью",
  qa_verifying: "QA",
  ready_to_merge: "К мержу",
  merged: "Замержен",
  needs_human: "Нужен человек",
};
```

### Контекст для Claude Code
- src/types/index.ts (строки 21-48)
- src/components/PipelineControlPanel.tsx (STAGE_ORDER, StageProgress)

## Критерии выполнения
- [ ] Все новые поля optional (?) — не ломают v2 данные
- [ ] STAGE_ORDER обновлён на 8 стадий (+ needs_human как terminal)
- [ ] STAGE_LABELS с русскими названиями
- [ ] Dashboard рендерит v2 данные без ошибок
- [ ] Dashboard рендерит v3 данные с новыми стадиями
- [ ] Линтер чист
