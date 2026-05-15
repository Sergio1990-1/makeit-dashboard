# Task-02: Weekly Project Digest (generator + viewer)

## Метаданные
- Epic: epic-012
- GitHub Issue: #360
- Приоритет: P2-high
- Зависит от: Task-01 (claudeBudget)
- Параллельно: да
- Размер: L

## Описание
Еженедельный дайджест per-project и кросс-портфельный. Claude Sonnet с fallback на Haiku при budget-overflow (`shouldFallbackToHaiku()`).

1. `src/utils/weeklyDigestGenerator.ts` — `generateDigest(repo, weekISO) → markdown`. Input: pulse за неделю + closed issues + merged PRs + commitments delivered + audit findings за период. Output markdown секции `## Shipped / ## In progress / ## Blocked / ## Decisions / ## Clients touched / ## Spend`. Сохранение через `github-contents.writeFile()` в `digests/{repo}/{YYYY-WW}.md`. Portfolio-уровень: `generatePortfolioDigest(weekISO)` — собирает все per-project digests + меты → `digests/{YYYY-WW}-portfolio.md`.
2. Week-cache в localStorage: `makeit_digest:{repo}:{YYYY-WW}` (TTL до конца недели). Кнопка regenerate инвалидирует cache.
3. `src/components/v4/hub/DigestViewer.tsx` — markdown viewer (через `marked` + DOMPurify) + history dropdown (последние 12 недель) + кнопка «Regenerate» с preview ожидаемой стоимости (estimate tokens × tariff) до подтверждения.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Project Digest
- `docs/prds/PRD-008.md` FR-34
- `src/utils/claude.ts` — Claude API клиент
- `src/utils/claudeBudget.ts` (после Task-01)
- `src/utils/github-contents.ts` — writeFile API
- `src/utils/transcript-markdown.ts` — образец marked + DOMPurify

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `generateDigest` выдаёт все 6 секций даже при пустом input (placeholder «—»)
- [ ] При `shouldFallbackToHaiku()` модель в request — `haiku`, в UI бейдж «budget fallback»
- [ ] File сохраняется в `digests/{repo}/{YYYY-WW}.md` в dashboard repo, portfolio-файл — в корне `digests/`
- [ ] History dropdown показывает последние 12 weeks; click → load и render
- [ ] Regenerate показывает estimated cost preview до подтверждения
