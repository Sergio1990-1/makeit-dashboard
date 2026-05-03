# Task-02: Rewrite AIInsightsPanel — реальные триггеры

## Метаданные
- Epic: epic-005
- GitHub Issue: #142
- Приоритет: P2-high
- Зависит от: task-01
- Параллельно: нет
- Размер: M (~150 строк)

## Описание
Полностью переписать `src/components/v4/AIInsightsPanel.tsx`.

Новый prop API:
```ts
interface Props {
  reports: HealthReport[];        // от usePortfolioHealth
  loading: boolean;
  lastUpdated: Date | null;
  onOpenHealth: (repo: string) => void;  // переключает вкладку Проекты + selectedRepo
}
```

Логика:
1. Из всех `reports` собрать findings со status `fail`.
2. Сортировка: по `severity_weight × age_factor`, где `age_factor = 1 + min(7, days_since_first_seen)/7`. Для MVP `days_since_first_seen` = `(now - report.generated_at) / 86400000`, реальный «когда впервые увидели» — TODO follow-up.
3. Топ-5 — отдельные карточки. На каждой:
   - severity badge (critical/high/medium)
   - repo (моноширинно)
   - title (rule.title)
   - 1-line detail (truncate если > 90 chars)
   - кнопка «Открыть Health» → `onOpenHealth(repo)`
   - placeholder кнопка «→ issue» с tooltip «доступно после Epic-006»
4. При loading=true и пустых reports — skeleton. При loading=true и есть кэш — показываем кэш + indicator «обновляется».
5. Фильтр по умолчанию: показываем `severity ≥ medium` (low не загромождает дашборд).
6. Header: «AI-инсайты по портфелю», meta — `обновлено N мин назад`.

## Контекст для Claude Code
Прочитай:
- `src/components/v4/AIInsightsPanel.tsx` (текущая реализация — взгляни на стиль)
- `src/components/v4/health/FindingsBoard.tsx` — стиль карточек findings (можно переиспользовать классы)
- task-01 (хук usePortfolioHealth)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] При reports=[] (loading) — skeleton без ошибок
- [ ] Клик «Открыть Health» вызывает `onOpenHealth(repo)`. В DashboardView этот callback должен переключать вкладку на Projects + ставить selectedRepo
- [ ] Не больше 5 карточек, severity-сортировка корректна
- [ ] Visual smoke-test на живых данных через preview server: для всех 12 проектов должны появиться ≥ 3 fails общим количеством
