# Task-02: Commitments (extractor + CRUD таблица)

## Метаданные
- Epic: epic-011
- GitHub Issue: #351
- Приоритет: P2-high
- Зависит от: Epic-009 #03, Task-01 (github-contents.ts)
- Параллельно: да
- Размер: L

## Описание
Источник №1 — BRIEF.md (секция `commitments:`), fallback — `docs/commitments.yaml`. CRUD из UI пишет в yaml через GitHub Contents API.

1. `src/utils/commitmentsExtractor.ts` — `extractCommitments(briefMd, yaml) → Commitment[]`. Сначала парсит `## Commitments` / `commitments:` в BRIEF.md (bullet-list с датой/клиентом), затем merge'ит с `docs/commitments.yaml` (yaml-приоритет для дубликатов по `text + client`). Schema: `{text: string, due: ISO, client: string, status: 'open' | 'done' | 'overdue'}`.
2. `src/components/v4/hub/CommitmentsTable.tsx` — таблица с inline-add row, edit-in-place, delete-confirm. На submit → `writeYaml('docs/commitments.yaml', ...)`. Статус `overdue` вычисляется на клиенте по `due < now`.
3. Batched-CRUD: накапливать N изменений → один commit «chore(hub): update commitments» с агрегированным diff.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — секция commitments
- `docs/prds/PRD-008.md` FR-26, FR-27
- `src/utils/github-contents.ts` (после Task-01)
- `src/types/hub.ts` — тип `Commitment`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `extractCommitments` корректно мержит BRIEF.md + yaml (yaml-приоритет)
- [ ] CRUD в UI: add row → write yaml → reload показывает новую запись
- [ ] При отсутствии файла — empty state с кнопкой «Создать docs/commitments.yaml»
- [ ] Overdue (due < сегодня) подсвечивается красным
