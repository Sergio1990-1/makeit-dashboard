# Task-02: PR в makeit-knowledge — удалить дубликат, добавить case_insensitive

## Метаданные
- Epic: epic-008
- GitHub Issue: #157
- Приоритет: P3-medium
- Зависит от: —
- Параллельно: да
- Размер: S (~30 строк YAML)

## Описание
PR в `Sergio1990-1/makeit-knowledge`, ветка `feat/checklist-cleanup-iter2`. Файл: `Skills/PROJECT_CHECKLIST.yaml`.

Изменения:
1. **Удалить правило** `ops.new_project_missing_business_logic` целиком — оно дублирует сигнал `knowledge.business_logic_present`. grace для новых проектов уже есть на уровне `settings.grace_period_days`.
2. **Добавить** `case_insensitive: true` к проверке правила `hygiene.readme`:
   ```yaml
   - id: hygiene.readme
     check: { type: file_exists, path: README.md, case_insensitive: true }
   ```
3. Соответственно — добавить поддержку `case_insensitive` в check_types_supported описание (комментарий).

## Контекст для Claude Code
Прочитай:
- `Sergio1990-1/makeit-knowledge:Skills/PROJECT_CHECKLIST.yaml`
- task-03 (использует этот флаг)

## Критерии выполнения
- [ ] PR открыт, YAML валиден (`python -c "import yaml; yaml.safe_load(open(...))"`)
- [ ] Правило `ops.new_project_missing_business_logic` удалено
- [ ] `hygiene.readme` имеет `case_insensitive: true`
- [ ] PR замержен в main makeit-knowledge
- [ ] После мержа на дашборде: `ops.new_project_missing_business_logic` не появляется в findings
