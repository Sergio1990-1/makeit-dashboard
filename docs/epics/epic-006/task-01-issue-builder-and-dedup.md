# Task-01: Issue builder + dedup helper

## Метаданные
- Epic: epic-006
- GitHub Issue: #146
- Приоритет: P2-high
- Зависит от: —
- Параллельно: нет
- Размер: S (~80 строк)

## Описание
Чистые функции — пишем без UI, тестируем юнит-тестами.

1. `src/utils/health-issue.ts`:
   ```ts
   buildIssueTitle(finding: HealthFinding): string  // "[health] {finding.title}"
   buildIssueBody(finding: HealthFinding, repo: string, classification: ProjectClassification, generatedAt: string): string
   buildIssueLabels(finding: HealthFinding): string[]  // ["tech-debt"] + severity priority label
   ```
   Severity → label маппинг:
   - critical → P1-critical
   - high → P2-high
   - medium → P3-medium
   - low → нет priority

2. `findOpenIssueByTitle(token, owner, repo, title)` в `github-actions.ts`:
   - Дёргает `/repos/{owner}/{repo}/issues?state=open&per_page=100&labels=tech-debt`
   - Фильтрует в JS по точному совпадению `issue.title === title`
   - Возвращает `{number, url} | null`

3. Юнит-тесты (если в проекте есть test runner — иначе документировать)

## Контекст для Claude Code
Прочитай:
- `src/utils/github-actions.ts:createIssue, addIssueToProject, listRepoIssues`
- `src/types/health.ts` — структура `HealthFinding`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `buildIssueTitle({rule_id: "hygiene.contributing", title: "CONTRIBUTING.md в корне", ...})` → `"[health] CONTRIBUTING.md в корне"`
- [ ] `buildIssueLabels({severity: "critical", ...})` → `["tech-debt", "P1-critical"]`
- [ ] `findOpenIssueByTitle` возвращает существующий issue если title совпадает
