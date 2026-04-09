# Task-04: TranscriptHistory — quality column + Retry button

## Метаданные
- Epic: epic-003
- GitHub Issue: #TBD
- Приоритет: P2-high
- Зависит от: epic-003/task-01
- Размер: M

## Описание

Обновить `src/components/TranscriptHistory.tsx` для quality column и retry.

### Изменения:

1. **Quality column** — новый столбец в таблице истории:
   - Показывает quality badge (pass/warning/needs_review) для done jobs
   - Для не-done jobs → пусто
   - Для старых jobs без quality → "—"

2. **Retry button** — для jobs со status=error:
   - Кнопка "↻ Повторить" в строке таблицы
   - Вызывает `uploadTranscript()` с `resumeJobId` (из task-01)
   - После нажатия → переключение на TranscriptProgress для этого job

3. **Status column улучшение** — для error status показывать на какой стадии сломалось:
   - "Ошибка (Обогащение)" вместо просто "Ошибка"
   - Используется `current_stage` из API если доступен

### Файлы:
- `src/components/TranscriptHistory.tsx` — quality column, retry button, error detail
- `src/components/TranscriptsTab.tsx` — handler для retry (переключение на progress view)

### Callback для Retry:
- TranscriptHistory получает `onRetry(jobId: string)` callback
- TranscriptsTab реализует: вызов upload с resume → показ TranscriptProgress

## Контекст для Claude Code
Прочитай перед работой:
- ~/Desktop/MakeIT/makeit-dashboard/CLAUDE.md
- ~/Desktop/MakeIT/makeit-dashboard/docs/epics/epic-003.md
- ~/Desktop/MakeIT/makeit-dashboard/src/components/TranscriptHistory.tsx (текущий код)
- ~/Desktop/MakeIT/makeit-dashboard/src/components/TranscriptsTab.tsx (оркестрация)
- ~/Desktop/MakeIT/makeit-dashboard/src/utils/transcript.ts (обновлённые типы из task-01)

## Критерии выполнения
- [ ] Quality column в таблице истории
- [ ] Quality badges (pass/warning/needs_review) для done jobs
- [ ] Retry button для failed jobs
- [ ] Retry вызывает upload с resumeJobId
- [ ] Error status показывает стадию сбоя
- [ ] Backward-compat для jobs без quality/current_stage
- [ ] `npx tsc --noEmit` проходит
- [ ] Линтер чист
