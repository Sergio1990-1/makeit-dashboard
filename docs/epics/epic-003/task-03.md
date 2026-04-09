# Task-03: TranscriptBrief — quality badge + quality report expandable

## Метаданные
- Epic: epic-003
- GitHub Issue: #TBD
- Приоритет: P2-high
- Зависит от: epic-003/task-01
- Размер: M

## Описание

Обновить `src/components/TranscriptBrief.tsx` для отображения quality status.

### Изменения:

1. **Quality badge** — в header рядом с заголовком BRIEF показать badge:
   - `pass` → зелёный badge "✓ Качество ОК"
   - `warning` → жёлтый badge "⚠ Есть замечания"
   - `needs_review` → красный badge "✗ Требуется проверка"
   - `null` (старый job) → не показывать badge

2. **Quality report expandable** — кликабельный badge раскрывает детали:
   - Список проверок (quality_report.checks[]) с status icon + message
   - Общий score (quality_report.score)
   - Collapsible секция (по умолчанию свёрнута)

3. **Стилизация** — badge стили через CSS custom properties (dark/light theme):
   ```css
   .quality-badge--pass { background: var(--color-success-bg); color: var(--color-success); }
   .quality-badge--warning { background: var(--color-warning-bg); color: var(--color-warning); }
   .quality-badge--needs-review { background: var(--color-error-bg); color: var(--color-error); }
   ```

### Файлы:
- `src/components/TranscriptBrief.tsx` — badge + expandable report
- Стили inline или в существующем CSS файле

### Props изменения:
- TranscriptBrief получает `quality` и `quality_report` из TranscriptResult (task-01)

## Контекст для Claude Code
Прочитай перед работой:
- ~/Desktop/MakeIT/makeit-dashboard/CLAUDE.md
- ~/Desktop/MakeIT/makeit-dashboard/docs/epics/epic-003.md
- ~/Desktop/MakeIT/makeit-dashboard/src/components/TranscriptBrief.tsx (текущий код)
- ~/Desktop/MakeIT/makeit-dashboard/src/utils/transcript.ts (обновлённые типы из task-01)

## Критерии выполнения
- [ ] Quality badge отображается в header BRIEF
- [ ] 3 варианта badge: pass (green), warning (yellow), needs_review (red)
- [ ] Quality report expandable при клике на badge
- [ ] Null quality → badge не показывается (backward-compat)
- [ ] Dark/light theme корректно
- [ ] `npx tsc --noEmit` проходит
- [ ] Линтер чист
