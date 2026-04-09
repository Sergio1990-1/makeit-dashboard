# Task-01: Types + API client — 5-stage model, quality, resume

## Метаданные
- Epic: epic-003
- GitHub Issue: #TBD
- Приоритет: P2-high
- Зависит от: makeit-pipeline epic-021 task-01 (manifest schema), epic-023 task-05 (quality API)
- Размер: M

## Описание

Обновить `src/utils/transcript.ts` и типы для поддержки нового 5-stage pipeline.

### Изменения в `src/utils/transcript.ts`:

1. **TranscriptStage** — расширить на 5 backend stages + done:
   ```typescript
   export type TranscriptStage = "intake" | "stt" | "enrichment" | "structuring" | "synthesis" | "done";
   ```

2. **TranscriptStatus** — добавить новые поля:
   ```typescript
   export interface TranscriptStatus {
     // ... existing fields
     current_stage: string | null;      // NEW: backend stage name
     stages_completed: string[];        // NEW: list of completed stages
   }
   ```

3. **TranscriptResult** — добавить quality:
   ```typescript
   export interface TranscriptResult {
     // ... existing fields
     quality: "pass" | "warning" | "needs_review" | null;  // NEW
     quality_report: QualityReport | null;                   // NEW
   }
   
   export interface QualityReport {
     checks: QualityCheck[];
     score: number;
   }
   
   export interface QualityCheck {
     name: string;
     status: "pass" | "warning" | "fail";
     message: string;
   }
   ```

4. **mapStatusToStage()** — обновить маппинг для новых backend stages:
   - Если backend отправляет `current_stage` → использовать его напрямую
   - Fallback на старый маппинг для backward-compat (jobs без current_stage)

5. **fetchTranscriptStatus()** — парсить новые поля (с fallback на null/[])

6. **fetchTranscriptResult()** — парсить quality + quality_report

7. **uploadTranscript()** — добавить optional `resumeJobId` параметр:
   ```typescript
   export async function uploadTranscript(
     file: File,
     project: string,
     transcriptionModel: TranscriptionModel = "fast",
     resumeJobId?: string,  // NEW: for retry
   ): Promise<TranscriptUploadResponse>
   ```

8. **TranscriptListItem** — добавить `quality` field:
   ```typescript
   export interface TranscriptListItem {
     // ... existing fields
     quality?: "pass" | "warning" | "needs_review";  // NEW
   }
   ```

### Backward-compatibility
- Все новые поля optional (null/undefined если backend старый)
- mapStatusToStage() fallback на текущую логику если current_stage отсутствует
- Старые jobs в /list без quality → отображаются без badge

## Контекст для Claude Code
Прочитай перед работой:
- ~/Desktop/MakeIT/makeit-dashboard/CLAUDE.md
- ~/Desktop/MakeIT/makeit-dashboard/docs/epics/epic-003.md
- ~/Desktop/MakeIT/makeit-dashboard/src/utils/transcript.ts (текущий код)
- ~/Desktop/makeit-pipeline/docs/specs/SPEC-012.md (API контракт)

## Критерии выполнения
- [ ] TranscriptStage расширен на 5+done stages
- [ ] TranscriptStatus содержит current_stage и stages_completed
- [ ] TranscriptResult содержит quality и quality_report
- [ ] TranscriptListItem содержит optional quality
- [ ] mapStatusToStage() backward-compatible
- [ ] uploadTranscript() принимает optional resumeJobId
- [ ] QualityReport/QualityCheck типы определены
- [ ] `npx tsc --noEmit` проходит
- [ ] Линтер чист
