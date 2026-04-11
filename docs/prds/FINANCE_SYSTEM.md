# ТЗ: Финансовая система MakeIT

**Статус:** draft, ожидает исполнения
**Автор:** Sergey + Claude
**Дата:** 2026-04-11

---

## 1. Контекст и проблема

На текущий момент финансовые данные в дашборде представлены только хардкод-таблицей `PROJECTS` в `src/utils/config.ts` (поля `budget`/`paid`) + возможностью редактировать их через модалку `FinanceEditor`, которая сохраняет значения в `localStorage`. Это:

- не синхронизируется между устройствами;
- не отражает реальные доходы по проектам (надо вручную обновлять код);
- **вообще не учитывает расходы** — ни API (Anthropic, OpenAI, Gemini), ни подписки (Claude Pro x2, OpenAI Plus и т.п.).

Одновременно pipeline пишет `metrics.jsonl`, но поле `cost_usd` там всегда `0.0` — фактической стоимости API-вызовов не видно. Единственный модуль, где cost реально заполняется, — **Debate Engine** (`debate_jobs/*.json` содержат `cost_summary`).

Задача — построить полноценную систему учёта финансов: приходы, расходы, подписки, с автоматическим сбором costs API по модулям и сверкой с billing-API провайдеров.

---

## 2. Цели v1

1. **Автосбор расходов API** по провайдерам (Anthropic / OpenAI / Gemini), сегментированных по **модулям**:
   - `pipeline_dev`, `pipeline_review`, `pipeline_qa`, `pipeline_merge`
   - `verification` (client-side из dashboard)
   - `audit` (makeit-auditor)
   - `transcription` (Whisper + LLM)
   - `debate`, `research`, `discovery`
   - `other`
2. **Ручной учёт подписок** (Claude Pro x2, OpenAI Plus, …).
3. **Ручной учёт доходов** по проектам — с UI, а не хардкод.
4. **Замена сводки** на главной странице дашборда реальными live-цифрами (доход / расход / подписки / PnL за месяц).
5. **Сверка** с billing API провайдеров (Anthropic Admin API, OpenAI Usage API) для верификации собственного учёта.

### Не-цели v1

- Мультипользовательность, роли доступа.
- Генерация счетов/инвойсов.
- Алерты при превышении бюджетов подписок.
- Мультивалюта для расходов (всегда USD). Для доходов — RUB/KGS допустимы.

---

## 3. Архитектура

### 3.1 Общая схема

```
┌─────────────────── Pipeline Mac (~/makeit-pipeline) ────────────────────┐
│                                                                         │
│  makeit_pipeline/finance/                                               │
│    ├── store.py          SQLite CRUD (~/.makeit-pipeline/finance.db)    │
│    ├── pricing.py        model → (in_price, out_price, cache_*)         │
│    ├── recorder.py       record_expense() + contextvar context          │
│    ├── tracked_clients.py обёртки Anthropic / OpenAI / Gemini           │
│    ├── sync_anthropic.py Admin API reconciliation                       │
│    └── sync_openai.py    Usage API reconciliation                       │
│                                                                         │
│  api.py                                                                 │
│    POST   /finance/expense            запись события                   │
│    GET    /finance/expenses           фильтры, агрегация                │
│    POST   /finance/income             CRUD                              │
│    GET    /finance/income                                               │
│    PUT    /finance/income/{id}                                          │
│    DELETE /finance/income/{id}                                          │
│    POST   /finance/subscription       CRUD                              │
│    GET    /finance/subscriptions                                        │
│    PUT    /finance/subscriptions/{id}                                   │
│    DELETE /finance/subscriptions/{id}                                   │
│    GET    /finance/summary            агрегат для главного дашборда     │
│    GET    /finance/pricing            таблица цен (для фронта)          │
│    POST   /finance/sync/anthropic     ручной триггер                    │
│    POST   /finance/sync/openai                                          │
│    GET    /finance/sync               last-sync статус + delta          │
│                                                                         │
│  Scheduled task (LaunchAgent):                                          │
│    раз в сутки POST /finance/sync/anthropic + /openai                   │
└─────────────────────────────────────────────────────────────────────────┘
              │                                    ▲
              │ SSH tunnel :8766                   │
              ▼                                    │
┌──────────── VPS / Browser SPA ───────────────────┴──────────────────────┐
│                                                                         │
│  src/utils/finance.ts          API client                               │
│  src/hooks/useFinance.ts       состояния, polling                       │
│  src/components/FinanceTab.tsx новая вкладка «Финансы»                  │
│    ├── SummaryCards     Доход/Расход/Подписки/PnL за месяц              │
│    ├── IncomeTable      CRUD приходов по проектам                       │
│    ├── SubscriptionList CRUD подписок                                   │
│    ├── ExpenseBreakdown Stacked bar: по модулям и провайдерам           │
│    └── Reconciliation   «Мы насчитали $X, провайдер $Y, дельта Z»       │
│                                                                         │
│  Dashboard-side API calls (verification):                               │
│    после каждого вызова Claude → POST /finance/expense                  │
│    fire-and-forget + retry queue в localStorage при недоступности      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Почему SQLite

| Критерий | JSONL | **SQLite** |
|---|---|---|
| Агрегация по месяцу/модулю/провайдеру | Загрузить весь файл и считать | `SELECT SUM GROUP BY` |
| Одновременная запись pipeline + dashboard | Риск гонок | Атомарно |
| Редактирование/удаление (income, subscriptions) | Перезапись файла | `UPDATE / DELETE` |
| Размер через 6 мес при активной работе | ок | ок |
| Сложность подключения | — | Встроен в stdlib (`sqlite3`) |

**Выбор: SQLite.** Один writer (pipeline API), файл `~/.makeit-pipeline/finance.db`. Read-only доступ извне — только через REST.

Миграции — `PRAGMA user_version` + ручные функции, без Alembic.

---

## 4. Data model (SQLite)

```sql
-- Расходы: append-only журнал (редактирования не предусмотрены).
CREATE TABLE expenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT    NOT NULL,        -- ISO 8601 UTC
  provider      TEXT    NOT NULL,        -- anthropic | openai | gemini
  module        TEXT    NOT NULL,        -- pipeline_dev, verification, ...
  project       TEXT,                    -- moliyakg, mankassa-app, … (nullable)
  model         TEXT,                    -- claude-opus-4-6, gpt-4o, gemini-2.5-pro
  amount_usd    REAL    NOT NULL,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  cache_read    INTEGER,                 -- Anthropic prompt caching read
  cache_write   INTEGER,                 -- Anthropic prompt caching write
  source        TEXT    NOT NULL,        -- auto | manual | reconciled
  reference_id  TEXT,                    -- issue#, debate_id, transcript_id
  meta          TEXT                     -- JSON catchall
);
CREATE INDEX idx_expenses_ts       ON expenses(ts);
CREATE INDEX idx_expenses_module   ON expenses(module);
CREATE INDEX idx_expenses_provider ON expenses(provider);
CREATE INDEX idx_expenses_project  ON expenses(project);

-- Доходы: CRUD, ручные.
CREATE TABLE income (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT    NOT NULL,         -- дата прихода
  project      TEXT    NOT NULL,
  amount       REAL    NOT NULL,         -- в исходной валюте
  currency     TEXT    NOT NULL,         -- USD, RUB, KGS
  fx_rate      REAL    NOT NULL,         -- курс к USD на дату
  amount_usd   REAL    NOT NULL,         -- amount × fx_rate
  description  TEXT,
  client       TEXT
);

-- Подписки: CRUD, ручные.
CREATE TABLE subscriptions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,      -- "Claude Pro (Sergey)"
  provider           TEXT,               -- anthropic | openai | gemini | other
  amount_usd         REAL NOT NULL,
  billing_cycle      TEXT NOT NULL,      -- monthly | yearly
  billing_day        INTEGER,            -- день месяца/года
  started_at         TEXT NOT NULL,
  ended_at           TEXT,               -- NULL = активна
  notes              TEXT
);

-- Сверка с billing API провайдеров: отдельная таблица, чтобы не смешивать
-- с нашим собственным учётом и не дублировать расходы.
CREATE TABLE provider_sync (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider       TEXT NOT NULL,
  period_start   TEXT NOT NULL,
  period_end     TEXT NOT NULL,
  reported_usd   REAL NOT NULL,          -- что сказал провайдер
  tracked_usd    REAL NOT NULL,          -- что насчитал наш recorder
  synced_at      TEXT NOT NULL,
  meta           TEXT                    -- JSON raw response
);
```

---

## 5. Автосбор расходов

### 5.1 Контекст модуля через `contextvars.ContextVar`

Ключевая задача — чтобы recorder знал текущий `module` и `project` без явного пробрасывания через все слои кода.

```python
# finance/recorder.py
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

@dataclass
class FinanceContext:
    module: str
    project: str | None
    reference_id: str | None

_finance_ctx: ContextVar[FinanceContext] = ContextVar(
    "_finance_ctx",
    default=FinanceContext("other", None, None),
)

@contextmanager
def finance_context(module: str, project: str | None = None, reference_id: str | None = None):
    token = _finance_ctx.set(FinanceContext(module, project, reference_id))
    try:
        yield
    finally:
        _finance_ctx.reset(token)

def record_expense(
    *,
    provider: str,
    model: str,
    tokens_in: int,
    tokens_out: int,
    cache_read: int = 0,
    cache_write: int = 0,
) -> None:
    ctx = _finance_ctx.get()
    amount = pricing.calculate(model, tokens_in, tokens_out, cache_read, cache_write)
    store.insert_expense(
        ts=now_iso(),
        provider=provider,
        module=ctx.module,
        project=ctx.project,
        model=model,
        amount_usd=amount,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cache_read=cache_read,
        cache_write=cache_write,
        source="auto",
        reference_id=ctx.reference_id,
    )
```

Orchestrator в начале каждой фазы выставляет контекст:

```python
with finance_context(module=f"pipeline_{phase}", project=repo, reference_id=f"issue#{issue.number}"):
    result = await self.dev_agent.run(issue)
```

Один `with` наверху — все `anthropic.messages.create(...)` глубоко внутри пишутся в правильный module/project автоматически.

### 5.2 Wrapped provider clients

Правило: **API вызываются только через обёртки**, не через ванильные SDK.

```python
# finance/tracked_clients.py
class TrackedAnthropic:
    def __init__(self, client): self._client = client
    async def messages_create(self, *args, **kwargs):
        resp = await self._client.messages.create(*args, **kwargs)
        record_expense(
            provider="anthropic",
            model=kwargs.get("model"),
            tokens_in=resp.usage.input_tokens,
            tokens_out=resp.usage.output_tokens,
            cache_read=getattr(resp.usage, "cache_read_input_tokens", 0),
            cache_write=getattr(resp.usage, "cache_creation_input_tokens", 0),
        )
        return resp
```

Аналогично `TrackedOpenAI` и `TrackedGemini`.

CI-правило (ruff custom rule или grep-guard): **запретить** прямой импорт `from anthropic import`, `from openai import`, `import google.generativeai` вне `makeit_pipeline/finance/tracked_clients.py`. Вне обёрток — любой импорт блокирует CI.

### 5.3 Точки инструментации

| Модуль | Файл | Контекст |
|---|---|---|
| Pipeline dev | `simple_orchestrator.py` — start of `dev` phase | `module="pipeline_dev"` |
| Pipeline self-check | same — start of `self_check` | `module="pipeline_self_check"` |
| Pipeline review | same — `in_review` | `module="pipeline_review"` |
| Pipeline QA | same — `qa_verifying` | `module="pipeline_qa"` |
| Debate | `api.py::_run_debate_job` | `module="debate"`, `reference_id=debate_id` |
| Research | `api.py::_process_research_job` | `module="research"`, `reference_id=job_id` |
| Discovery | аналогично | `module="discovery"` |
| Transcription | `transcript_processor.py` | `module="transcription"`, `reference_id=job_id` |
| Audit | makeit-auditor (через отдельную интеграцию) | `module="audit"` |

### 5.4 Dashboard-side verification

Dashboard сам вызывает Claude API через `src/utils/claude.ts` / `verify-agent.ts`. Сейчас costs не трекаются.

План:

1. Обёртка над `anthropic.messages.create` в `claude.ts` считает cost локально (через таблицу цен на фронте).
2. После успешного вызова — `POST {PIPELINE_BASE_URL}/finance/expense` с:
   ```json
   {
     "provider": "anthropic",
     "module": "verification",
     "project": "<project-name>",
     "model": "<model>",
     "tokens_in": <n>,
     "tokens_out": <n>,
     "source": "auto",
     "reference_id": "<finding_id>"
   }
   ```
3. Fire-and-forget: если pipeline API недоступен — записать в очередь в `localStorage` и дренировать при следующем успешном коннекте.
4. Таблица цен на фронте — через `GET /finance/pricing` при старте, кеш в памяти, TTL 1 час.

---

## 6. Pricing table

```python
# finance/pricing.py
# Цены за 1M токенов
PRICING: dict[str, dict[str, float]] = {
    "claude-opus-4-6":    {"in": 15.00, "out": 75.00, "cache_read": 1.50, "cache_write": 18.75},
    "claude-sonnet-4-6":  {"in": 3.00,  "out": 15.00, "cache_read": 0.30, "cache_write": 3.75},
    "claude-haiku-4-5":   {"in": 0.80,  "out": 4.00,  "cache_read": 0.08, "cache_write": 1.00},
    "gpt-4o":             {"in": 2.50,  "out": 10.00, "cache_read": 1.25},
    "gpt-4o-mini":        {"in": 0.15,  "out": 0.60},
    "gemini-2.5-pro":     {"in": 1.25,  "out": 10.00},
    # …
}

# Алиасы для legacy имён из metrics.jsonl (pipeline пишет просто "opus" / "sonnet").
ALIASES: dict[str, str] = {
    "opus":   "claude-opus-4-6",
    "sonnet": "claude-sonnet-4-6",
    "haiku":  "claude-haiku-4-5",
}

def calculate(model: str, tokens_in: int, tokens_out: int, cache_read: int = 0, cache_write: int = 0) -> float:
    key = ALIASES.get(model, model)
    p = PRICING.get(key)
    if not p:
        return 0.0  # unknown model — запись пройдёт с amount=0 и meta.error
    return (
        tokens_in    * p["in"]           / 1_000_000 +
        tokens_out   * p["out"]          / 1_000_000 +
        cache_read   * p.get("cache_read",  0) / 1_000_000 +
        cache_write  * p.get("cache_write", 0) / 1_000_000
    )
```

Single source of truth — бэк. Frontend тянет через `GET /finance/pricing`. При несовпадении версий бэк доминирует.

---

## 7. Provider reconciliation

Раз в сутки (LaunchAgent или scheduled task) запускается job, который дергает billing API и записывает результаты в `provider_sync`.

### 7.1 Anthropic Admin API

```
GET https://api.anthropic.com/v1/organizations/cost_report
    ?starting_at=<ISO>
    &ending_at=<ISO>
    &bucket_width=1d
    &group_by[]=api_key_id
Header: x-api-key: <ADMIN_KEY>
```

Возвращает дневные costs по workspace/api_key. Сохраняем raw JSON в `provider_sync.meta`, агрегированное число — в `reported_usd`.

**Опционально:** если создать отдельные API-ключи под модули (pipeline, dashboard_verification, audit, transcription) и группировать по `api_key_id`, Anthropic сам возвращает module-breakdown — не нужно доверять нашему recorder'у.

### 7.2 OpenAI Usage API

```
GET https://api.openai.com/v1/organization/costs
    ?start_time=<unix>
    &end_time=<unix>
    &bucket_width=1d
    &group_by[]=project_id
Header: Authorization: Bearer <ADMIN_KEY>
```

Аналогично.

### 7.3 Gemini (Google Cloud Billing)

Публичного простого billing API у Gemini нет. Требуется GCP project + service account + IAM + BigQuery billing export.

**Решение v1:** ручной ввод раз в месяц через UI подписок/расходов. `source: "manual"`, `module: "other"` или per-module на усмотрение.

В v2 — прикручивать GCP Billing если затраты значимы.

### 7.4 Delta UI

Блок «Сверка» в `FinanceTab`:

```
Anthropic:  tracked $245  reported $253  delta -$8  (3%)
OpenAI:     tracked $72   reported $75   delta -$3  (4%)
Gemini:     tracked $23   reported manual
```

Если |delta| > 10% — warning badge.

---

## 8. Dashboard UI

### 8.1 Новая вкладка «Финансы»

Layout (desktop):

```
┌─ Финансы ───────────────────────────────────────────────────┐
│  ┌─── Сводка за текущий месяц ──────────────────────────┐   │
│  │   Доход       Расход      Подписки    PnL          │   │
│  │   $4,200      $340        $180        +$3,680      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── Расходы API по модулям (stacked bar, 30 дней) ────┐   │
│  │  ▇▇▇ pipeline_dev    ▇ verification                 │   │
│  │  ▇▇  debate          ▇ transcription                │   │
│  │  ▇   audit           ▁ research                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── По провайдерам ────┐  ┌── Сверка ───────────────┐     │
│  │ Anthropic  $245 72%  │  │ Anthropic $245 / $253   │     │
│  │ OpenAI     $72  21%  │  │         delta -$8 (3%)  │     │
│  │ Gemini     $23  7%   │  │ OpenAI    $72 / $75     │     │
│  └──────────────────────┘  └─────────────────────────┘     │
│                                                              │
│  ┌── Подписки ──────────────────────┐  ┌─ + Подписка ┐     │
│  │ Claude Pro (Sergey)  $20 / мес   │                      │
│  │ Claude Pro (Work)    $20 / мес   │                      │
│  │ OpenAI Plus          $20 / мес   │                      │
│  └──────────────────────────────────┘                      │
│                                                              │
│  ┌── Доходы по проектам ─────────────────┐  ┌─ + Приход ─┐ │
│  │ Дата       Проект   Клиент     Сумма  │                 │
│  │ 2026-04-05 moliyakg Свой       $500   │                 │
│  │ 2026-04-01 mankassa Сергей     $1,000 │                 │
│  └───────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

Mobile — отдельные вертикальные секции, CRUD через полноэкранные модалки.

### 8.2 Summary на главной

Текущий `Summary` (хардкод из `config.ts`) заменяется на live-данные из `GET /finance/summary`:

- Процент закрытых задач (как сейчас) — сохраняется.
- Блок «БЮДЖЕТ / ОПЛАЧЕНО / ОСТАТОК» заменяется на «ДОХОД / РАСХОД / PnL за текущий месяц».
- Клик открывает `FinanceTab` вместо старого модального `FinanceEditor`.

Старый `FinanceEditor` в итоге удаляется (см. Risks).

---

## 9. Phased rollout

| Фаза | Скоуп | Что даёт |
|---|---|---|
| **1. Backend foundation** | `finance/store.py` (SQLite), `pricing.py`, `recorder.py` с `finance_context`, CRUD-endpoints, unit-тесты | Можно писать, читать, агрегировать. Ещё ничего не трекается. |
| **2. Backend instrumentation** | `tracked_clients.py`, обновление pipeline (4 фазы), debate, research, discovery, transcription, audit. CI-правило против прямых импортов SDK. | Реальный автосбор backend-costs. |
| **3. Dashboard UI** | `finance.ts` client, `useFinance` hook, `FinanceTab`, новый Summary. Старый `FinanceEditor` удаляется. | Видно PnL. Можно добавлять доходы/подписки через UI. |
| **4. Dashboard-side instrumentation** | Обёртка в `claude.ts`, POST из verification, retry queue в `localStorage`. | Verification costs видны. |
| **5. Reconciliation** | `sync_anthropic.py`, `sync_openai.py`, LaunchAgent scheduled task, UI блок «Сверка». | Доверие к цифрам + детекция дыр в инструментации. |
| **6. Polish** | Месячные отчёты, экспорт CSV, фильтры, опционально алерты. | |

Движемся последовательно. Каждая фаза мержится и проверяется в проде перед следующей.

---

## 10. Риски и открытые вопросы

### 10.1 Риски

1. **Историческая яма.** `metrics.jsonl` хранит `cost_usd = 0.0`. Исторические расходы восстановить невозможно из своих логов. Варианты:
   - (a) Sync назад через billing API: вытянуть суммы по дням до начала месяца, записать в `provider_sync` как `reconciled`. Без модульной разбивки, но абсолютные числа будут.
   - (b) Считать всё до запуска потерянным — видны только свежие данные от момента запуска.
   - **Рекомендация: (a)**, ценно знать абсолютные числа даже без сегментации.

2. **Двойной учёт.** Если wrapped client пишет cost и параллельно billing API sync пишет — можем задвоить. Решение: расходы нашего recorder'а идут в `expenses` с `source="auto"`, billing API sync — только в `provider_sync`, не смешивается.

3. **Dashboard → pipeline connectivity.** Tunnel может упасть. Fire-and-forget + retry queue в `localStorage`, flush при следующем успешном коннекте.

4. **SDK bypass.** Если кто-то случайно импортнёт `from anthropic import` напрямую в каком-то новом файле — вся инструментация обходится. CI-guard обязателен.

5. **Pricing drift.** Поставщики меняют цены. Таблица в `pricing.py` должна обновляться при каждом анонсе. Reconciliation делит фазу: тестирует, не разъехались ли наши расчёты с биллингом провайдера.

6. **Мигрируемость SQLite.** Схема будет меняться. Используем `PRAGMA user_version` + ручные миграции в коде; Alembic overkill для одной таблицы расходов.

7. **Удаление старого FinanceEditor.** Пользователь хранил данные в `localStorage`. Перед удалением — миграционный скрипт: при первом запуске нового FinanceTab читаем старый `localStorage.makeitProjectFinances` и кидаем в `income` (если интерпретация корректна) или предлагаем ручной перенос.

### 10.2 Открытые вопросы (требуют решения перед стартом phase 1)

1. **Admin API keys.** Готов ли сгенерировать Admin API keys в консолях Anthropic и OpenAI? Положить в `~/.makeit-pipeline/.env` как `ANTHROPIC_ADMIN_KEY` и `OPENAI_ADMIN_KEY`. Без них работает только наша собственная инструментация (без сверки).

2. **Отдельные API-ключи под модули.** Создавать ли несколько API-ключей (pipeline / dashboard_verification / audit / transcription) чтобы получить module-breakdown напрямую из Anthropic Admin API? Или достаточно одного ключа и доверия нашему recorder'у?

3. **Историческая яма.** Вариант (a) — sync назад через billing API? Или (b) — считаем прошлое потерянным?

4. **Gemini.** Оставляем на ручной ввод в v1? Или сразу GCP Billing API (заметно больше работы: service account, IAM, BigQuery export)?

5. **Summary на главной.** Новый блок = процент задач + доход/расход/PnL за текущий месяц. Это ок, или нужна другая компоновка?

6. **FX для доходов.** Автоподтяжка курса к USD (например с `exchangerate.host`) или всегда ручной ввод? **Рекомендация:** авто с возможностью оверрайда поля при вводе.

7. **Audit instrumentation.** Код аудитора в отдельном репо `makeit-auditor`. Нужно либо подключить клиент `tracked_clients` там же (дублирование), либо гонять costs через HTTP `POST /finance/expense` из аудитора в pipeline API. **Рекомендация:** HTTP, меньше зависимостей.

---

## 11. Acceptance criteria v1

Система считается готовой, когда:

- [ ] SQLite БД создаётся и мигрирует автоматически при первом запуске pipeline API.
- [ ] Все API-вызовы из pipeline (dev, self_check, review, qa, merge) пишут события в `expenses` с корректным `module` и `project`.
- [ ] Debate/research/discovery/transcription пишут в `expenses` через recorder.
- [ ] Dashboard verification отправляет `POST /finance/expense` после каждого вызова Claude.
- [ ] CI блокирует прямой импорт anthropic/openai/gemini SDK вне `finance/tracked_clients.py`.
- [ ] Вкладка «Финансы» на дашборде показывает доходы, расходы (по модулям и провайдерам), подписки, PnL за месяц.
- [ ] CRUD доходов и подписок работает из UI и переживает рестарт pipeline API.
- [ ] Reconciliation sync с Anthropic и OpenAI Admin API работает, дельта отображается в UI.
- [ ] Summary на главной странице показывает live-цифры вместо хардкода.
- [ ] Тесты: recorder с моками SDK, store CRUD, pricing calculations, sync reconciliation с сохранённым fixture JSON.

---

## 12. Что нужно от оператора перед стартом

Критичные решения — без них Phase 1 не стартует:

1. Ответить на все 7 открытых вопросов из §10.2.
2. Сгенерировать Admin API keys (Anthropic + OpenAI) если вариант с reconciliation подтверждён.
3. Решить, нужны ли отдельные API-ключи per module.
4. Подтвердить, что старый `FinanceEditor` можно удалить после миграции данных.

После этого можно начинать Phase 1.
