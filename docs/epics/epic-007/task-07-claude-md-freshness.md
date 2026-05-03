# Task-07: ai_claude_md_freshness — пути и команды в CLAUDE.md ещё валидны

## Метаданные
- Epic: epic-007
- GitHub Issue: #155
- Приоритет: P3-medium
- Зависит от: task-02
- Параллельно: да
- Размер: M (~110 строк)

## Описание
Claude haiku.

Evidence:
1. `readRepoFile(token, owner, repo, 'CLAUDE.md')` → markdown
2. `listRepoFiles(token, owner, repo, '.')` → файлы корня
3. Опционально: список `Makefile` targets (если файл существует — `readRepoFile`), список scripts/ если есть

Prompt:
```
SYSTEM: Ты проверяешь актуальность CLAUDE.md проекта — упоминаемые пути и команды должны существовать.

USER: <claude_md>{content}</claude_md>
<repo_root>{file list}</repo_root>
<makefile>{content or "не найден"}</makefile>

Извлеки из CLAUDE.md упоминания путей (`src/utils/...`), скриптов (`./scripts/foo.sh`), make-таргетов (`make dev`). Сверь с фактическим состоянием:
- путь существует в repo_root или в подпапках?
- команда упоминается в Makefile?

Если все упомянутое существует → pass.
Если есть устаревшие упоминания (например, `./scripts/old-deploy.sh` который удалили) → fail с конкретными примерами.
```

Tool: `report_finding`. Model: `claude-haiku-4-5-20251001`. Max tokens: 1024.

## Контекст для Claude Code
Прочитай:
- task-01, task-02
- `Skills/PROJECT_CHECKLIST.yaml` rule `drift.claude_md_freshness`
- Пример: `makeit-dashboard/CLAUDE.md` (этот же проект)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Тест на makeit-dashboard: CLAUDE.md упоминает `src/utils/config.ts` etc — все должны существовать → pass
- [ ] Тест на проект с устаревшим CLAUDE.md (создать тестовый случай локально или найти реальный): найти расхождения
- [ ] Стоимость ≤ $0.02 (haiku)
