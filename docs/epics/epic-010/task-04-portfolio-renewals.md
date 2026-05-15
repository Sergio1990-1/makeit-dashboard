# Task-04: PortfolioRenewals

## Метаданные
- Epic: epic-010
- GitHub Issue: #346
- Приоритет: P2-high
- Зависит от: Epic-011 #04 (renewals per-project hook)
- Параллельно: да (с #02, #03, #05)
- Размер: S

## Описание
Cross-project агрегатор предстоящих обновлений / истечений. Читает `docs/renewals.yaml` по всем 12 репо + результаты сканера deprecated/CVE deps (Epic-011 #04), сортирует по `expiresAt` возрастанию, берёт top-5.

Цвет по urgency:
- **red** — `expiresAt ≤ today + 7д`
- **yellow** — `≤ today + 30д`
- **gray** — `> 30д`

Формат строки: `[type-icon] · название · client · expires in Nд`. Типы: SSL, domain, contract, license, deprecated-dep, CVE-dep. Клик → `?tab=projects&repo=X&subtab=decisions#renewals`.

Empty state: «Ближайших обновлений нет».

Параллельная загрузка 12 репо через `Promise.all`. Кэш — sessionStorage `makeit_portfolio_renewals`, TTL 1 час (renewals — медленно меняющиеся данные).

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — раздел `PortfolioRenewals`
- `docs/prds/PRD-008.md` FR-5, FR-7
- `docs/epics/epic-011/task-04-*.md` — формат `renewals.yaml` и dep-scanner
- `src/utils/config.ts` — список 12 проектов

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Виджет показывает top-5 ближайших по сроку, отсортированных asc
- [ ] Цвет: red (≤7д), yellow (≤30д), gray (>30д); цвет не единственный носитель смысла (есть текст «in Nд»)
- [ ] Иконка типа (SSL/domain/contract/license/dep/CVE) отображается
- [ ] Клик ведёт в Hub Decisions & Risks с якорем `#renewals`
- [ ] Empty state «Ближайших обновлений нет» при пустом результате
