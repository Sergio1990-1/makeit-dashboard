# Task-01: Типы Hub + skeleton useProjectHub

## Метаданные
- Epic: epic-009
- GitHub Issue: #338
- Приоритет: P2-high
- Зависит от: —
- Параллельно: да
- Размер: M

## Описание
Подготовить фундамент типов и агрегирующий хук для Project Hub. Реальные источники для Decisions/Risks/Commitments/Renewals/Pulse/Digest/DORA/CustomerHealth/Onboarding/NBA заполняются в Epic-011/012 — сейчас все новые поля возвращают stub-значения (`null` / `[]` / `0`).

1. Создать `src/types/hub.ts`:
   - `HubTab = "overview" | "health" | "activity" | "decisions" | "delivery"`
   - Stub-типы: `Decision`, `Risk`, `Commitment`, `Renewal`, `PulseEvent`, `DigestEntry`, `DoraMetrics`, `CustomerHealthScore`, `OnboardingReport`, `NextBestAction` (минимальные поля из PROJECT_HUB_DESIGN_BRIEF.md §5)
   - `ProjectHubData` — полный shape из дизайн-брифа (project, health, новые stub-поля, loading/loadingTab/error/refresh/generateDigest/regenerateNBA)
2. Создать `src/hooks/useProjectHub.ts`:
   - Принимает `repo: string`
   - Внутри вызывает `useProjectHealth(repo)` — переиспользует loading/error/refresh
   - Возвращает `ProjectHubData` со stub-значениями для всех новых полей
   - `loadingTab` инициализируется как `{ overview: false, health: loading, activity: false, decisions: false, delivery: false }`
   - `generateDigest`/`regenerateNBA` — пустые async-функции с `// TODO: Epic-012` (resolved сразу)

## Контекст для Claude Code
Прочитай:
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §5 — shape `ProjectHubData`
- `docs/prds/PRD-008.md` FR-42 — правила композиции
- `src/hooks/useProjectHealth.ts` — публичное API
- `src/types/health.ts` — соседний файл типов для стиля

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `HubTab` экспортируется как union из 5 строк
- [ ] `useProjectHub("Beer_bot")` в dev-консоли возвращает объект с полями `decisions: []`, `nba: []`, `digest: null`
- [ ] Хук не дёргает никакие новые API/endpoints — только композиция useProjectHealth
- [ ] Все новые типы в `src/types/hub.ts` имеют JSDoc-комментарий «filled in Epic-011/012»
