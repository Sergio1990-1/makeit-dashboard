# Вкладка «Качество кода и изменения» — Design

**Date:** 2026-05-25
**Status:** Spec v2 — после Codex code-review, готов к implementation plan
**Owner:** sergey
**Related:** reuses data-collection pattern from `~/.claude/skills/makeit-codexfeedback/SKILL.md`. Prototype: [`quality-tab-prototype.html`](../../../quality-tab-prototype.html). Vision: [`QUALITY-TELEMETRY-VISION.md`](../../QUALITY-TELEMETRY-VISION.md).

**Changelog:**
- **v1** (2026-05-25): первая версия после brainstorming + прототипа.
- **v3** (2026-05-25): добавлена поддержка **P0 severity** (Codex emits P0=red blocker — проверено на реальных PR moliyakg#2282, #2332). Worst-wins: P0 > P1 > P2-only. Bar остаётся 3-color (P0+P1 объединены в красный crit-сегмент). Отдельный P0-alert pulse в KPI справа. Цветовая палитра сдвинута под shields.io semantics: P0=red, P1=orange, P2=yellow.
- **v2** (2026-05-25): адаптированы все 13 findings из Codex code-review:
  1. ❌ Исправлен **критический баг** в data fetch — у `/pulls` нет `since`-параметра (есть только у `/pulls/comments`, и там "updated_at"). Перешли на `sort=updated&direction=desc` с early-exit + клиентский фильтр по `merged_at`.
  2. Atomic remote publish через rsync `.tmp` + ssh `mv`.
  3. Locking через `flock` (предотвращает race cron × force-refresh).
  4. Retry респектит `Retry-After` / `X-RateLimit-Reset` + jitter.
  5. `repo_status` per-repo в JSON, partial failures не занижают summary.
  6. Sanitized error codes в API (не raw stderr).
  7. Repo list — explicit `config/quality_repos.json` (не regex по CLAUDE.md).
  8. JSON schema metadata: `schema_version`, `window_start`, `window_end`, `bucket_tz`.
  9. Annotations: `id` UUID v4 (не index), `scope` (global/repo) уже в v1 schema, `occurred_at` UTC явный.
  10. `codex_coverage_pct` per repo-card (защита от фальшивого "100% clean" при недавнем включении бота).
  11. Low-sample treatment (бейдж "малая выборка" при `total_pr < 8`).
  12. POST/DELETE security: length-limits, max annotations, Pydantic strict types.
  13. Archive immunity явно задокументирована (Project v2 status не влияет на sweep).

---

## Problem

`chatgpt-codex-connector[bot]` оставляет line-level P1/P2 замечания на PR во всех 12 MakeIT-репо. Сейчас эти данные собираются только месячным sweep'ом (`makeit-codexfeedback` skill) для разовых отчётов. Нет постоянной картины «как меняется чистота кода во времени», нет сравнения проектов между собой, нет раннего сигнала о деградации.

## Goal

Добавить в дашборд 9-ю вкладку «Качество», которая показывает:

- **Сводный график:** % "грязных" PR (с ≥1 P1/P2 находкой) по всем 12 репо во времени.
- **Карточку на каждый проект** с мини-графиком той же метрики.
- **Переключатель периода:** 30 дней (по дням) / 12 недель (по неделям).
- **Daily sync** — данные обновляются раз в сутки в 03:00 по Бали (= 19:00 UTC), так что утром пользователь видит свежие "вчерашние" данные мгновенно (без ожидания фетча в браузере).

## Non-goals

- Не строим UI для просмотра конкретных PR/комментов — это делает GitHub UI (по ссылке из метаданных).
- Не классифицируем находки по типу (security/perf/bug) — Codex даёт только severity.
- Не делаем алёрты/нотификации при росте % — только визуализация.
- Не показываем P3 — Codex его не использует.
- Не переписываем `makeit-codexfeedback` skill — он остаётся для ручных месячных отчётов.
- **Feature работает только на VPS-деплое.** GitHub Pages билд показывает баннер "Качество кода доступно на VPS-версии дашборда" — потому что JSON генерируется sweep'ом и хостится на VPS, на GH Pages его не существует.

## Метрика и визуализация

**Что считаем (3-level worst-wins):**
- `total_pr` — все merged PR в бакете
- `with_p0` — PR с ≥1 P0 находкой (БЛОКЕР). Worst-wins абсорбит P1 и P2 одного PR
- `with_p1_only` — PR с ≥1 P1, но **без P0**
- `with_p2_only` — PR с ≥1 P2, но **без P0 и без P1**
- `clean = total_pr - with_p0 - with_p1_only - with_p2_only` — PR без находок (включая нетронутые Codex'ом)

Гарантия: сумма всех четырёх категорий = `total_pr` без двойного счёта.

Бакет = 1 день (режим 30d) или 1 неделя (режим 12w).

**% грязных PR** = `(with_p0 + with_p1_only + with_p2_only) / total_pr × 100` — заголовочное число в KPI-блоке и на карточке проекта.

**Бакетизация по времени (важно):**
- **30d (по дням):** каждый бакет = 1 календарный день в UTC. `merged_at` PR попадает в бакет `[day 00:00 UTC, day+1 00:00 UTC)`. Series длиной 30 баров оканчивается **сегодняшним днём** в UTC.
- **12w (по неделям):** каждый бакет = **ISO-неделя (пн-вс)**. `merged_at` PR попадает в бакет `[Mon 00:00 UTC, next Mon 00:00 UTC)`. Series длиной 12 баров оканчивается **текущей ISO-неделей** (понедельник = `isoMonday(today)` в UTC). Это даёт каноничную "неделю" одинаковую для всех таймзон команды.

Использование локальной timezone было бы соблазнительно (особенно Бали где cron живёт), но проект распределённый — Codex-бот, GitHub Actions и команда работают в разных TZ. UTC даёт единый стабильный референс.

**Как визуализируем (важно!):**
- **Высота бара = `total_pr`** в бакете (абсолютная шкала, ось слева).
- **Y-axis шкалируется per chart**, не глобально! Каждый чарт (сводный + 12 карточек) считает свой `max(total_pr)` в серии и округляет вверх до 5/10/20/50/100/200/... Иначе проекты с мало PR (Uchet_bot, Beer_bot) визуально прижимаются к земле общей шкалой `mankassa-app`/`makeit-pipeline` и теряют динамику.
- **Внутри бара — 3-color стек снизу вверх:** crit (красный, P0+P1 объединены) → P2-only (жёлтый) → clean (голубой).
- **Почему P0+P1 объединены в один сегмент:** 4 цвета в баре читать тяжело (особенно в mini 80px). P0 редкий — за активный репо обычно 0-2 за день. Чтобы P0 не "терялся" под P1 — отдельный **P0-alert pulse в KPI** (см. ниже).
- **Tooltip** разбивает crit-сегмент: `P0: 1 (BLOCKER) · P1: 3 · P2 only: 2`.
- Сразу видно **две вещи одновременно**: объём работы (высота) + долю проблем (цветные доли внизу).
- **Семантическое следствие:** между разными чартами сравнивать **абсолютные высоты нельзя** (разные шкалы), сравнивать можно только **долю красно-жёлтого** в бару.

**PR без ревью Codex** — считаются "чистыми" (входят в clean-сегмент). Знаменатель — все merged PR, включая нетронутые ботом. Бизнес-смысл бара: "сколько PR замержено и какая часть из них имеет дефекты".

**Per-bar P0 visibility (КРИТИЧНО — без hover должно быть очевидно):**

| Где | Что видно ВСЕГДА (без hover) |
|---|---|
| Главный чарт | (a) Колонка с P0 — красный vertical gradient на всю высоту чарта (`rgba(239,68,68, 0.18→0.02)`). (b) Mini-pill `P0:N` сверху над столбцом с pulse-анимацией translateY(0↔-2px) 2s loop |
| Mini-чарт в карточке | Колонка — тот же gradient (но менее заметно из-за 80px). **Бар получает `border-top: 2px solid var(--v4-p0)`** — даёт чёткую красную полоску сверху бара. Топпер не показываем (нет места + border-top уже сигналит) |
| Hover (оба) | Tooltip разбивает P0 отдельно с иконкой 🔴 и acid red колором |

**Почему не просто tooltip:** P0 день встречается редко (1-2/неделя), но это блокер. Юзер должен сразу при беглом сканировании увидеть "ага, 27 апреля что-то взорвалось". Без always-visible-маркера для этого нужно ховерить каждый бар по очереди — плохой UX.

**P0-alert pill (в правой KPI-панели):**
- Видна **только** если `sum(with_p0) > 0` в текущем периоде. Иначе скрыта (не загромождаем счастливые периоды).
- Большая красная плашка с pulse-анимацией (`box-shadow` ring expand 1.8s loop)
- Текст: `🔴 P0: N · БЛОКЕРЫ за {период}`
- На карточке проекта тоже отдельный inline-бейдж `🔴 P0: 2` рядом с P1/P2 в card-foot
- Click (Phase 2 — не для v1) → раскроет список PR с P0 + ссылки на коммент

**Цвета (align с shields.io semantics на самих Codex-бейджах в PR-комментах):**
- P0: `--v4-p0` (#EF4444, **красный** — Codex использует `shields.io/badge/P0-red`)
- P1: `--v4-p1` (#F59E0B, **оранжевый** — Codex использует `shields.io/badge/P1-orange`)
- P2: `--v4-p2` (#EAB308, **жёлтый** — Codex использует `shields.io/badge/P2-yellow`)
- Clean: `--v4-clean-soft` (#93C5FD, светло-голубой)
- Text-colors (для контраста на белом): `--v4-p0-text: #991B1B`, `--v4-p1-text: #B45309`, `--v4-p2-text: #854D0E`
- В баре: `bar-crit` использует `--v4-p0` (combined P0+P1 worst-wins). `bar-p2` использует `--v4-p2`.
- Эта палитра **align с тем что юзер видит в самих PR-комментах** — нет когнитивного диссонанса "в дашборде красное, а в PR оранжевое".

## Architecture

```
┌──────────────────────────────┐          ┌────────────────────────────────┐
│ Pipeline Mac (sergeymakarov) │          │ VPS 89.167.17.79               │
│ ┌──────────────────────────┐ │          │ ┌────────────────────────────┐ │
│ │ launchd                  │ │          │ │ nginx (makeit dashboard)   │ │
│ │ com.makeit.codex-quality-│ │          │ │   /                        │ │
│ │   sweep                  │ │          │ │     → SPA                  │ │
│ │ 03:00 Bali (19:00 UTC)   │ │          │ │   /data/codex-quality.json │ │
│ └────────────┬─────────────┘ │          │ │     → static file          │ │
│              ▼               │   rsync  │ └────────────────────────────┘ │
│ ┌──────────────────────────┐ │  via SSH │              ▲                 │
│ │ sweep.py                 │─┼──────────┼──► /opt/apps/makeit-stack/     │
│ │  • gh api /pulls/comments│ │          │     web/data/codex-quality.json│
│ │    /pulls (REST, 12 repo)│ │          │                                │
│ │  • parse P1/P2 badges    │ │          └────────────────────────────────┘
│ │  • aggregate per day/week│ │                          ▲
│ │  • write JSON atomically │ │                          │  HTTPS GET
│ │  • log to ~/logs/        │ │          ┌───────────────┴─────────────┐
│ └────────────┬─────────────┘ │          │ Browser (dashboard)          │
│              ▼               │          │ ┌──────────────────────────┐ │
│ ┌──────────────────────────┐ │          │ │ <QualityTab>             │ │
│ │ FastAPI /quality/refresh │◄┼──────────┼─┤ useQualityData() hook    │ │
│ │   (force sweep on demand)│ │ tunnel   │ │   → fetch JSON           │ │
│ │ Reuses pipeline FastAPI  │ │ via :8766│ │   → render charts        │ │
│ └──────────────────────────┘ │          │ │   → healthcheck banner   │ │
└──────────────────────────────┘          │ └──────────────────────────┘ │
                                          └──────────────────────────────┘
```

**Поток данных:**
1. В 03:00 Бали launchd запускает `sweep.py` на Pipeline Mac.
2. Скрипт делает 12 × (2 REST-вызова) к GitHub API, агрегирует, пишет `codex-quality.tmp.json`, атомарно переименовывает в `codex-quality.json`.
3. rsync (внутри скрипта, последний шаг) кладёт файл на VPS в `/opt/apps/makeit-stack/web/data/codex-quality.json`.
4. Браузер при открытии вкладки фетчит `/data/codex-quality.json` (мгновенно, статика nginx).
5. Если `generated_at` в JSON > 30 ч назад — UI показывает баннер «данные устарели».
6. Кнопка «Обновить сейчас» → POST к Pipeline API `/quality/refresh` → синхронно запускает sweep → возвращает свежий JSON.

## JSON schema

`/data/codex-quality.json`:

```jsonc
{
  "schema_version": 1,                            // bump при breaking change schema
  "generated_at": "2026-05-25T19:03:14Z",         // UTC ISO8601
  "window_start": "2026-03-02T00:00:00Z",         // ISO-Monday начала 12-нед окна
  "window_end":   "2026-05-25T19:03:14Z",         // = generated_at (текущий момент)
  "bucket_tz":    "UTC",                          // явно: бакеты UTC, не Bali
  "sweep_duration_sec": 142,
  "github_rate_limit_remaining": 4823,
  "repo_status": {                                // per-repo состояние fetch'а
    "Sewing-ERP":      { "status": "ok" },
    "mankassa-app":    { "status": "ok" },
    "solotax-kg":      { "status": "error", "code": "RATE_LIMITED", "message": "Retried 3x, exhausted" },
    "Beer_bot":        { "status": "stale", "message": "Last good fetch 2 days ago — using cached" },
    "makeit-pipeline": { "status": "ok" },
    // ... все 12 репо
  },
  "buckets": {
    "30d": {                                      // 30 daily buckets
      "labels": ["2026-04-25", ..., "2026-05-24"],
      "summary": [                                // aggregated across OK repos only
        { "total_pr": 8, "with_p0": 0, "with_p1_only": 1, "with_p2_only": 2 },
        ...
      ],
      "per_repo": {
        "moliyakg": {
          "buckets": [
            { "total_pr": 5, "with_p0": 1, "with_p1_only": 0, "with_p2_only": 1 },  // ← P0 пример
            ...
          ],
          "codex_coverage_pct": 67,             // % из total_pr где Codex оставил ≥1 коммент
          "codex_first_seen": "2026-01-15T10:23:00Z"
        },
        ...
      }
    },
    "12w": {
      "labels": ["2026-03-09", ..., "2026-05-25"],   // ISO-Monday даты
      "summary": [ ... ],
      "per_repo": { ... }
    }
  }
}
```

**Заметки про data integrity:**
- `with_p0` = PR с ≥1 P0 находкой (worst-wins, может также иметь P1 и P2 — но засчитывается тут).
- `with_p1_only` = PR с ≥1 P1, но **без P0**.
- `with_p2_only` = PR с ≥1 P2, но **без P0 и без P1**.
- `dirty = with_p0 + with_p1_only + with_p2_only` (вычисляется на фронте).
- Гарантия: `with_p0 + with_p1_only + with_p2_only + clean === total_pr` (нет двойного счёта).
- Бакетизация по `merged_at` в **UTC**, ISO-неделя пн-вс (см. секцию Метрика).
- **Partial errors handling:** репо со `status: error` НЕ участвуют в `summary` (иначе 0/0 занизит dirty rate). На карточке проекта показывается состояние ошибки с last-good-data плашкой. На сводной — баннер "X из 12 репо без данных".
- **Codex coverage** на repo-card нужен чтобы пользователь видел: репо где Codex включён 2 недели назад покажет "100% clean" за прошлый месяц фальшиво. Бейдж "Codex coverage: 23%" предупреждает.
- **Archive immunity:** статус PR/repo в MakeIT Tracker (Project v2) не влияет на эти данные — мы запрашиваем напрямую `/repos/.../pulls`, не `/projects/...`.

## Components

### Backend: Pipeline Mac

**`makeit-pipeline/scripts/codex_quality_sweep.py`** (новый файл в репо `makeit-pipeline`)

```
codex_quality_sweep.py
  ├─ load_repos_from_config()               # читает config/quality_repos.json (не парсит CLAUDE.md regex'ом)
  ├─ acquire_lock(path)                     # flock(2) на /tmp/codex-quality-sweep.lock
  ├─ fetch_repo_merged_prs(repo, since)     # см. ниже — корректный fetch без несуществующего ?since
  ├─ fetch_repo_review_comments(repo, since)# GET /pulls/comments?since=Y (paginate, since="updated_at >= Y")
  ├─ parse_severity(body)                   # regex !\[P(\d) Badge\] → "P1"|"P2"|None
  ├─ group_findings_per_pr(comments)        # → { pr_url: { has_p1, has_p2 } }
  ├─ bucketize(prs, findings, mode)         # 30d daily / 12w weekly (UTC)
  ├─ aggregate_summary(per_repo)            # суммирует per_repo (исключая failed!) по бакетам
  ├─ write_json_atomic_local(path, data)    # write tmp + os.replace
  ├─ publish_remote_atomic(local, remote)   # rsync to .tmp + ssh mv → final (см. ниже)
  └─ main()                                 # orchestrate + retry-with-backoff + log
```

### ⚠ Корректный fetch merged PR'ов (исправление по итогам ревью)

**Важно:** эндпоинт `GET /repos/{owner}/{repo}/pulls` **НЕ принимает параметр `since`** — только `state`, `head`, `base`, `sort`, `direction`, `per_page`, `page`. Эндпоинт `/pulls/comments?since=Y` принимает `since`, но это "updated_at >= Y" (а не "created_at"), что включает старые комменты с редакциями.

**Правильный паттерн:**

```python
def fetch_repo_merged_prs(repo: str, since: datetime) -> list[dict]:
    """Pull merged PRs since cutoff. Использует sort=updated+direction=desc + early-exit."""
    merged_prs = []
    page = 1
    while True:
        resp = gh_api_get(
            f"/repos/{OWNER}/{repo}/pulls",
            params={
                "state": "closed",
                "sort": "updated",
                "direction": "desc",
                "per_page": 100,
                "page": page,
            },
        )
        prs = resp.json()
        if not prs:
            break
        for pr in prs:
            updated_at = parse_iso(pr["updated_at"])
            # Early-exit: страница отсортирована по updated_at desc.
            # Если updated_at < since — все следующие тоже будут < since.
            if updated_at < since:
                return merged_prs
            # Фильтруем по merged_at (не closed_at!) — closed_at включает закрытые без мержа
            if pr.get("merged_at"):
                merged_at = parse_iso(pr["merged_at"])
                if merged_at >= since:
                    merged_prs.append(pr)
        page += 1
        if page > MAX_PAGES:  # safety
            log.warning(f"{repo}: hit MAX_PAGES, possibly missing older PRs")
            break
    return merged_prs
```

**Альтернатива (отвергнута):** Search API `q=is:pr+is:merged+merged:>=YYYY-MM-DD+repo:X` — лимит 30 req/min, на 12 репо + ретраи рискованно. REST с sort+early-exit использует базовый core-лимит 5000/час.

### Retry-стратегия (исправлена)

Не фиксированные 1s/4s/16s, а **respect GitHub rate-limit headers + jitter**:

```python
def request_with_retry(method, url, **kwargs) -> Response:
    for attempt in range(3):
        resp = httpx.request(method, url, **kwargs)
        if resp.status_code < 400:
            return resp
        if resp.status_code in (429, 403):
            # Respect Retry-After OR X-RateLimit-Reset (приоритет первому)
            retry_after = resp.headers.get("Retry-After")
            if retry_after:
                wait = int(retry_after)
            else:
                reset = int(resp.headers.get("X-RateLimit-Reset", 0))
                wait = max(1, reset - int(time.time()))
            wait = min(wait, 300) + random.uniform(0, 2)   # cap 5 min, jitter 0-2s
            log.warning(f"Rate-limit on {url}: sleep {wait:.1f}s")
            time.sleep(wait)
            continue
        if resp.status_code >= 500:
            wait = (2 ** attempt) + random.uniform(0, 1)   # 1, 2, 4 + jitter
            time.sleep(wait)
            continue
        resp.raise_for_status()
    resp.raise_for_status()
    return resp
```

Логи: `~/logs/codex-quality-sweep.log` (один файл, ротация средствами macOS `newsyslog`). Лог пишется через `logging` module: INFO для прогресса, ERROR для падений.

### Locking (предотвращает race cron × force-refresh)

```python
import fcntl
LOCK_FILE = "/tmp/codex-quality-sweep.lock"

def with_exclusive_lock(fn):
    with open(LOCK_FILE, "w") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SweepAlreadyRunning()
        return fn()
```

API endpoint `POST /quality/refresh` ловит `SweepAlreadyRunning` → возвращает `409 Conflict` с сообщением "Sweep уже выполняется, попробуйте через ~5 минут".

### Atomic remote publish

```python
def publish_remote_atomic(local_path: Path, remote_dir: str = "/opt/apps/makeit-stack/web/data"):
    """rsync to .tmp on remote → ssh mv to final. Атомарно с точки зрения nginx."""
    tmp_name = ".codex-quality.json.tmp"
    final_name = "codex-quality.json"
    subprocess.run([
        "rsync", "-e", "ssh", str(local_path), f"vps:{remote_dir}/{tmp_name}"
    ], check=True)
    # mv на одном FS — atomic POSIX rename
    subprocess.run([
        "ssh", "vps", f"mv {remote_dir}/{tmp_name} {remote_dir}/{final_name}"
    ], check=True)
```

Без этого nginx может в окне rsync'а отдать клиенту частично переписанный JSON → 500/parse-error в браузере.

**`makeit-pipeline/api.py`** (добавить эндпоинты)

```python
SAFE_ERROR_CODES = {
    "RATE_LIMITED": "GitHub API rate-limit. Дождитесь сброса.",
    "REPO_NOT_FOUND": "Один из репо переименован/удалён. Проверьте config/quality_repos.json.",
    "NETWORK": "Сетевая ошибка sweep'а. Проверьте Pipeline Mac.",
    "ALREADY_RUNNING": "Sweep уже выполняется. Подождите ~5 минут.",
    "INTERNAL": "Внутренняя ошибка. См. ~/logs/codex-quality-sweep.log на Pipeline Mac.",
}

@app.post("/quality/refresh")
def quality_refresh():
    """Force-run sweep on demand. Returns fresh JSON or sanitized error."""
    try:
        result = subprocess.run(
            ["python3", "scripts/codex_quality_sweep.py", "--force"],
            capture_output=True, timeout=300
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content={"code": "TIMEOUT", "message": "Sweep > 5 минут"})

    if result.returncode == EXIT_ALREADY_RUNNING:
        return JSONResponse(status_code=409, content={
            "code": "ALREADY_RUNNING", "message": SAFE_ERROR_CODES["ALREADY_RUNNING"]
        })
    if result.returncode != 0:
        # НЕ возвращаем raw stderr — может содержать пути, env vars, токены
        # Парсим стандартизованный exit-code из скрипта (skрипт пишет JSON-error в stdout последней строкой)
        code = parse_sweep_error_code(result.stdout) or "INTERNAL"
        log.error(f"Sweep failed: code={code}, stderr_sample={result.stderr[:200]}")
        return JSONResponse(status_code=500, content={
            "code": code, "message": SAFE_ERROR_CODES.get(code, SAFE_ERROR_CODES["INTERNAL"])
        })
    return FileResponse(QUALITY_JSON_PATH)
```

### Repo-list — explicit config (не regex по CLAUDE.md)

```python
# makeit-pipeline/config/quality_repos.json
{
  "owner": "Sergio1990-1",
  "repos": [
    "Sewing-ERP", "mankassa-app", "solotax-kg", "Business-News",
    "Beer_bot", "Uchet_bot", "quiet-walls", "moliyakg",
    "MyMoney", "makeit-auditor", "makeit-pipeline", "makeit-dashboard",
    "makeit-knowledge", "MetaSellerSupplies"
  ],
  "_comment": "Source of truth для sweep. Синхронизировать с глобальным CLAUDE.md вручную при добавлении репо."
}
```

Альтернатива (parse CLAUDE.md regex'ом — как в `makeit-codexfeedback` skill) **отвергнута**: хрупко, регэксп зависит от форматирования md-комментариев, может молча подхватить лишние строки или пропустить новые репо.

### launchd: `com.makeit.codex-quality-sweep`

`~/Library/LaunchAgents/com.makeit.codex-quality-sweep.plist`:

```xml
<dict>
  <key>Label</key><string>com.makeit.codex-quality-sweep</string>
  <key>ProgramArguments</key><array>
    <string>/Users/sergeymakarov/.../codex_quality_sweep.py</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>19</integer>     <!-- 19:00 UTC = 03:00 Bali UTC+8 -->
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>/Users/sergeymakarov/logs/codex-quality-sweep.log</string>
  <key>StandardErrorPath</key><string>/Users/sergeymakarov/logs/codex-quality-sweep.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <!-- GH_TOKEN НЕ в plist (plain-text disk). Скрипт сам читает .env через python-dotenv -->
  </dict>
</dict>
```

### VPS: nginx route

`/opt/apps/nginx-proxy/conf.d/makeit.conf` (добавить локацию):

```nginx
location /data/ {
    alias /opt/apps/makeit-stack/web/data/;
    add_header Cache-Control "public, max-age=300";  # 5 min — на случай если sweep отстаёт
}
```

Директория `/opt/apps/makeit-stack/web/data/` создаётся вручную при первом деплое + права для пользователя, под которым работает rsync.

### Frontend: dashboard

**`src/utils/quality.ts`** (новый) — клиент API + парсинг JSON:

```ts
export interface QualityBucket { total_pr: number; with_p1: number; with_p2_only: number; }
export interface QualityPayload {
  generated_at: string;
  errors: Array<{ repo: string; message: string }>;
  buckets: {
    "30d": { labels: string[]; summary: QualityBucket[]; per_repo: Record<string, QualityBucket[]>; };
    "12w": { labels: string[]; summary: QualityBucket[]; per_repo: Record<string, QualityBucket[]>; };
  };
}

export async function fetchQualityData(): Promise<QualityPayload> {
  const url = (window.__MAKEIT_CONFIG__?.QUALITY_URL ?? "/data/codex-quality.json");
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Quality data fetch failed: ${res.status}`);
  return res.json();
}

export async function forceQualityRefresh(): Promise<QualityPayload> {
  const url = `${PIPELINE_URL}/quality/refresh`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}
```

**`src/hooks/useQuality.ts`** (новый):

```ts
export function useQuality() {
  const [data, setData] = useState<QualityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => { ... }, []);
  useEffect(() => { load(false); }, [load]);

  const isStale = useMemo(() => {
    if (!data) return false;
    const ageHours = (Date.now() - new Date(data.generated_at).getTime()) / 3.6e6;
    return ageHours > 30;
  }, [data]);

  return { data, loading, error, isStale, refresh: () => load(true) };
}
```

**`src/components/QualityTab.tsx`** (новый) — главный компонент вкладки:

```
QualityTab
  ├─ QualityHeader           # title + period toggle + refresh button + last-sync info
  ├─ QualityStaleBanner      # warn if isStale
  ├─ QualitySummaryPanel     # большой график + 4 KPI справа
  │   ├─ QualityChart        # переиспользуется и для карточек
  │   └─ QualityKPIs
  ├─ QualityProjectGrid      # responsive grid (auto-fill 320px)
  │   └─ QualityProjectCard  # name, %, mini-chart, P1/P2 numbers, severity badge
  └─ QualityNote             # ссылка на spec, объяснение метрики
```

**`src/components/QualityChart.tsx`** (новый) — переиспользуемый bar-chart:

Props: `buckets: QualityBucket[]`, `labels: string[]`, `maxScale: number`, `showLabels: boolean`, `compact: boolean`. Чистый view-компонент. Точно такая же разметка как в прототипе.

**`src/styles/v4.css`** — добавить:

```css
.v4-quality-chart { ... }
.v4-quality-bar { ... }
.v4-quality-bar-p1    { background: var(--v4-p1); }             /* красный */
.v4-quality-bar-p2    { background: var(--v4-p2); }             /* оранжевый */
.v4-quality-bar-clean { background: var(--v4-clean-soft); }     /* голубой */
/* + добавить :root --v4-clean-soft: #93C5FD; */
/* и т.д. — взять из прототипа */
```

**Анимации и interactions** — переиспользуют язык `wow-*` из дашборда (`v4.css` "Stagger entrance for grid items", "Closed-30d chart: left-to-right reveal", `v4-ClosedChart30d.tsx` hover-behavior). Один easing везде — `cubic-bezier(0.16, 1, 0.3, 1)`.

| Элемент | На появление | Hover-эффект |
|---|---|---|
| Чарт целиком | `q-chart-in` (fade + translateY 6→0), 480ms | — |
| Бары (главный + мини в карточках) | Появляются вместе с чартом (без per-bar stagger) | Активный бар имеет column-wide halo (`::before` с `--v4-accent-100`); все остальные бары → `opacity: 0.4` (через class toggle `is-hovering`/`is-active` — работает идентично в обоих) |
| Value-chip над баром | — | opacity + translateY(2→0), 120/150ms |
| Tooltip — main chart | — | Полноразмерная карточка `chart-tip`: дата, total PR, breakdown clean/P2/P1, % грязных. 180/220ms |
| Tooltip — mini chart (карточки) | — | Компактная плашка `chart-tip--compact`, **2 строки**: line 1 — `DD.MM · X PR · Y%`. Line 2 — breakdown с цветными свотчами: `🔴P0:N · ▮P1:N · ▮P2:N · ▮clean:N`. P0-сегмент выделен ярко-красным и появляется только если `with_p0 > 0`. Те же 180/220ms |
| Annotation-линии | inherits chart fade | Линия меняет цвет на ink-900, dot 1.2× |
| KPI | `q-kpi-in` (fade + translateY 8→0 + scale 0.985→1), 520ms, stagger 60ms·i | translateY(-2px) + shadow |
| Карточки проектов | `q-card-in` (fade + translateY 10→0), 420ms, stagger 45ms·i | translateY(-3px) + shadow |

**Hover-experience должен быть consistent main vs mini** — пользователь видит одни и те же подсказки везде, только tooltip-форма адаптивная (полная вертикальная для main, узкая горизонтальная для mini где высоты 80px недостаточно для 5 строк). Селектор dim-эффекта `.is-hovering .bar:not(.is-active) .bar-stack` (без привязки к классу контейнера) покрывает оба случая.

**Перформанс-критичные правила (вынесены из ошибок прототипа):**

1. **НЕ использовать `transition: height`** — height триггерит layout recalc каждый кадр. Период-switch перемонтирует DOM с готовыми height-значениями. Если нужна именно height-анимация — использовать `transform: scaleY()` + `transform-origin: bottom`.
2. **НЕ использовать `clip-path` для wipe-анимации** на контейнере с 30+ детьми — каждый ребёнок репейнтится. Использовать `opacity + translateY` всего контейнера.
3. **НЕ использовать `:has(.bar:hover)`** для dim-эффекта остальных баров — `:has()` дорог. Использовать toggle CSS-класса (`is-hovering`/`is-active`) через JS-listener.
4. **Tooltip-структуру создавать один раз** (одна `chart-tip` на чарт), на hover — обновлять только textContent. Никаких `innerHTML = ...` каждый мышиный движок.
5. **GPU-friendly properties only** для transitions: `transform`, `opacity`. Никогда `width`, `height`, `top`, `left`, `padding` — это layout-property.

**Period switch:** при клике 30d/12w компонент перемонтирует чарт — анимации играют заново. Альтернатива (плавный tween высот через React keyed-list + `transform: scaleY`) — отдельная задача оптимизации, не для v1.

**Reduced motion:** блок `@media (prefers-reduced-motion: reduce)` отключает все `animation` и `transition: transform`, оставляя `opacity` для tooltip и annotation-tip. Паттерн идентичен `v4.css` строки 8425-8454.

## Annotations / event markers (Фаза 1)

**Зачем:** видеть корреляцию "после такой-то правки промпта качество просело/выросло". Сейчас если ты ночью обновил `/makeit-codereview`, через 3 дня в графике провал — без аннотаций ты не свяжешь причину со следствием.

**Что:** вертикальные пунктирные линии на сводном чарте + dot сверху + tooltip при hover с описанием события и датой.

**Категории (Фаза 1, ручной ввод через UI):**
- `skill` (синий, `--v4-accent-600`) — обновление скилла разработки
- `deploy` (зелёный, `--v4-success-500`) — деплой инфраструктуры / новой версии pipeline
- `manual` (фиолетовый, `--v4-purple-500`) — pair-сессия с Codex, ad-hoc интервенция, прочее

**Где живут данные:**
```jsonc
// /data/annotations.json — рядом с codex-quality.json на VPS
{
  "schema_version": 1,
  "annotations": [
    {
      "id": "a3f8e9c2-7b4d-4f1a-9e8c-6d5b3a2f1e9d",   // UUID v4 — для DELETE/UPDATE
      "occurred_at": "2026-04-13T00:00:00Z",          // явный UTC ISO8601 (не амбивалентный date)
      "category": "skill",                            // skill | deploy | manual
      "scope": "global",                              // global | repo
      "repos": null,                                  // если scope=repo: ["makeit-pipeline", ...]
      "title": "Refactor /makeit-dev",
      "desc": "Уменьшен retry-rate на phase QA",
      "created_by": "manual",                         // Phase 2: "pipeline:auto-tuning", "git:lessons-learned"
      "created_at": "2026-04-13T15:23:00Z"            // UTC ISO8601
    },
    ...
  ]
}
```

**Почему `occurred_at` UTC, а не `date`:** "событие 22.05.2026" из браузера в Москве (UTC+3) и из браузера в Бали (UTC+8) парсилось бы по-разному. Локальная полночь Москвы = 21:00 UTC предыдущего дня → событие визуально попадёт на бар предыдущего дня. Решение: UI отдаёт `occurred_at` в UTC (либо берёт локальную полночь и конвертирует, либо пользователь явно выбирает время + TZ). v1 — UI ставит локальную полночь и переводит в UTC.

**Почему `id` UUID, а не индекс:** при параллельных POST'ах (или после сортировки annotations по дате) индекс сдвигается. `DELETE /annotations/5` удалит не то что хотел пользователь. UUID решает проблему фундаментально.

**Как добавить событие (UI):** кнопка `+ событие` в шапке Quality-вкладки → модалка с полями (дата+время picker, категория-select, scope-select, title, desc). На submit — `POST /annotations` к Pipeline API → запись в JSON → publish_remote_atomic.

**Backend endpoint в `makeit-pipeline/api.py`:**
```python
from uuid import uuid4
from pydantic import BaseModel, Field

class AnnotationCreate(BaseModel):
    occurred_at: datetime
    category: Literal["skill", "deploy", "manual"]
    scope: Literal["global", "repo"] = "global"
    repos: list[str] | None = Field(default=None, max_length=20)
    title: str = Field(max_length=120)
    desc: str = Field(max_length=600)

MAX_ANNOTATIONS_TOTAL = 5000   # защита от unbounded growth
MAX_BODY_SIZE_BYTES = 4096

@app.post("/annotations")
def add_annotation(payload: AnnotationCreate, request: Request):
    if int(request.headers.get("content-length", 0)) > MAX_BODY_SIZE_BYTES:
        raise HTTPException(413, "Payload too large")
    with_exclusive_lock(ANNOT_LOCK)
    annotations = load_annotations()
    if len(annotations) >= MAX_ANNOTATIONS_TOTAL:
        raise HTTPException(429, "Annotation store full — выгрузите старые")
    new_ann = {
        "id": str(uuid4()),
        **payload.model_dump(mode="json"),
        "created_by": "manual",
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    annotations.append(new_ann)
    save_and_publish(annotations)
    return new_ann

@app.delete("/annotations/{ann_id}")
def delete_annotation(ann_id: UUID):
    with_exclusive_lock(ANNOT_LOCK)
    annotations = load_annotations()
    before = len(annotations)
    annotations = [a for a in annotations if a["id"] != str(ann_id)]
    if len(annotations) == before:
        raise HTTPException(404, "Annotation not found")
    save_and_publish(annotations)
    return {"ok": True, "remaining": len(annotations)}
```

**Базовая защита POST/DELETE** (Codex п.12): length-limits (4 KB body, max 600 chars desc, max 120 title), Pydantic strict types, max 20 repos per annotation, ограничение общего числа annotations 5000. Auth через тот же Basic Auth nginx, что и весь дашборд — отдельный CSRF-token не нужен для one-user setup, но length-limits — must.

**Frontend:** `<QualityAnnotations>` компонент — fetch + render. Линии позиционируются по `left: %` через маппинг date → x. Логика зависит от режима:

- **30d (по дням):** маркер **снапится к центру бара того дня** (1 бар = 1 день, нет внутридневной подвижности). `pct = (dayIdx + 0.5) / barCount × 100`. Иначе маркер встанет на ЛЕВЫЙ край бара и визуально будет казаться "не привязан к этому дню".
- **12w (по неделям):** маркер позиционируется **пропорционально дню внутри периода** (`pct = daysFromStart / totalDays × 100`). Внутринедельная позиция несёт смысл — "событие в понедельник" vs "в пятницу" одной и той же недели видны как разные точки. Маркер не обязан совпадать с центром week-bar'а.

`date` хранится как ISO date (без time) — событие = "случилось в этот день целиком". Если в будущем понадобится точность до часа — поменять schema на `datetime` + соответствующую позиционирующую логику (для weekly это уже работает корректно, для daily — добавить долю внутри дня).

На period-switch компонент перерендеривает маркеры (DOM перемонтируется вместе с чартом).

**Out of scope для Фазы 1:** edit existing annotations (только add/delete), фильтрация по категории, batching/grouping близких событий, связь с конкретным репо (annotation глобальна для всех проектов).

**`src/App.tsx`** — добавить 9-ю вкладку:

```tsx
<TabButton id="quality" active={tab === "quality"} onClick={() => setTab("quality")}>
  Качество
</TabButton>
...
{tab === "quality" && <QualityTab />}
```

### Конфигурация

**`public/config.js`** — добавить `QUALITY_URL` (опционально, если default `/data/codex-quality.json` не подходит):

```js
window.__MAKEIT_CONFIG__ = {
  AUDITOR_URL: "...",
  PIPELINE_URL: "...",
  QUALITY_URL: "/data/codex-quality.json",  // default; на VPS можно переопределить
};
```

## Healthcheck + error states

Сценарии и UX:

| Состояние | Триггер | UI |
|---|---|---|
| ✅ Свежо | `generated_at` < 30 ч | Норма, без баннера |
| ⚠ Устарело | `generated_at` ≥ 30 ч | Жёлтый баннер сверху: "Данные не обновлялись 30+ часов. Проверь cron на Pipeline Mac." + кнопка "Обновить сейчас" |
| ❌ JSON не найден | `fetch` 404 | Red panel: "Файл `/data/codex-quality.json` не найден. Cron ещё ни разу не запускался?" + кнопка "Запустить sweep сейчас" |
| ❌ Pipeline Mac офлайн | `forceRefresh` fails | Toast: "Pipeline Mac недоступен. Sweep не запущен, ждём cron в 03:00 Бали." |
| ⚠ Частичный sweep | `repo_status[X].status === "error"` для ≥1 репо | Малый бейдж "⚠ 2 репо без данных" над сводным графиком, hover — список репо + код ошибки (sanitized) + last-good timestamp |
| ⚠ Sweep уже идёт | `/quality/refresh` → 409 | Toast: "Sweep уже выполняется. Попробуйте через ~5 минут." |
| ⚠ Низкая выборка (low-sample) | бакет с `total_pr < LOW_SAMPLE_THRESHOLD` (8) | На баре — серая штриховка вместо плотного fill; в tooltip приписка "малая выборка"; на repo-card если **все** бакеты low-sample — бейдж "мало данных" |
| ⚠ Низкое покрытие Codex | `codex_coverage_pct < 50%` на repo-card | Бейдж "Codex coverage: X%" в card-foot с warn-цветом. "Цифры основаны на половине PR" |

**LOW_SAMPLE_THRESHOLD = 8 PR** — компромисс. Меньше — % становится "драматичным" (1/2=50% и т.д.). Больше 8 — слишком агрессивно скрываем данные. Можно сделать настройкой в settings store позже.

## Testing

- **sweep.py:** unit-тесты на `parse_severity`, `group_findings_per_pr`, `bucketize` (фиксированные входные данные → ожидаемая агрегация).
- **sweep.py end-to-end:** ручной запуск против реальных репо, проверка JSON-схемы, время выполнения < 5 мин.
- **launchd:** `launchctl load ...plist`, `launchctl start com.makeit.codex-quality-sweep`, проверка лога.
- **Frontend:** Vitest для `useQuality` (mocked fetch). Snapshot для `QualityChart` рендеринга. Ручная проверка через `npm run dev`.
- **Integration:** прогон полного цикла — cron triggers sweep → JSON appears on VPS → dashboard fetches and renders.

## Implementation order

1. **Backend skeleton:** `sweep.py` с моковыми данными (фейковый GitHub-fetch, реальная агрегация), JSON-output. → можно тестировать локально без квот.
2. **Real GitHub fetch:** подключить `gh api` calls, retry, errors[]. → ручной прогон, проверить полный sweep.
3. **launchd + rsync:** plist, `.htaccess` для пути, rsync-команда внутри скрипта, проверить cron.
4. **VPS nginx config:** добавить `/data/` location, redeploy.
5. **Frontend types + utils:** `quality.ts`, `useQuality.ts` hooks.
6. **Frontend компоненты:** `QualityChart`, `QualityProjectCard`, `QualitySummaryPanel`, `QualityTab`.
7. **Стили:** перенести из прототипа в `v4.css`.
8. **App.tsx интеграция:** новая вкладка.
9. **Healthcheck + force-refresh:** баннер, кнопка, FastAPI endpoint.
10. **Тесты + ручная проверка через `npm run dev`.**
11. **Деплой:** redeploy dashboard + (отдельно) перезапуск launchd.

## Open questions

Нет открытых вопросов — все архитектурные решения зафиксированы выше.

## Risks

- **GH_TOKEN в launchd plist** — секрет в plain-text plist. Mitigation: использовать `.env` файл, который читается скриптом через `python-dotenv` (паттерн уже есть в Pipeline API). Plist хранит только путь к скрипту.
- **rsync ключ** — Pipeline Mac уже имеет SSH-доступ к VPS (паттерн `git@github.com:...` deploy). Mitigation: переиспользуем тот же ключ.
- **GitHub API quota** — 12 repo × ~3 страниц pagination = ~36 calls + ещё ~36 за merged PR list = ~72 calls. REST core 5000/час — запас гигантский. Quota check внутри sweep, лог если осталось < 1000.
- **Pipeline Mac офлайн в 03:00** — sweep не запускается, на утро JSON старый, баннер показывается, пользователь жмёт "Обновить сейчас" → тоже ошибка → ждёт пока хост поднимется. Mitigation: уведомление о sleep'е Pipeline Mac уже в makeit-monitoring (см. дашборд `Мониторинг`).
