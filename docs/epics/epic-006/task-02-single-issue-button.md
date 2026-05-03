# Task-02: Single-issue button на FindingsBoard fail-карточке

## Метаданные
- Epic: epic-006
- GitHub Issue: #147
- Приоритет: P2-high
- Зависит от: task-01
- Параллельно: нет
- Размер: M (~120 строк)

## Описание
Кнопка `→ issue` на каждой fail-карточке в `FindingsBoard.tsx`.

Поток:
1. Клик → `findOpenIssueByTitle(token, GITHUB_OWNER, repo, title)`.
2. Если найден — toast «Уже есть #{N}» с ссылкой → state «duplicate». Кнопка переключается в `#{N} ✓`.
3. Если не найден — `createIssue(...)` → `addIssueToProject(token, owner, repo, n, 1)` → toast «Создан #{N}» с ссылкой. Кнопка → `#{N} ✓`.
4. Ошибка — toast с текстом ошибки (НЕ raw response, см. github-actions.ts паттерн).

State per-finding (kebab по rule_id):
```ts
type FindingActionState =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'created'; number: number; url: string }
  | { kind: 'duplicate'; number: number; url: string }
  | { kind: 'error'; message: string };
```

Хранится в `Map<rule_id, FindingActionState>` в `ProjectHealthPage` (или близжайшем родителе).

UI: кнопка справа в карточке fail. При `kind: 'creating'` — спиннер. При `created/duplicate` — «#{N} ✓» как ссылка на issue.

## Контекст для Claude Code
Прочитай:
- `src/components/v4/health/FindingsBoard.tsx` — где добавлять кнопку
- `src/components/v4/health/ProjectHealthPage.tsx` — где хранить state
- `src/components/v4/ToastHost.tsx` — как показать toast
- task-01 (`buildIssueTitle/Body/Labels`, `findOpenIssueByTitle`)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Smoke на Beer_bot: клик «→ issue» на `hygiene.contributing` создаёт issue в Sergio1990-1/Beer_bot с title `[health] CONTRIBUTING.md в корне`, labels `tech-debt, P3-medium`
- [ ] Issue добавлен в трекер (gh project 1) — проверяется `gh project item-list 1 --owner Sergio1990-1 | grep "[health]"`
- [ ] Повторный клик той же кнопки — не создаёт второй issue (тост «уже есть #N»)
- [ ] При ошибке — friendly message в toast, не raw API response
