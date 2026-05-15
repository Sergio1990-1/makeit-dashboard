# Task-01: Decision Log (extractor + read-only UI)

## Метаданные
- Epic: epic-011
- GitHub Issue: #350
- Приоритет: P2-high
- Зависит от: Epic-009 #03
- Параллельно: да (с #02..#04)
- Размер: M

## Описание
Базовый слой работы с GitHub Contents API + парсер решений + read-only компонент журнала решений.

1. `src/utils/github-contents.ts` — обёртка над GitHub Contents REST API: `readYaml(repo, path)` (GET + base64 decode + YAML parse, возвращает `{data, sha}` или `null`), `writeYaml(repo, path, data, message, sha?)` (PUT с base64 encode + ETag через sha). Ошибки 404 → null, 409 → ConflictError.
2. `src/utils/decisionLogExtractor.ts` — `extractDecisions(briefMd, commits) → Decision[]`. Парсит `## decisions:` или `### Decisions` секцию BRIEF.md (bullet-list) + conventional commits с префиксами `decide:` / `accept:` (игнор `feat:` / `fix:`). Сортировка по дате desc.
3. `src/components/v4/hub/DecisionLog.tsx` — chronological list с датой, автором, источником (`brief` / `commit` / `adr`).

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — архитектурные решения
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.3 Decisions & Risks
- `docs/prds/PRD-008.md` FR-23, FR-24
- `src/utils/github.ts` — пример GraphQL клиента и работы с токеном
- `src/types/hub.ts` (Epic-009) — тип `Decision`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `readYaml` возвращает `null` для несуществующего файла без throw
- [ ] `extractDecisions` парсит решения из BRIEF.md fixtures + игнорирует `feat:` коммиты
- [ ] `DecisionLog.tsx` рендерит список с датой/источником, пустой state при `decisions.length === 0`
- [ ] `useProjectHub` отдаёт реальные `decisions` (не stub) на тестовом репо
