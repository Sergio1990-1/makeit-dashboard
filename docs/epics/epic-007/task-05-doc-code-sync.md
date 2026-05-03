# Task-05: ai_doc_code_sync — STATE_MACHINES.md vs FSM в коде

## Метаданные
- Epic: epic-007
- GitHub Issue: #153
- Приоритет: P3-medium
- Зависит от: task-02
- Параллельно: да
- Размер: L (~250 строк)

## Описание
Только для complex проектов. Самый дорогой чек — Claude opus.

Evidence collector:
1. `readRepoFile(token, owner, repo, 'docs/STATE_MACHINES.md')` → markdown с описанием FSM
2. Code Search через `searchCodeSymbol(token, owner, repo, 'status', 20)` — найти где используется `status` (модели, FSM-валидаторы). limit 20 hits.
3. Опционально: дополнительные поиски по `state`, `phase` если они упомянуты в доке.
4. Соберём evidence-блок:
   ```
   <doc>
   {STATE_MACHINES.md content}
   </doc>
   <code_evidence>
   {hit 1: path + fragment}
   {hit 2: path + fragment}
   ...
   </code_evidence>
   ```

Prompt:
```
SYSTEM: Ты сверяешь описание статусной машины в документации со статусами в коде.

USER: <doc>...</doc>
<code_evidence>...</code_evidence>

Задача:
1. Извлеки из <doc> все упоминаемые статусы (например: draft, confirmed, completed) и переходы.
2. Извлеки из <code_evidence> реальные значения enum/константы статусов и переходов.
3. Сравни:
   - есть ли в коде статусы которых нет в доке
   - есть ли в доке статусы которых нет в коде
   - совпадают ли направления переходов

Если расхождений > 0 → fail с конкретикой (какие статусы расходятся). Если doc и code согласованы → pass.
```

Tool: тот же `report_finding`. Model: `claude-opus-4-7`. Max tokens: 2048.

Важно: evidence ограничивается ~20 фрагментов кода + 1 файл доки → ≈ 8–15k токенов input, ≤ 1k output. Стоимость opus: ~$0.15-0.25/scan на complex repo.

## Контекст для Claude Code
Прочитай:
- task-01, task-02
- `src/utils/github-actions.ts:searchCodeSymbol` (уже есть, но ловит только Python)
- `Skills/PROJECT_CHECKLIST.yaml` rule `drift.state_machines_vs_code`
- Реальный STATE_MACHINES.md: `Sewing-ERP/docs/STATE_MACHINES.md`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Тест на Sewing-ERP: 7 моделей с status enum → доку с описанием FSM. LLM находит расхождения если они есть, или pass если синхронно
- [ ] Стоимость scan ≤ $0.30 (opus)
- [ ] При rate-limit/timeout от Anthropic API — graceful unknown с пометкой
