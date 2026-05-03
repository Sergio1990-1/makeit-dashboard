# Task-04: ai_contract_milestones_sync — CONTRACT_STAGES vs GitHub milestones

## Метаданные
- Epic: epic-007
- GitHub Issue: #152
- Приоритет: P3-medium
- Зависит от: task-02
- Параллельно: да
- Размер: M (~140 строк)

## Описание
LLM-проверка. Только для client-проектов.

Evidence:
1. `readRepoFile(token, owner, repo, 'docs/CONTRACT_STAGES.md')` → весь markdown
2. `listMilestones(token, owner, repo)` → массив `{number, title, state, due_on, open_issues, closed_issues}`

Prompt (system + user):
```
SYSTEM: Ты помощник, который проверяет согласованность контрактных этапов проекта с milestones в GitHub.
USER: Вот содержимое CONTRACT_STAGES.md:
---
{markdown}
---
Вот milestones репо:
{json milestones}

Найди расхождения:
- этап в CONTRACT_STAGES помечен «в работе», но milestone закрыт (или наоборот)
- этап ссылается на `Epic-NNN` которого нет среди milestones
- даты не совпадают
- статусы не совпадают

Если расхождений нет → status pass, detail «Контракт синхронизирован с milestones (N этапов)».
Если есть → status fail, detail с конкретными расхождениями (≤ 200 chars).
```

Tool definition:
```json
{
  "name": "report_finding",
  "description": "Report sync result",
  "input_schema": {
    "type": "object",
    "properties": {
      "status": {"enum": ["pass", "fail"]},
      "detail": {"type": "string", "maxLength": 250},
      "remediation": {"type": "string", "maxLength": 400},
      "confidence": {"type": "number"}
    },
    "required": ["status", "detail", "confidence"]
  }
}
```

Model: `claude-haiku-4-5-20251001`. Max tokens: 1024. После вызова:
- Если confidence < 0.7 → status: unknown, detail prefix `(уверенность {pct}%)`
- Кэшировать в localStorage (см. task-01)

## Контекст для Claude Code
Прочитай:
- task-01 (callClaudeWithTool)
- task-02 (orchestrator)
- `Skills/PROJECT_CHECKLIST.yaml` rules `client.contract_milestones_sync`, `drift.contract_milestones`
- `src/utils/github-actions.ts:listMilestones`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Тест на mankassa-app: если CONTRACT_STAGES.md упоминает Epic-2 которого нет — fail с конкретикой
- [ ] Стоимость одного вызова ≤ $0.01 (haiku, 5–10k input)
- [ ] При confidence < 0.7 — finding: unknown
