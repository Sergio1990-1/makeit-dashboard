# Task-04: Renewals (manual yaml + auto-scanner deprecated deps)

## Метаданные
- Epic: epic-011
- GitHub Issue: #353
- Приоритет: P2-high
- Зависит от: Epic-009 #03, Task-01 (github-contents.ts)
- Параллельно: да
- Размер: L

## Описание
Отслеживание сроков продлений: SSL, домены, контракты, лицензии — вручную в yaml; deprecated/CVE deps — автосканом из `package.json`.

1. `src/utils/renewalsScanner.ts` — `scanRenewals(repo, yaml, packageJson) → Renewal[]`. Читает `docs/renewals.yaml` (manual entries) + сканирует `package.json` через GitHub Contents (опционально npm audit endpoint, без сетевого вызова если нельзя — просто mark `deprecated: true` поля). Виртуальные entries для deps помечаются `source: 'auto-scan'` и НЕ пишутся в yaml.
2. `src/components/v4/hub/RenewalsTable.tsx` — таблица с фильтром по type (ssl / domain / contract / license / dep). CRUD только для manual entries; auto-scan entries read-only с tooltip «Auto-detected, fix in package.json». Sort по `expires_at` asc.
3. Schema: `{type: 'ssl'|'domain'|'contract'|'license'|'dep', name: string, expires_at: ISO | null, notes: string, source: 'manual'|'auto-scan'}`.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — секция renewals
- `docs/prds/PRD-008.md` FR-31, FR-32
- `src/utils/github-contents.ts`
- `src/types/hub.ts`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `scanRenewals` мержит yaml + auto-scan корректно (нет дублей)
- [ ] CRUD работает только для `source === 'manual'`; auto-scan rows disabled
- [ ] Sort по `expires_at` (ближайший срок первым), null в конце
- [ ] Истёкшие (`expires_at < now`) подсвечены красным, скоро истекающие (< 30 дн) — жёлтым
- [ ] Empty state с кнопкой «Создать docs/renewals.yaml»
