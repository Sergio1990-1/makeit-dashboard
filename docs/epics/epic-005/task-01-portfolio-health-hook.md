# Task-01: usePortfolioHealth hook + multi-repo runner

## Метаданные
- Epic: epic-005
- GitHub Issue: #141
- Приоритет: P2-high
- Зависит от: —
- Параллельно: нет (блокирует остальные)
- Размер: M (~120 строк)

## Описание
Создать `src/hooks/usePortfolioHealth.ts`. Хук:
1. Загружает `ChecklistDocument` через `loadChecklist(token)`.
2. Из `doc.project_classification` получает список 12 repo.
3. Запускает `runHealthCheck` для каждого с **concurrency=3** (использует `Semaphore` из Epic-008 task-05; до его мержа — простой counter в замыкании).
4. Кэширует результат в `localStorage` ключ `makeit_portfolio_health_v1`. TTL — 30 минут. Структура: `{ generated_at: ISO, reports: HealthReport[] }`.
5. Возвращает `{ reports, loading, error, lastUpdated, refresh }`.

При первом mount — задержка 1500мс, потом старт скана (если кэш протух или его нет). При live-кэше — мгновенный возврат.

`refresh()` — принудительный rescan, инвалидирует кэш.

## Контекст для Claude Code
Прочитай:
- `src/hooks/useProjectHealth.ts` — паттерн single-repo хука
- `src/utils/health-engine.ts` — `runHealthCheck`, `loadChecklist` уже есть
- CLAUDE.md

## Критерии выполнения
- [ ] Type-check + ESLint + build чистые
- [ ] Скан 12 проектов завершается ≤ 90 секунд (на 3 одновременных)
- [ ] localStorage кэш переживает refresh страницы
- [ ] При отсутствии токена — `error: "Нужен GitHub-токен"`, `reports: []`
- [ ] При rate-limit fail на одном из repo — остальные продолжают, частичный результат сохраняется в `reports`
