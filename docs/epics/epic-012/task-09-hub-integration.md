# Task-09: useProjectHub integration (реальные данные)

## Метаданные
- Epic: epic-012
- GitHub Issue: #367
- Приоритет: P2-high
- Зависит от: Task-02, Task-03, Task-04, Task-05, Task-07
- Параллельно: нет
- Размер: S

## Описание
Заменить Epic-009 stubs реальными источниками в `useProjectHub`. Поля `dora`, `digest`, `customerHealth`, `onboarding`, `nba` теперь приходят из соответствующих утилит. OverviewTab подхватывает реальный NBA mini-block.

1. `src/hooks/useProjectHub.ts` — для каждого поля вызывать соответствующую утилиту:
   - `dora` → `doraCalculator.computeDora(repo)`
   - `digest` → последний weekly digest для repo (через `weeklyDigestGenerator.loadDigest` или кэш)
   - `customerHealth` → `customerHealthScore.computeHealth(repo)`
   - `onboarding` → результаты 6 rules из `onboardingReadinessRules`
   - `nba` → `nextBestActionEngine.computeProjectNBA(repo)`
2. Loading-state per section (не блокировать весь Hub при одной долгой выборке). Errors per section — graceful (показываем error placeholder, остальные tabs работают).
3. `src/components/v4/hub/tabs/OverviewTab.tsx` — NBA mini-block (top-3) теперь использует реальный `nba` из hub state вместо stub-массива.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Frontend изменения
- `src/hooks/useProjectHub.ts` — текущие stubs Epic-009
- `src/types/hub.ts` — типы полей
- Утилиты из задач #02, #03, #04, #05, #07
- `src/components/v4/hub/tabs/OverviewTab.tsx` — NBA mini-block

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `useProjectHub` возвращает реальные `dora`, `digest`, `customerHealth`, `onboarding`, `nba`
- [ ] Loading-state per section: одна медленная секция не блокирует другие
- [ ] Error в одной секции не валит весь Hub (graceful placeholder)
- [ ] OverviewTab NBA mini-block показывает реальные top-3 actions из engine
- [ ] PortfolioNextActions (Epic-010) подхватывает реальный portfolio NBA (smoke test)
