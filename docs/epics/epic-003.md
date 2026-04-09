# Epic-003: Transcript Tab — Stage Pipeline + Quality Display

## Метаданные
- PRD: PRD-012 (makeit-pipeline)
- Milestone: #3
- Дедлайн: 2026-05-30 (после epic-023 в pipeline)
- Статус: planning
- Приоритет: P2-high
- Связь: makeit-pipeline epic-021/022/023

## Обзор

Обновление вкладки «Транскрипты» под новый 5-stage checkpointed pipeline из makeit-pipeline PRD-012. Текущий Dashboard показывает 4 стадии (upload → transcription → processing → done) с одним процентом прогресса. Новый backend добавляет:
- 5 гранулярных стадий (intake → stt → enrichment → structuring → synthesis)
- quality field (pass/warning/needs_review) на результатах
- resume parameter для retry failed jobs
- stages_completed array для точного прогресса

Dashboard должен отразить эти изменения, сохраняя backward-compatibility (старые jobs без новых полей показываются как раньше).

## Текущее состояние кода

### Файлы, которые будут затронуты

| Файл | Что сейчас | Что нужно изменить |
|------|-----------|-------------------|
| `src/utils/transcript.ts` | `TranscriptStage = "upload" \| "transcription" \| "processing" \| "done"`, `mapStatusToStage()`, `TranscriptStatus`, `TranscriptResult` | Расширить stages на 5, добавить quality/stages_completed в типы, добавить resume в upload |
| `src/components/TranscriptProgress.tsx` | 4-step progress bar (Загрузка → Транскрипция → Обработка → Готово), polling | 6-step progress bar (5 stages + done), показ current_stage name |
| `src/components/TranscriptBrief.tsx` | Рендер BRIEF.md markdown | Добавить quality badge (pass/warning/needs_review) в header |
| `src/components/TranscriptHistory.tsx` | Таблица с status column | Добавить quality column, Retry button для failed jobs |
| `src/components/TranscriptsTab.tsx` | Оркестрация upload/progress/result/history | Передать resume handler в History для retry |

### API изменения (backend → frontend)

```
GET /transcript/status/{job_id}
  Новые поля (additive):
  + current_stage: "intake"|"stt"|"enrichment"|"structuring"|"synthesis"
  + stages_completed: string[]

GET /transcript/result/{job_id}
  Новые поля (additive):
  + quality: "pass"|"warning"|"needs_review"
  + quality_report: { checks: [...], score: number }

POST /transcript/upload
  Новый параметр (optional):
  + resume: string (job_id для retry)
```

## Задачи

| # | Задача | Зависимости | Размер |
|---|--------|-------------|--------|
| 01 | Types + API client: 5-stage model, quality, resume | — | M |
| 02 | TranscriptProgress: 6-step progress bar + stage names | 01 | M |
| 03 | TranscriptBrief: quality badge + quality report expandable | 01 | M |
| 04 | TranscriptHistory: quality column + Retry button | 01 | M |

## Success Metrics
- 5-stage progress отображается для новых jobs
- Quality badge видно на завершённых результатах
- Retry button работает для failed jobs
- Старые jobs (без новых полей) отображаются корректно (backward-compat)
