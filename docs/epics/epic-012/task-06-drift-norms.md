# Task-06: Drift norms (per-project конфиг + defaults)

## Метаданные
- Epic: epic-012
- GitHub Issue: #364
- Приоритет: P2-high
- Зависит от: —
- Параллельно: да
- Размер: M

## Описание
Per-project конфиг норм для Drift Detection: `docs/project_norm.yaml` в самом репо проекта. При отсутствии — дефолт по tier из makeit-knowledge.

1. `src/utils/driftNorm.ts` — `loadProjectNorm(repo, tier) → ProjectNorm`. Schema: `{commit_cadence_days, deploy_freq_days, audit_freq_days, client_touch_interval_days}`. Сначала пытается читать `docs/project_norm.yaml` из repo через github-contents API; при отсутствии — fallback на дефолт из `Skills/PROJECT_NORMS_DEFAULTS.yaml` (makeit-knowledge) по tier проекта. Cache в localStorage `makeit_drift_norm:{repo}` с TTL 24ч.
2. PR в makeit-knowledge: `Skills/PROJECT_NORMS_DEFAULTS.yaml` — структура per tier (`tier-1`, `tier-2`, `tier-3`) с 4 полями каждой. Tier-1 = строгие нормы, tier-3 = lenient.
3. Bootstrap template: `Skills/templates/hub/project_norm.yaml` в makeit-knowledge — образец per-project файла с комментариями для копирования в новые репо.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция project_norm.yaml
- `docs/prds/PRD-008.md` FR-40
- `src/utils/github-contents.ts` — чтение файлов из repo
- `src/utils/config.ts` — tier поля проектов
- makeit-knowledge репо — структура `Skills/`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `loadProjectNorm` возвращает per-project значения если файл существует
- [ ] При отсутствии файла — fallback на tier-default из knowledge репо
- [ ] Cache в localStorage с TTL 24ч (новый запрос после истечения)
- [ ] PR в makeit-knowledge: `PROJECT_NORMS_DEFAULTS.yaml` + bootstrap template созданы
- [ ] CustomerHealthScore и DriftDots (Epic-010) подхватывают per-project нормы (smoke test)
