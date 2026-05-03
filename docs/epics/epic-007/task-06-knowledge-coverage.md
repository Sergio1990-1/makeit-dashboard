# Task-06: ai_knowledge_coverage — knowledge файл vs домены кода

## Метаданные
- Epic: epic-007
- GitHub Issue: #154
- Приоритет: P3-medium
- Зависит от: task-02
- Параллельно: да
- Размер: M (~120 строк)

## Описание
Только для tier-1 проектов. Claude opus.

Evidence:
1. Резолвим путь knowledge файла (`classification.knowledge_path` или дефолт `knowledge/{repo}-business-logic.md`)
2. `readRepoFile(token, KNOWLEDGE_OWNER, KNOWLEDGE_REPO, knowledgePath)` → бизнес-описание
3. `listRepoFiles(token, owner, repo, 'docs/DOMAINS')` → массив доменов кода
4. Для каждого домена — название (без `.md`) + первые 200 chars из файла
5. Собираем evidence:
   ```
   <knowledge>{knowledge content}</knowledge>
   <domains>
   {domain 1: name, snippet}
   {domain 2: name, snippet}
   ...
   </domains>
   ```

Prompt:
```
SYSTEM: Ты проверяешь покрывает ли knowledge-документ все домены кода проекта.

USER: <knowledge>...</knowledge>
<domains>...</domains>

Каждый домен из <domains> должен быть упомянут (хоть кратко) в <knowledge>. Если какой-то домен совсем не упомянут — это пробел.

Если все домены покрыты → pass, detail «Все N доменов упомянуты».
Если нет → fail, detail с перечислением непокрытых.
```

Tool: `report_finding`. Model: opus. Max tokens: 1500.

## Контекст для Claude Code
Прочитай:
- task-01, task-02
- `src/utils/health-engine.ts:resolveExternalPath` — переиспользовать
- `src/utils/github-actions.ts:listRepoFiles, readRepoFile`
- `Skills/PROJECT_CHECKLIST.yaml` rule `drift.knowledge_coverage`
- Пример: `makeit-knowledge/knowledge/mankassa-business-logic.md` + `mankassa-app/docs/DOMAINS/`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Тест на mankassa-app: видит N доменов в DOMAINS/, проверяет упомянуты ли в business-logic.md
- [ ] Если в repo нет docs/DOMAINS/ — статус `skipped` (правило не применимо)
- [ ] Стоимость ≤ $0.20
