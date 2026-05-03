# Task-02: Settings REST endpoints + Bearer auth

## Метаданные
- Epic: epic-004
- Repo: **makeit-pipeline**
- GitHub Issue: makeit-pipeline#793
- Приоритет: P2-high
- Зависит от: Task-01 (модуль `settings_store`)
- Параллельно: нет
- Размер: M (~120 строк + тесты)

## Описание

Подключить storage модуль из Task-01 к FastAPI и добавить Bearer-token защищённые endpoints для dashboard.

### Что нужно сделать

1. **Bearer-auth dependency** (`src/makeit_pipeline/auth_settings.py` или в `api.py`):
   - Читает `PIPELINE_SETTINGS_TOKEN` из env (через `load_dotenv` который уже встроен)
   - Сравнивает с заголовком `Authorization: Bearer <token>` через `secrets.compare_digest`
   - 401 без подсказок если не совпало или header отсутствует
   - Возвращает текущее имя пользователя — сейчас всегда `"default"` (TODO-комментарий: «replace with JWT claims at multi-user epic»)

2. **Endpoints в `api.py`:**
   - `GET /settings` → `get_all(username)` → `{key: value, ...}`
   - `GET /settings/keys` → `list_keys(username)` → `{"keys": [...]}` (без значений)
   - `GET /settings/{key}` → `get(username, key)` → `{"value": "..."}`, 404 если ключа нет
   - `PUT /settings/{key}` body `{"value": "..."}` → `put(username, key, value)` → 204
   - `DELETE /settings/{key}` → `delete(username, key)` → 204 если удалили, 404 если не было

3. **Lifecycle:**
   - `SettingsStore` создаётся в `_lifespan` (см. `create_app` в `api.py`)
   - Инжектится через FastAPI `Depends`
   - При старте — лог `"settings_store initialized: <db_path>, encryption=on"`

4. **Логирование (FR-9):**
   - Каждый PUT/DELETE/GET — лог через существующий logger: `settings_access user=default action=put key=github_token` (БЕЗ значения)
   - Errors (decryption fail, db error) — WARN с deталями

5. **Безопасность:**
   - `value` в response теле — только из `GET /settings` и `GET /settings/{key}`. В лог никогда.
   - При ошибке не раскрывать наличие/отсутствие master key или содержимое БД.

## Контекст для Claude Code

Прочитай перед работой:
- `src/makeit_pipeline/settings_store.py` (Task-01 результат)
- `src/makeit_pipeline/api.py` — особенно `create_app`, `_lifespan`, как уже сделаны другие endpoints
- `docs/epics/epic-004.md` (makeit-dashboard) — таблица API endpoints

## Критерии выполнения

- [ ] Все 5 endpoints работают (curl tests с правильным Bearer проходят)
- [ ] `curl /settings` без Authorization → 401
- [ ] `curl /settings` с неправильным Bearer → 401
- [ ] PUT-GET round-trip через HTTP даёт исходное значение
- [ ] DELETE на отсутствующем ключе → 404
- [ ] OpenAPI (`/docs`) показывает endpoints в категории Settings
- [ ] Логи содержат `settings_access` записи без значений
- [ ] Тесты `tests/test_settings_api.py`: auth (401), happy path PUT-GET-DELETE, не-существующий ключ, multi-user isolation (если возможно эмулировать)
- [ ] `ruff check . && ruff format --check .` чисто
- [ ] Документ `docs/runbook-settings.md` (или дополнение существующего runbook): как сгенерировать `PIPELINE_SETTINGS_TOKEN` и `PIPELINE_SETTINGS_ENCRYPTION_KEY`, куда положить, как ротировать
