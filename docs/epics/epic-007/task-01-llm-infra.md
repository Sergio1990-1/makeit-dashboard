# Task-01: LLM-инфраструктура — tool-use wrapper, tree-sha, drift-cache

## Метаданные
- Epic: epic-007
- GitHub Issue: #149
- Приоритет: P3-medium
- Зависит от: —
- Параллельно: нет
- Размер: M (~150 строк)

## Описание
Базовый слой для drift-проверок:

1. `src/utils/claude.ts` — расширить:
   ```ts
   callClaudeWithTool<T>(
     apiKey: string,
     systemPrompt: string,
     userMessage: string,
     toolDef: { name: string; description: string; input_schema: object },
     model: 'claude-haiku-4-5-20251001' | 'claude-opus-4-7',
     maxTokens?: number
   ): Promise<T>
   ```
   Использует Anthropic Messages API + tool_use, заставляет модель вызвать ровно один tool, парсит `input` блок, возвращает типизированно. Если модель не вызвала tool — throw `Error("model did not call tool")`.

2. `src/utils/github-actions.ts:getRepoTreeSha(token, owner, repo, branch?)`:
   - REST `GET /repos/{owner}/{repo}/git/refs/heads/{branch}` → `object.sha` (commit sha)
   - REST `GET /repos/.../git/commits/{sha}` → `tree.sha`
   - Возвращает `{commitSha, treeSha}`. Если `branch` не указан — `default_branch` из `getRepoMeta`.

3. `src/utils/health-llm-cache.ts`:
   ```ts
   getCached(repo: string, treeSha: string, ruleId: string): HealthFinding | null
   setCached(repo: string, treeSha: string, ruleId: string, finding: HealthFinding): void
   clearCacheForRepo(repo: string): void
   ```
   localStorage-based, key: `makeit_drift_cache:{repo}:{treeSha}:{ruleId}`. Старые tree-sha'и подчищаются при `clearCacheForRepo`.

## Контекст для Claude Code
Прочитай:
- `src/utils/claude.ts` — текущая реализация
- Anthropic API docs — tool use (https://docs.anthropic.com/claude/docs/tool-use)
- `src/utils/github-actions.ts` — паттерн REST хелперов

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Smoke: вызвать `callClaudeWithTool` с простым tool `{ name: 'echo', schema: {message: string} }` → получить `{message}` обратно
- [ ] `getRepoTreeSha('Beer_bot')` возвращает sha-форматированную строку 40 chars
- [ ] localStorage cache работает round-trip
