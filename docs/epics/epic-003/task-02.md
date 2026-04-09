# Task-02: TranscriptProgress — 6-step progress bar + stage names

## Метаданные
- Epic: epic-003
- GitHub Issue: #TBD
- Приоритет: P2-high
- Зависит от: epic-003/task-01
- Размер: M

## Описание

Обновить `src/components/TranscriptProgress.tsx` для отображения 5-stage pipeline.

### Изменения:

1. **STAGES массив** — заменить 4 стадии на 6 (5 stages + done):
   ```typescript
   const STAGES: { key: TranscriptStage; label: string; icon: string }[] = [
     { key: "intake", label: "Приём", icon: "1" },
     { key: "stt", label: "Транскрипция", icon: "2" },
     { key: "enrichment", label: "Обогащение", icon: "3" },
     { key: "structuring", label: "Структурирование", icon: "4" },
     { key: "synthesis", label: "Синтез", icon: "5" },
     { key: "done", label: "Готово", icon: "✓" },
   ];
   ```

2. **Stage detail** — показывать `stage_detail` под текущей активной стадией (например: "Post-correction + Speaker ID")

3. **Stages completed визуализация** — использовать `stages_completed[]` из status для точного отображения:
   - Completed stages → зелёная галка
   - Current stage → пульсирующий индикатор + progress %
   - Future stages → серый

4. **Error state** — при ошибке показать на какой стадии произошёл сбой (из `current_stage`), предложить Retry

5. **Backward-compat** — если `current_stage` отсутствует (старый backend), использовать текущую логику маппинга 4 stages

### Файлы:
- `src/components/TranscriptProgress.tsx` — основные изменения
- CSS если нужно для 6-step layout

## Контекст для Claude Code
Прочитай перед работой:
- ~/Desktop/MakeIT/makeit-dashboard/CLAUDE.md
- ~/Desktop/MakeIT/makeit-dashboard/docs/epics/epic-003.md
- ~/Desktop/MakeIT/makeit-dashboard/src/components/TranscriptProgress.tsx (текущий код)
- ~/Desktop/MakeIT/makeit-dashboard/src/utils/transcript.ts (обновлённые типы из task-01)

## Критерии выполнения
- [ ] 6-step progress bar (5 stages + done)
- [ ] Completed stages отмечены зелёной галкой
- [ ] Current stage показывает пульс + detail text
- [ ] Error state указывает на стадию сбоя
- [ ] Backward-compatible для jobs без current_stage
- [ ] `npx tsc --noEmit` проходит
- [ ] Линтер чист
