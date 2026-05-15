# Epic-012: Delivery Metrics & Intelligence

## Метаданные
- PRD: PRD-008
- Epic-issue: #371
- Milestone: #13
- Дедлайн: 2026-06-10 (9 задач × 1.5 дня + 3 буфер) — стартует после Epic-009
- Статус: planning
- Приоритет: P2-high
- Внешний блокер: [pipeline#1129](https://github.com/Sergio1990-1/makeit-pipeline/issues/1129) (monthly rollover metrics.jsonl) — для DORA нужен парсер архивных метрик

## Обзор

DORA-метрики, Project Digest, Customer Health Score, Onboarding Readiness Checklist, Next Best Action engine, конфиг норм для Drift Detection. После эпика: вкладка Delivery полностью функциональна; PortfolioNextActions (Epic-010) получает реальные ranked actions; DriftDots на Scorecard (Epic-010) получают per-project нормы.

## Архитектурные решения

- **DORA calculator** — `doraCalculator.ts` собирает 4 метрики:
  - **Deploy Frequency**: commits на `main` за период (с фильтром по conventional commits — `feat:` / `fix:` / `release:`). Optional: tagged releases.
  - **Lead Time for Changes**: медиана от первого коммита PR (= PR.created_at для squash-merge) до merge.
  - **MTTR**: медиана downtime по BetterStack monitor этого проекта. Сопоставление repo ↔ monitor — через existing matching rules в `config.ts`.
  - **Change Failure Rate**: % деплоев (= merges на main), за которыми в течение 7 дней последовал commit с `fix:` или audit с critical finding.
  - Бенчмарк (elite/high/medium/low) — стандартный DORA per metric.
- **Project Digest** — `weeklyDigestGenerator.ts`. Claude Sonnet (fallback Haiku при budget). Input: pulse за неделю + closed issues + merged PRs + commitments delivered + audit findings. Output: markdown секции `## Shipped / ## In progress / ## Blocked / ## Decisions / ## Clients touched / ## Spend`. Сохраняется в `digests/{repo}/{YYYY-WW}.md` в самом dashboard repo через GitHub Contents API (per-project дайджесты + кросс-портфельный `digests/{YYYY-WW}-portfolio.md`).
- **Customer Health Score** — `customerHealthScore.ts`. Формула:
  ```
  score = sentiment×0.3 + cadence×0.3 + delivery×0.3 + paid×0.1
  ```
  - `sentiment` (0-100): Claude Haiku над последними 3 транскриптами проекта → ratings positive/neutral/negative с весом
  - `cadence` (0-100): актуальный интервал между встречами vs baseline (из `project_norm.yaml` `client_touch_interval_days`). 100 если ≤ baseline, линейный спад до 0 при 3× baseline
  - `delivery` (0-100): % commitments delivered on-time за 90 дней. Считает status=done within due-date
  - `paid` (0-100): 100 если paid вовремя; 0 если задолженность > 30 дней; линейный спад
  - При отсутствии транскриптов > 120 дней — score = «n/a» (не показываем)
  - Sparkline 90 дней — пересчёт раз в неделю (триггер из manual button или регенерации NBA)
- **Onboarding Readiness** — расширение `health-engine.ts` Layer 2. 6 новых правил:
  - `onboarding.readme_fresh` — last commit on README.md за 90 дней
  - `onboarding.brief_exists` — `docs/BRIEF.md` существует
  - `onboarding.deploy_doc` — `docs/DEPLOY.md` или раздел `## Deploy` в README
  - `onboarding.env_example` — `.env.example` существует
  - `onboarding.ci_green` — последний CI run на main = success
  - `onboarding.audit_fresh` — audit запускался за последние 30 дней
- **Next Best Action engine** — `nextBestActionEngine.ts`. Per-project: Claude Sonnet over (top-3 findings + top-3 risks + top-3 overdue commitments + drift indicators + inbox top-5) → ranked top-3 recommendations с обоснованием. Aggregation per portfolio = берёт top-1 от каждого проекта, сортирует по severity, возвращает top-5.
- **project_norm.yaml** — per-project в самом репо `docs/project_norm.yaml`. Schema: `{commit_cadence_days, deploy_freq_days, audit_freq_days, client_touch_interval_days}`. Дефолты в `makeit-knowledge/Skills/PROJECT_NORMS_DEFAULTS.yaml` (per tier). При отсутствии per-project файла — дефолт по tier.
- **Budget cap** — `claudeBudget.ts`. Hard cap $30/mo на весь portfolio. Tracking: каждый Claude call логируется в `localStorage` с tokens + estimated cost. При 80% — UI warning. При 110% — fallback на Haiku для всех call'ов до конца месяца.

## Изменения в БД

N/A.

## API изменения

- `src/utils/doraCalculator.ts` (новый)
- `src/utils/weeklyDigestGenerator.ts` (новый)
- `src/utils/customerHealthScore.ts` (новый)
- `src/utils/onboardingReadinessRules.ts` (новый — встраивается в health-engine Layer 2 как 6 правил)
- `src/utils/nextBestActionEngine.ts` (новый)
- `src/utils/claudeBudget.ts` (новый — global cost tracking + cap enforcement)
- `src/utils/driftNorm.ts` (новый — чтение per-project + default норм)
- `src/utils/health-engine.ts` — добавить 6 onboarding правил в Layer 2 (через `onboardingReadinessRules.ts`)
- `Skills/PROJECT_NORMS_DEFAULTS.yaml` в makeit-knowledge — дефолты норм per tier (PR в knowledge репо)

## Frontend изменения

- `src/components/v4/hub/tabs/DeliveryTab.tsx` — реальная реализация (DORA + Digest + Customer Health + Onboarding)
- `src/components/v4/hub/DoraCards.tsx` — 4 KPI с DORA-benchmark цветом
- `src/components/v4/hub/DigestViewer.tsx` — markdown viewer + history dropdown + regenerate button
- `src/components/v4/hub/CustomerHealthGauge.tsx` — gauge 0-100 + sparkline 90d
- `src/components/v4/hub/OnboardingChecklist.tsx` — 6 правил с ✓/✗ + remediation
- `src/components/v4/SettingsBudgetPanel.tsx` — новая секция в Settings: текущий spend / cap / breakdown по типам call'ов
- `src/hooks/useProjectHub.ts` — расширяется реальными `dora`, `digest`, `customerHealth`, `onboarding`, `nba`
- `src/styles/v4.css` — `Delivery Tab`, `Dora Cards`, `Gauge` секции

## Влияние на существующий код

- `health-engine.ts` — добавляются 6 правил, общее количество правил растёт с 50 до 56. По проектам с unfilled docs scores сдвинется (вниз). Документировать в release note.
- Claude API spend — рост до $30/mo. Budget cap + fallback на Haiku при превышении.
- BetterStack matching rules (`config.ts`) — используется для MTTR. Нужна явная связь repo ↔ monitor по name patterns. Уже частично есть в matching rules, может потребоваться доуточнение.
- Pipeline metrics.jsonl — нужен формат с tags для DORA-attribution per repo. Требует [pipeline#1129](https://github.com/Sergio1990-1/makeit-pipeline/issues/1129) для rollover; без него за 30 дней архив не доступен. Альтернатива на v1: считать DORA только за live-окно.

## Целостность бизнес-логики

- **DORA — конвенция**: Deploy Frequency считаем как «merges на main» (упрощение для микро-команды без формальных релизов). CFR — fix-коммиты + audit critical findings в 7-дневном окне после deploy. Документировать в DELIVERY.md (новый файл).
- **Customer Health «n/a»** — при отсутствии транскриптов > 120 дней не показывать число (избежать ложной уверенности).
- **Budget cap soft-overflow** — при превышении 110% переключение на Haiku, не отказ от запроса. Hard-stop только при > 200% (защита от runaway loop).

## Задачи

| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `claudeBudget.ts` (cost tracking + cap enforcement) + `SettingsBudgetPanel` UI | — | да (с #02..#06) | M |
| 02 | `weeklyDigestGenerator.ts` + `DigestViewer` + cache + regenerate button | 01 | да | L |
| 03 | `doraCalculator.ts` + `DoraCards` (4 metrics + benchmark colors) + DELIVERY.md doc | — | да | L |
| 04 | `onboardingReadinessRules.ts` + 6 правил в health-engine + `OnboardingChecklist` component | — | да | M |
| 05 | `nextBestActionEngine.ts` (per-project + portfolio aggregation) + cache | 01 | да | L |
| 06 | `driftNorm.ts` + `Skills/PROJECT_NORMS_DEFAULTS.yaml` PR в makeit-knowledge + bootstrap `docs/project_norm.yaml` templates | — | да | M |
| 07 | `customerHealthScore.ts` (sentiment via Haiku + cadence + delivery + paid) + `CustomerHealthGauge` | 01, Epic-011 #02 | да (с #08) | L |
| 08 | `DeliveryTab` сборка: DORA + Digest + Customer Health + Onboarding в layout | 02, 03, 04, 07 | — | M |
| 09 | `useProjectHub` integration: реальные dora/digest/customerHealth/onboarding/nba поля | 02, 03, 04, 05, 07 | — | S |
