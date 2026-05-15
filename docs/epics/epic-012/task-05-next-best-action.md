# Task-05: Next Best Action engine (per-project + portfolio)

## Метаданные
- Epic: epic-012
- GitHub Issue: #363
- Приоритет: P2-high
- Зависит от: Task-01 (claudeBudget)
- Параллельно: да
- Размер: L

## Описание
Ranked рекомендации «что делать дальше» — per-project и кросс-портфельные. Claude Sonnet с fallback на Haiku при budget-overflow.

1. `src/utils/nextBestActionEngine.ts` — `computeProjectNBA(repo) → Action[3]`. Input: top-3 audit findings + top-3 risks + top-3 overdue commitments + drift indicators + inbox top-5. Prompt → Claude Sonnet → ranked top-3 с полями `{title, rationale, severity, link}`. Кэш `makeit_nba:{repo}` week-cached.
2. `computePortfolioNBA() → Action[5]` — собирает top-1 от каждого проекта, сортирует по severity, возвращает top-5. Кэш `makeit_portfolio_nba` week-cached.
3. Кнопка «Regenerate» инвалидирует cache для конкретного scope. При `shouldFallbackToHaiku()` — бейдж «budget fallback» в UI.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Next Best Action engine
- `docs/prds/PRD-008.md` FR-38, FR-39
- `src/utils/claude.ts` + `src/utils/claudeBudget.ts` (после Task-01)
- `src/utils/health-engine.ts` — источник risks/findings
- `src/utils/commitmentsExtractor.ts` (Epic-011 #02) — overdue commitments
- `src/components/v4/hub/PortfolioNextActions.tsx` (Epic-010) — consumer portfolio NBA

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `computeProjectNBA` для тестового repo возвращает массив из 3 с заполненными полями
- [ ] `computePortfolioNBA` возвращает top-5 с проектами из разных repos
- [ ] Week-cache работает: повторный вызов в той же неделе не вызывает Claude API
- [ ] Regenerate инвалидирует cache и делает реальный API call
- [ ] При hard-stop budget — возвращает stale cache + warning (не падает)
