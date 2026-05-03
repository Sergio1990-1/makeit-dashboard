# Task-03: pathExists поддерживает case_insensitive

## Метаданные
- Epic: epic-008
- GitHub Issue: #158
- Приоритет: P3-medium
- Зависит от: task-02 (после мержа PR в makeit-knowledge)
- Параллельно: да (после task-02)
- Размер: S (~20 строк)

## Описание
В `src/utils/health-engine.ts:pathExists` — добавить параметр `caseInsensitive?: boolean` (default false).

Логика: вместо `items.find(i => i.name === name)` → `items.find(i => caseInsensitive ? i.name.toLowerCase() === name.toLowerCase() : i.name === name)`.

В `executeCheck` для `file_exists`:
```ts
const caseInsensitive = param<boolean>(c, "case_insensitive", false);
const ok = await pathExists(..., caseInsensitive);
```

Аналогично для `file_contains` (использует pathExists под капотом).

## Контекст для Claude Code
Прочитай:
- `src/utils/health-engine.ts` — `pathExists`, `executeCheck`
- task-02 (YAML cleanup) — должен быть смержен до этой задачи

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Тест: репо с `README.MD` (если найдётся) → `hygiene.readme` pass
- [ ] Регрессия: репо с `README.md` (стандартное) — продолжает pass
