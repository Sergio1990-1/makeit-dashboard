# Task-03: Risk Register (types + CRUD таблица + ETag conflict)

## Метаданные
- Epic: epic-011
- GitHub Issue: #352
- Приоритет: P2-high
- Зависит от: Epic-009 #03, Task-01 (github-contents.ts)
- Параллельно: да
- Размер: L

## Описание
Risk Register над `docs/risks.yaml`. CRUD + ETag conflict resolution (когда yaml изменили из другого браузера/коммита).

1. `src/types/hub.ts` — расширить: `Risk = {id: string, title: string, severity: 'low'|'med'|'high'|'critical', probability: 'low'|'med'|'high', mitigation: string, owner: string, due: ISO | null, status: 'open'|'mitigated'|'accepted'|'closed', source: 'manual'|'transcript-extracted'|'audit-promoted'}`.
2. `src/components/v4/hub/RiskRegisterTable.tsx` — sortable table (по severity desc default), inline edit, severity/probability как dropdown, status pills. Кнопка «Add risk» → modal form.
3. ETag conflict dialog — при 409 от PUT contents показать «Кто-то изменил risks.yaml. [Reload remote] / [Overwrite anyway]». При reload — re-read + merge локальных изменений поверх.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — schema risks.yaml, ETag-стратегия
- `docs/prds/PRD-008.md` FR-28, FR-29, FR-30
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.3 Risk Register
- `src/utils/github-contents.ts` — sha как ETag
- `src/types/hub.ts`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] CRUD над `docs/risks.yaml`: add / edit / delete → commit в репо
- [ ] Sort по severity (critical > high > med > low) работает
- [ ] ETag conflict — диалог появляется, оба действия корректны
- [ ] `source` отображается badge'ом (manual / transcript-extracted / audit-promoted)
- [ ] Empty state с кнопкой «Создать docs/risks.yaml» при отсутствии файла
