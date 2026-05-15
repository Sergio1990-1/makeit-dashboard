# Task-03: DORA-метрики (calculator + cards + doc)

## Метаданные
- Epic: epic-012
- GitHub Issue: #361
- Приоритет: P2-high
- Зависит от: —
- Параллельно: да
- Размер: L

## Описание
4 DORA-метрики для per-project Delivery tab: Deploy Frequency, Lead Time for Changes, MTTR, Change Failure Rate. Бенчмарк elite/high/medium/low — стандартный DORA per metric.

1. `src/utils/doraCalculator.ts` — `computeDora(repo, windowDays=30) → {deployFreq, leadTime, mttr, cfr}`:
   - **Deploy Frequency**: count(commits на `main` с conventional prefix `feat:` / `fix:` / `release:`) / windowDays.
   - **Lead Time**: median(`PR.merged_at` − `PR.created_at`) для merged PRs в окне.
   - **MTTR**: median downtime BetterStack monitor, сопоставленного с repo через matching rules в `config.ts`. n/a если monitor не найден.
   - **CFR**: % deploys, за которыми в течение 7 дней последовал commit с `fix:` ИЛИ audit с critical finding.
2. `src/components/v4/hub/DoraCards.tsx` — 4 KPI карточки в grid с цветом по DORA-benchmark (elite=зелёный, high=светло-зелёный, medium=жёлтый, low=красный). Tooltip — конвенции из DELIVERY.md.
3. `docs/DELIVERY.md` — новый файл: документирует упрощения (deploys = merges на main с конвенциями, CFR — 7-дневное окно с fix-коммитами + critical audit findings), benchmark thresholds, ограничения live-окна без архивов pipeline.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция DORA calculator
- `docs/prds/PRD-008.md` FR-33
- `src/utils/github.ts` — GraphQL queries по commits и PRs
- `src/utils/betterstack.ts` — downtime API
- `src/utils/config.ts` — repo ↔ monitor matching rules
- DORA report 2024 — benchmark thresholds

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `computeDora` для тестового repo возвращает 4 числа + per-metric tier
- [ ] При отсутствии monitor — MTTR = «n/a», card показывает прочерк (не 0)
- [ ] DoraCards подсвечиваются по DORA-tier (elite/high/medium/low) — визуально проверяемо
- [ ] `docs/DELIVERY.md` описывает все 4 формулы, conventions, benchmark пороги
- [ ] CFR корректно учитывает critical audit findings в 7-дневном окне после deploy
