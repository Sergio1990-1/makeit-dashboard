# Task-04: Risk badges и execution policy display

## Epic: epic-002
## Зависимости: task-01, makeit-pipeline epic-020/task-04-06 (risk_classifier)

## Описание

Отобразить risk level и execution policy для каждого issue.

### Изменения в PipelineControlPanel.tsx

**Results table — risk badge:**
- `low` → зелёный бейдж "auto"
- `medium` → оранжевый бейдж "guarded"
- `high` → красный бейдж "gated"

**Tooltip с пояснением:**
- full_auto: "Автоматический merge"
- guarded_auto: "Merge после подтверждения"
- human_gated: "Останавливается на PR"

**Queue display:**
- Показать risk level для задач в очереди

### Контекст для Claude Code
- src/types/index.ts — risk_level и execution_policy уже добавлены в task-01
- src/components/PipelineControlPanel.tsx — results row, queue display

## Критерии выполнения
- [ ] Risk badge (green/orange/red) в results table
- [ ] Tooltip с execution policy
- [ ] Risk indicator в queue
- [ ] Graceful fallback если risk_level отсутствует
- [ ] Dark/light theme
- [ ] Линтер чист
