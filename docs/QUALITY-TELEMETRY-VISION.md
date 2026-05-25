# Quality Telemetry — Vision

**Date:** 2026-05-25
**Status:** Discussion brief (для согласования с Codex)
**Author:** sergey + Claude
**Scope:** видение системы наблюдения за качеством разработки в MakeIT — три потока сигналов, как их собирать и где визуализировать.

---

## 1. Контекст

Затравкой стала задача: "сделать график чистоты кода Codex по каждому проекту". В процессе brainstorm'а вскрылось, что это лишь **один из трёх** взаимосвязанных сигналов качества разработки, которые сейчас разбросаны по разным местам:

| Сигнал | Что измеряет | Где сейчас данные | Покрытие |
|---|---|---|---|
| **A. Codex review density** | % PR с критическими дефектами, замеченными `chatgpt-codex-connector[bot]` | GitHub PR review comments | 100% PR с ботом |
| **B. CI failure rate** | % пушей в main / % PR где CI упал ≥1 раз | GitHub Actions API | 100% репо с CI |
| **C. Agent dev errors** | retries/escapes/false-starts в работе AI-агента | `~/.claude/projects/*/transcripts/*.jsonl` (manual) + pipeline `metrics.jsonl` (auto) | Pipeline — да, ручные — **нет** |

**Pipeline уже умеет (C) только для автоматических прогонов:**
- `metrics_logger.py` пишет per-issue структурный лог в `metrics.jsonl` (25 полей)
- `quality_signals.py` категоризирует review findings
- `quality_metrics.py` считает first_pass_rate, retry_rate, cost_per_task, qa_pass_rate
- `retro_agent.py` делает weekly retro через Claude API (LaunchAgent, воскресенья 20:00)
- `auto_tuning.py` Tier 1-3 stage self-improvement с replay regression gate

**Слепое пятно:** ручная работа с агентами (CLI-сессии `/makeit-dev`, аудиты, code-review, ad-hoc) **никак не проходит** через эту систему. Lessons не извлекаются, prompt-tuning не получает обратной связи, retro не учитывает половину работы.

## 2. Целевая картина

Дашборд = **визуализатор сигналов**, не их источник. Все три потока сигналов агрегируются на Pipeline Mac (cron'ами или в реальном времени), складываются в JSON-файлы, дашборд их читает и показывает.

```
┌──────────────────────────────────────────────────────────────┐
│  Pipeline Mac (sergeymakarov) — Hub агрегации                │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐ │
│  │ A. Codex sweep │  │ B. CI sweep    │  │ C. Agent collect│ │
│  │ daily 03:00    │  │ daily 03:00    │  │ continuous      │ │
│  │ → quality.json │  │ → quality.json │  │ → metrics.jsonl │ │
│  └────────────────┘  └────────────────┘  └─────────────────┘ │
│                              │                                │
│                              ▼                                │
│              ┌───────────────────────────┐                    │
│              │ retro_agent.py + autotune │                    │
│              │ (учитывает все 3 потока)  │                    │
│              └───────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
                              │ rsync
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ VPS — статика для дашборда                                   │
│   /data/codex-quality.json    (A + B вместе)                 │
│   /data/pipeline-kpi.json     (C, агрегаты)                  │
└──────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Dashboard (Browser SPA)                                       │
│   Вкладка "Качество" — A + B (Codex P1/P2 + CI fail %)       │
│   Вкладка "Pipeline KPI" — расширить существующую под C      │
└──────────────────────────────────────────────────────────────┘
```

## 3. Поток A — Codex review density (готов spec)

**Метрика:** `% грязных PR` = `(PR с ≥1 P0/P1/P2 находкой) / (все merged PR в бакете)`. Worst-wins: P0 (BLOCKER) > P1 > P2-only. P0 редкий, но критичный — отдельная pulse-плашка в KPI, в баре объединён с P1 в красный crit-сегмент.

**Архитектура:**
- Cron на Pipeline Mac в 03:00 Бали (= 19:00 UTC) через launchd.
- Python-скрипт делает 12 × (2 REST-вызова): `/pulls?state=closed` + `/pulls/comments?since=Y`.
- Парсит severity из regex `![P(\d) Badge]` (Codex использует только P1/P2).
- Бакетизирует по `merged_at` (UTC): 30 дневных + 12 недельных бакетов.
- Worst-wins: PR с обоими P1+P2 → в P1-сегмент (чтобы сумма частей = % грязных без двойного счёта).
- Атомарная запись JSON + rsync на VPS.

**UI:** новая 9-я вкладка "Качество". Сводный bar-chart + 12 карточек проектов с мини-чартами. Переключатель режима 30d/12w. Healthcheck-баннер если `generated_at` > 30 ч.

**Логика чарта:** высота бара = `total_pr` в бакете (объём работы), стек снизу вверх: P1 (красный) → P2-only (жёлтый) → clean (голубой). Сразу видно объём + долю проблем.

**Цвета:** `--v4-p1` (#EF4444 красный) для P1, `--v4-p2` (#F79009 жёлтый) для P2, `--v4-clean-soft` (#93C5FD голубой) для чистых.

**Спец:** [`docs/superpowers/specs/2026-05-25-codex-quality-tab-design.md`](superpowers/specs/2026-05-25-codex-quality-tab-design.md)

**Прототип:** [`quality-tab-prototype.html`](../quality-tab-prototype.html) (см. в браузере: `localhost:4173/makeit-dashboard/quality-tab-prototype.html`)

## 4. Поток B — CI failure rate (предложение расширить spec A)

**Зачем:** Codex ловит дефекты на ревью, CI ловит дефекты на runtime. Это **разные** failure-модели — нужно видеть обе.

**Метрика:** `% красных PR` = `(PR где ≥1 CI run завершился failure/cancelled) / (все merged PR в бакете)`. Можно дополнительно: `% красных пушей в main` (для post-merge поломок).

**Архитектура:**
- Та же. Sweep-скрипт на Pipeline Mac в 03:00 Бали расширяется: добавляется запрос `GET /repos/{r}/actions/runs?branch=main&status=completed&created=>=Y` (filter по `conclusion: failure|cancelled`).
- Те же бакеты, тот же JSON-формат (поле `with_ci_fail` рядом с `with_p1`/`with_p2_only`).
- UI-паттерн открытый вопрос: либо четвёртый цвет в том же баре (но три+four цветов в одном баре уже трудно читать), либо **отдельный mini-чарт** в той же карточке проекта (CI fail rate отдельной полосой). Я склоняюсь ко второму — каждая метрика на своём чарте, общая ось времени.

**Затраты:** +1 час к sweep-скрипту, +1 цвет/легенда на чарт. Никакой новой инфры.

**Рекомендация:** добавить B в спец A до начала имплементации. Одна вкладка "Качество" = (Codex review density) + (CI failure rate). Логично, что лежит рядом — обе метрики про "что плохого случилось с кодом".

**Open question:** включать ли `% красных пушей в main` отдельной метрикой (post-merge поломки) или только pre-merge CI на PR? Я склоняюсь к **только pre-merge** для v1 — для post-merge у нас уже есть `ci_monitor_runner.py` с auto-revert, отдельная история.

## 5. Поток C — Manual agent telemetry (отдельный большой spec)

**Это самая ценная часть, но самая объёмная.** Не делать в одном спеке с A+B.

### 5.1 Что есть сейчас (pipeline batch-runs)

Когда работает `phase_executor.py` в auto-режиме, всё логируется:
- `metrics.jsonl` — 25 полей per issue (phase, duration, retries, cost, verdict, ...)
- `timeline_logger.py` — per-issue timeline
- `quality_signals.py` — категоризация review findings
- `retro_agent.py` — weekly retro

Это работает. Tier 1-3 auto-tuning двигает prompts на основе этих данных.

### 5.2 Чего нет (manual sessions)

Когда я (или ты) запускает Claude Code вручную (`claude` в терминале, `/makeit-dev` skill, `/makeit-codereview`, аудиты, ad-hoc вопросы):
- Claude Code пишет transcript в `~/.claude/projects/<project-slug>/transcripts/<session-id>.jsonl` (это **факт** на основе Claude Code session-management).
- Содержимое: каждый user/assistant message, tool calls, tool results, errors, hook outputs.
- НИКТО эту телеметрию не агрегирует. Lessons теряются. Retro их не видит.

### 5.3 Что нужно сделать

**Backend (в pipeline-репо, не в dashboard):**
- Новый модуль `manual_session_ingester.py`:
  - Сканирует `~/.claude/projects/*/transcripts/*.jsonl` (ежечасно cron'ом)
  - Парсит каждую сессию: tool calls, errors, retries-патерны (повторные Edit на тот же файл = коррекция), abandoned tasks (user interrupt), explicit corrections ("нет, не так", "stop", "это не работает")
  - Категоризирует через keyword/LLM: успех / частичный успех / провал / прерывание
  - Извлекает session_metadata: какой skill использовался (`/makeit-dev`, `/makeit-codereview`...), какой репо, длительность, стоимость токенов (из transcript headers)
  - Пишет в общий `metrics.jsonl` (расширенная схема: `source: "manual" | "pipeline"`) или в отдельный `manual_metrics.jsonl` (проще — не ломает существующий формат)
- Расширить `retro_agent.py` чтобы он видел оба источника.
- Расширить `quality_metrics.py` чтобы first_pass_rate / retry_rate считались по обоим.
- AutoTuner (Tier 1-3) автоматически получает больше сигнала.

**Frontend (в dashboard):**
- Расширить (или создать) вкладку "Pipeline KPI" — показывать суммарные метрики из manual + pipeline:
  - First-pass rate (manual vs pipeline)
  - Retry rate
  - Cost per task (с делением)
  - Top 5 skill-сессий с наибольшим retry rate (где prompt-tuning имеет максимум ценности)
  - Top 5 "проваленных тем" по retro

### 5.4 Сложности

- **Privacy:** transcripts содержат всё что мы обсуждаем. Парсер должен жить **локально** на Pipeline Mac, не отправлять raw в облако. Только агрегаты в JSON.
- **Категоризация:** "успех" vs "провал" нетривиально определить из transcript'а. Эвристики (длительность, # retries, наличие explicit "спасибо/готово" в конце) + LLM-классификация для нерешённых случаев.
- **Объём:** transcripts могут быть огромными (мегабайты). Sweep должен быть инкрементальным (по mtime).
- **Schema migration:** существующий `metrics.jsonl` уже мигрировал 10→25 полей (`metrics_migrator.py`). Добавление source-поля — ещё одна миграция.
- **Связь с GitHub Issue:** для pipeline-runs всегда есть `issue_number`. Для ручных сессий — иногда (если skill упомянул #N), иногда нет. Нужно либо требовать `#N` в первом сообщении, либо мириться с "сессии без привязки к issue".

### 5.5 Estimated work

- Backend (ingester + retro extension): ~12-16 часов
- Frontend (KPI вкладка): ~6-8 часов
- Privacy + schema migration: ~4 часа
- **Итого: 22-28 часов**. Отдельный эпик.

## 6. Annotations (event markers на чарте)

**Зачем:** без аннотаций ты увидишь "качество упало неделю назад", но не свяжешь это с причиной — "потому что я обновил `/makeit-dev` и AutoTuner поднял Tier-2 промпт". Аннотации — это **причинно-следственная корреляция** между интервенциями в систему разработки и её результатом.

**Фаза 1 (в скоупе текущего spec'а A) — ручные аннотации:**
- UI: кнопка "+ событие" в Quality-вкладке → модалка дата/категория/описание
- 3 категории: `skill` (синий), `deploy` (зелёный), `manual` (фиолетовый)
- Storage: `/data/annotations.json` рядом с `codex-quality.json` на VPS
- Backend: `POST/DELETE /annotations` на Pipeline FastAPI
- UI: вертикальные пунктирные линии на сводном графике + dot сверху + tooltip

**Фаза 2 (отдельный issue в `makeit-pipeline`-репо) — auto-events из 3 источников:**

| Источник | Что даёт | Реализация |
|---|---|---|
| **`prompt_versioning.py`** | Каждый bump промпта auto-tuner'ом = маркер с категорией `auto-tune`, цвет orange, описание включает diff hash | Sweep-cron читает `~/.makeit-pipeline/prompts/versions.jsonl`, мержит с manual в общий feed |
| **Git log на `~/.claude/skills/*/SKILL.md`** | Каждый коммит в файл скилла = маркер `skill-edit`. Title берётся из commit message, desc — из diff stat | Sweep-cron делает `git -C ~/.claude/skills/<name> log --since=Y --format=...`, парсит |
| **Git log на `lessons-learned.md`** | Каждый коммит → новая lesson, влияющая на retro_agent | Аналогично |

**Слияние:** financial-events-style merge — annotations sorted by date, near-duplicates (same day, same category) auto-grouped в один маркер с расширенным tooltip "5 событий 13.04".

**Связь с pipeline self-improvement loop:**
- AutoTuner ставит маркер ДО изменения промпта
- Через 7 дней `retro_agent` считает delta-метрик "до/после маркера"
- Если delta negative > threshold → **auto-rollback** + новый маркер `rollback`
- В UI ты видишь полный жизненный цикл: маркер изменения → маркер отката, с пояснением

Это превращает Quality-вкладку из "пассивного дашборда" в **петлю обратной связи для самообучения системы**.

## 7. Рекомендуемая последовательность

1. **Сейчас:** доделать спец A (Codex Quality tab + аннотации Фаза 1 + CI fail %). Один спец, один cron, одна вкладка "Качество". **~14-16 часов.**
2. **Дальше (отдельный спец в `makeit-pipeline`-репо):** Фаза 2 аннотаций — auto-events из prompt_versioning, git log skills, git log lessons. **~6-8 часов.**
3. **После того как Фаза 2 готова:** интеграция в `retro_agent` — auto-rollback на основе delta после маркеров. **~12-16 часов, новый эпик.**
4. **Параллельно (отдельный спец):** `manual_session_ingester` — телеметрия ручной работы с агентами (см. п.5 ниже).
5. **Финал:** новая вкладка "Pipeline KPI" в dashboard — визуализирует pipeline-метрики из обоих источников (auto + manual).

**Почему так:**
- A+B дают видимый результат за день — это мотивация и сразу полезно.
- C дольше и рискованнее — лучше делать когда A+B уже работают и есть рабочий паттерн "cron → JSON → dashboard".
- C должно жить в pipeline-репо, чтобы не размывать ответственность (dashboard = view, pipeline = capture+analyse+tune).

## 7. Open questions для Codex

1. **(B) Метрика CI:** `% PR где CI упал ≥1 раз` vs `% PR с финальным CI failure`. Первое чувствительнее (видишь "грязный код, который пришлось чинить"), второе — итог. Что больше говорит о качестве?
2. **(B) Включать ли `% красных пушей в main`** (post-merge поломки) как отдельную метрику в v1, или это уже задача `ci_monitor_runner.py`?
3. **(C) Категоризация manual session:** делать keyword-based (быстро, дёшево, неточно) или сразу LLM-based (медленнее, дороже, точнее)? Может, гибрид — keyword pre-filter, LLM только для unclear cases?
4. **(C) Источник truth для skill-name:** парсить из первого ассистент-сообщения (`Skill('...')` calls), или требовать чтобы пользователь явно указывал в первом prompt'е?
5. **(C) Что делать с сессиями без `#N`:** считать "ad-hoc" отдельным бакетом, или игнорировать вообще? Я склоняюсь к **отдельный бакет** — там тоже могут быть retry-patterns.
6. **(C) Privacy boundary:** если ingester живёт на Pipeline Mac, и Pipeline Mac уже SSH-тоннелится к VPS — есть теоретический риск утечки transcript'а через тоннель. Хотим ли мы добавить локальный allowlist (только агрегаты, raw text никогда не покидает Mac)?
7. **(всё) Где визуализировать:** одна общая вкладка "Качество разработки" с тремя секциями (Codex / CI / Pipeline) vs три отдельные вкладки. Я за **одну** для дашборда — меньше когнитивная нагрузка. Но это требует чтобы все 3 потока имели сопоставимые временные оси.

## 8. Что НЕ обсуждали и сознательно отрезали

- **Тип категоризации Codex** (security/perf/bug) — Codex сам не даёт, парсить из текста дорого, ценность под вопросом.
- **Сравнение между проектами с весом по сложности** — нет надёжного способа нормализовать "проект X хуже потому что код сложнее".
- **Алёрты** в Telegram/Slack — есть `notifier.py` в pipeline, можно подключить позже; не для v1.
- **Историческая глубина >12 недель** — текущий sweep смотрит на 90 дней. Для исторической депти нужна отдельная БД или индексация старых JSON. Не для v1.
