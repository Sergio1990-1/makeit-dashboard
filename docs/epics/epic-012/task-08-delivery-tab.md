# Task-08: Delivery tab — сборка layout

## Метаданные
- Epic: epic-012
- GitHub Issue: #366
- Приоритет: P2-high
- Зависит от: Task-02, Task-03, Task-04, Task-07
- Параллельно: нет
- Размер: M

## Описание
Сборка вкладки Delivery в Project Hub: DoraCards + DigestViewer + CustomerHealthGauge + OnboardingChecklist в responsive layout.

1. `src/components/v4/hub/tabs/DeliveryTab.tsx` — заменяет stub из Epic-009. Layout (desktop ≥1280px): row-1 = DoraCards (full-width, 4 columns), row-2 = `CustomerHealthGauge` (left, 1fr) + `OnboardingChecklist` (right, 1fr), row-3 = `DigestViewer` (full-width). На mobile (<768px) — single column stack.
2. Props принимает из `useProjectHub` — `dora`, `digest`, `customerHealth`, `onboarding` (после Task-09 будут реальные данные; пока — заглушки совместимые с API).
3. Empty states: per-section если данных нет (например, `dora = null` → «Недостаточно merges на main за окно»).
4. Section в `src/styles/v4.css` — `.delivery-tab`, `.delivery-row`, breakpoints.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Frontend изменения
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §4.3 Delivery tab
- `src/components/v4/hub/tabs/` — другие tabs как образец layout-структуры
- `src/styles/v4.css` — текущие hub-стили
- Компоненты из задач #02, #03, #04, #07

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] DeliveryTab рендерит все 4 секции в правильном порядке
- [ ] Responsive: на mobile (<768px) — single column, desktop (≥1280px) — 2-column для row-2
- [ ] Empty state корректный для каждой секции при отсутствии данных
- [ ] CSS секция `.delivery-tab` добавлена в `v4.css`, без regression других tabs
