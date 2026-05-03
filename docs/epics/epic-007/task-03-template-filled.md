# Task-03: ai_template_filled — regex детектор плейсхолдеров

## Метаданные
- Epic: epic-007
- GitHub Issue: #151
- Приоритет: P3-medium
- Зависит от: task-02
- Параллельно: да (с task-04..07)
- Размер: S (~60 строк)

## Описание
Без LLM. Regex-only.

В `src/utils/health-llm.ts` или отдельном `src/utils/checks/templateFilled.ts`:

```ts
async function checkTemplateFilled(
  token, owner, repo, rule
): Promise<HealthFinding>
```

Алгоритм:
1. Из `rule.check.path` или `paths_glob` собрать список путей для проверки.
2. Для каждого: `readRepoFile(token, owner, repo, path)` — читаем содержимое.
3. Считаем placeholders:
   - `\[(?:Название|YYYY-MM-DD|сумма|номер|описание|Имя|клиента|MM-DD)[^\]]*\]` — стандартные шаблоны MakeIT
   - `\bXXX\b`, `\bTODO\b`, `\bTBD\b`
4. Если суммарно > 5 плейсхолдеров — fail с detail «{count} плейсхолдеров в {N} файлах: {first 3 examples}».
5. Если файла нет (404) — `unknown` (это уже ловит file_exists правило).

Применяется к:
- `client.contract_stages_filled` — path: `docs/CONTRACT_STAGES.md`
- `drift.brief_template_filled` — paths_glob: `docs/prds/**/*.md`

## Контекст для Claude Code
Прочитай:
- `src/utils/github-actions.ts:readRepoFile`
- `Skills/PROJECT_CHECKLIST.yaml` rules `client.contract_stages_filled` и `drift.brief_template_filled`
- task-02 (oркестратор зовёт эту функцию)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Тестируем на quiet-walls (client) — `docs/CONTRACT_STAGES.md` если шаблон → fail с числом плейсхолдеров
- [ ] Тестируем на mankassa-app — если CONTRACT_STAGES реально заполнен → pass
