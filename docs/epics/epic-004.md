# Epic-004: Server-side settings storage with end-to-end encryption

## Метаданные
- PRD: PRD-003
- Epic-issue: #132
- Milestone (dashboard): #4
- Milestone (pipeline): #33
- Дедлайн: 2026-05-17 (старт работ — после мержа PR #131 Project Health)
- Статус: planning
- Приоритет: P2-high
- Заменяет: issue #88

## Обзор

Перенос чувствительных API-ключей (GitHub PAT, Anthropic Claude key, BetterStack token) из localStorage каждого устройства в централизованное хранилище на стороне Pipeline API. Это закрывает все три AC из #88: открытие на новом устройстве не требует ручного ввода, ключи зашифрованы at-rest, понятный UX для ротации.

Связь с другими эпиками: makeit-pipeline получает новый модуль `settings_store` и endpoints — это первый случай введения persistent storage в Pipeline API.

## Архитектурные решения

| Решение | Выбор | Альтернативы | Почему |
|---------|-------|--------------|--------|
| Backend storage | Sqlite файл рядом с другими данными Pipeline mac | PostgreSQL, файловая БД (json) | Sqlite stdlib — нулевые operational costs, multi-user готовность по схеме, encryption выполняется на app-уровне (sqlcipher не нужен) |
| Шифрование | AES-GCM-256 на app-уровне через `cryptography` | sqlcipher, нет шифрования | AES-GCM даёт authenticated encryption (целостность + конфиденциальность), `cryptography` уже стандарт для Python |
| Master key | env-var `PIPELINE_SETTINGS_ENCRYPTION_KEY` на Pipeline mac | Derived from password, KMS, hardcoded | Простая операционная модель: ключ генерируется один раз через `openssl rand -base64 32`, кладётся в локальный `.env` Pipeline mac (`load_dotenv` уже встроен) |
| API auth | Bearer token (env `PIPELINE_SETTINGS_TOKEN`) на `/settings/*` endpoints | nginx basic-auth proxy, JWT, без auth | Минимальный delta — один env-var, без правки nginx; future-proof: при переходе на multi-user заменяем на JWT, схема БД уже по `username` |
| Bootstrap UX | Один токен в localStorage, prompt при первой загрузке | Master password каждый раз, OAuth | Минимальная фрикция: ввёл один раз на устройстве, всё подтянулось |
| Multi-user | Колонка `username` в схеме БД, сейчас всегда `default` | Single-tenant сейчас, переписывать потом | По требованию пользователя — потенциально будут другие юзеры. Дешевле заложить колонку чем мигрировать схему позже |
| Local dev | Pipeline API обязателен, без fallback на localStorage | Dev-mode fallback, mock | Fallback маскирует баги; Pipeline и так нужен для других фич dashboard |

## Изменения в БД

Новая таблица `user_settings` в новом файле `~/.makeit-pipeline/settings.db` (Pipeline mac):

```sql
CREATE TABLE user_settings (
  username TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted BLOB NOT NULL,  -- AES-GCM ciphertext
  nonce BLOB NOT NULL,             -- 12-byte GCM nonce
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username, key)
);

CREATE INDEX idx_user_settings_username ON user_settings(username);
```

Миграции: единичная инициализация через `CREATE TABLE IF NOT EXISTS` при старте Pipeline. Полноценный Alembic не нужен — таблица одна, эволюции схемы не предвидятся в этом эпике.

## API изменения (makeit-pipeline)

| Endpoint | Метод | Auth | Описание |
|----------|-------|------|----------|
| `/settings` | GET | Bearer | Возвращает все ключи текущего пользователя `{key: value, ...}` (расшифрованные значения, для bootstrap) |
| `/settings/{key}` | GET | Bearer | Одно значение (для UI правки) |
| `/settings/{key}` | PUT | Bearer | Создать/обновить значение. Body: `{"value": "..."}` |
| `/settings/{key}` | DELETE | Bearer | Удалить ключ |
| `/settings/keys` | GET | Bearer | Только список ключей (без значений) — для health/UI индикатора |

Bearer-token проверяется через FastAPI dependency. Имя пользователя сейчас всегда `default`; в будущем — из JWT claims.

## Frontend изменения (makeit-dashboard)

**Новые файлы:**
- `src/utils/settings.ts` — клиент Pipeline settings API + кэш в memory
- `src/components/SettingsPanel.tsx` — UI управления секретами

**Изменённые файлы:**
- `src/utils/github.ts` — чтение PAT через settings client (не localStorage)
- `src/utils/claude.ts` — чтение Claude key через settings client
- `src/utils/verify-agent.ts` — чтение Claude key через settings client
- `src/utils/betterstack.ts` — чтение BetterStack token через settings client
- Header / навигация — пункт «Настройки», убрать встроенные поля токенов из других мест
- `src/components/AuditPanel.tsx` (если есть инлайн ввод Claude key) — переключить на общую панель

**Хранение в localStorage:**
- Оставляем: `pipeline_settings_token` (bootstrap), UI-предпочтения (theme, last-tab)
- Удаляем при миграции: `github_token`, `anthropic_api_key`, `betterstack_token` (или какие там реальные ключи — определяется при выполнении Task-04)

## Влияние на существующий код

**Регрессии (риск):**
- Все вкладки, которые используют GitHub API (Дашборд, Проекты, Milestones, …) — после refactor должны продолжать работать. Mitigation: settings client кэширует значения в memory после bootstrap, контракт хука `useDashboard` и т.д. не меняется (только источник токена).
- При прерывании запроса settings API на старте dashboard не должен крашиться — error UI с retry.
- Миграция localStorage: идемпотентна, повторный запуск не теряет данных.

**Backward compat:**
- Старые версии dashboard (до этого эпика) продолжают читать localStorage. Они не видят server-side изменений — это известный trade-off, юзер обновляется и получает sync.

## Целостность бизнес-логики

Source of truth для каждого секрета: **Pipeline settings_store** (после миграции). Dashboard — только consumer. localStorage перестаёт быть source of truth для секретов.

Инварианты:
- Settings API НИКОГДА не возвращает значения без Bearer-token (код 401 без раскрытия информации)
- Master encryption key НИКОГДА не покидает Pipeline mac (нет endpoint для его чтения)
- При операции PUT — атомарная замена, partial write невозможен (sqlite транзакция)

Failure cases:
- Pipeline API недоступен → dashboard показывает диагностический экран с кнопками «Повторить» и «Проверить Pipeline». Никаких silent fallback.
- 401 от Pipeline (плохой Bearer) → prompt на ввод/исправление bootstrap-токена.
- 401 от external API (GitHub/Claude) → inline-toast «токен истёк, открыть Настройки» (FR-8).

## Задачи

| # | Задача | Репо | Issue | Зависимости | Параллельно | Размер |
|---|--------|------|-------|-------------|-------------|--------|
| 01 | Settings storage module — sqlite + AES-GCM | makeit-pipeline | #792 | — | да | M |
| 02 | Settings REST endpoints + Bearer auth | makeit-pipeline | #793 | 01 | нет | M |
| 03 | Dashboard settings client + bootstrap UX | makeit-dashboard | #133 | 02 | нет | S |
| 04 | Settings UI panel + рефакторинг потребителей | makeit-dashboard | #134 | 03 | нет | L |
| 05 | One-time миграция localStorage → server | makeit-dashboard | #135 | 03 | да (с 04) | S |

Критический путь: 01 → 02 → 03 → 04 (≈ 4-5 сессий)
Параллельно после 03: Task-05 (миграция) идёт независимо от Task-04 (UI), сольются в общем PR-цикле.
