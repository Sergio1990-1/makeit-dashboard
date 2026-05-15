# Task-01: ProjectScorecard + DriftDots

## Метаданные
- Epic: epic-010
- GitHub Issue: #343
- Приоритет: P2-high
- Зависит от: Epic-009 #03 (Hub routing), Epic-012 #06 (useDriftNorm)
- Параллельно: нет (база для #06)
- Размер: M

## Описание
Превью-карточка проекта для Portfolio Surface. Расширение `ProjectCardV4`, но не замена в его текущем месте — это новый компонент в `portfolio/`. Старая карточка после Epic-010 #06 удаляется.

Состав Scorecard (FR-2):
1. **Header** — имя репо (моноширинно), tier-pill, phase-badge, client-name мелким, health-grade A/B/C/D/F справа крупно + цветной dot.
2. **KPI row** — open / in-progress / blocked / overdue-commitments (число + иконка).
3. **DriftDots** — 4 цветных дота: commit / deploy / audit / client-touch.
4. **Footer** — last activity (relative), cost MTD (если есть).

Клик по карточке вызывает `onSelectRepo(repo)` → Epic-009 routing уведёт в Hub Overview.

`DriftDots` — отдельный компонент. Берёт `daysSinceX` и `normY` из `useProjectHealth` + `useDriftNorm(repo)`. Цвет: green (`days ≤ norm`), yellow (`days ≥ 1.5 × norm`), red (`days ≥ 3 × norm`). Tooltip: «commit: 4д назад, норма 2д».

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — архитектурные решения
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` §3.2 — состав Scorecard
- `docs/prds/PRD-008.md` FR-2, FR-3, FR-4
- `src/components/v4/ProjectCardV4.tsx` — существующая карточка как референс
- `src/hooks/useProjectHealth.ts` — данные drift / KPI
- `src/types/health.ts` — типы grade / phase / tier

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Открыл Portfolio → виден grid Scorecard'ов, все поля FR-2 на месте
- [ ] DriftDots: 4 дота с правильным цветом, hover показывает tooltip с числами и нормой
- [ ] Клик по Scorecard вызывает `onSelectRepo(repo)` (handler из Epic-009 проверяется визуально — переход в Hub)
- [ ] Карточка адаптивна: на 1-col layout не ломается, текст не обрезается
- [ ] Темная тема: цвета grade / drift dot читаемы
