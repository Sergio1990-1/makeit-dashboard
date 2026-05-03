# Task-01: Settings storage module (sqlite + AES-GCM)

## Метаданные
- Epic: epic-004
- Repo: **makeit-pipeline**
- GitHub Issue: makeit-pipeline#792
- Приоритет: P2-high
- Зависит от: —
- Параллельно: да (с другими epic-004 задачами не пересекается на старте)
- Размер: M (~150 строк + тесты)

## Описание

Создать модуль `src/makeit_pipeline/settings_store.py` — изолированный слой работы с зашифрованным хранилищем секретов. Никаких HTTP/FastAPI — только pure Python API.

### Что нужно создать

1. **Sqlite storage:**
   - Таблица `user_settings (username, key, value_encrypted BLOB, nonce BLOB, updated_at)`, PK `(username, key)`
   - Файл БД: `~/.makeit-pipeline/settings.db` (создаётся при первом доступе, директория тоже)
   - `CREATE TABLE IF NOT EXISTS` при инициализации (без Alembic — таблица одна)

2. **Шифрование (AES-GCM-256):**
   - Master key читается из env `PIPELINE_SETTINGS_ENCRYPTION_KEY` (base64, 32 байта после декодирования)
   - При отсутствии env — `RuntimeError` с понятным сообщением (как сгенерировать)
   - Используем `cryptography.hazmat.primitives.ciphers.aead.AESGCM`
   - Для каждого PUT генерируется свежий 12-байтный nonce (`secrets.token_bytes(12)`)
   - AAD не используется (одной authenticated шифровки достаточно)

3. **Public API модуля:**
   ```python
   class SettingsStore:
       def __init__(self, db_path: Path | None = None, encryption_key: bytes | None = None) -> None: ...
       def get(self, username: str, key: str) -> str | None: ...
       def get_all(self, username: str) -> dict[str, str]: ...
       def list_keys(self, username: str) -> list[str]: ...
       def put(self, username: str, key: str, value: str) -> None: ...
       def delete(self, username: str, key: str) -> bool: ...  # True если удалили
   ```
   Никаких глобальных синглтонов — экземпляр создаётся в `api.py` при старте и инжектится через FastAPI dependency.

4. **Зависимости:**
   - Проверить наличие `cryptography` в `pyproject.toml`. Если нет — добавить (`cryptography>=42`).

## Контекст для Claude Code

Прочитай перед работой:
- `CLAUDE.md` (makeit-pipeline)
- `docs/epics/epic-004.md` (makeit-dashboard) — секция «Изменения в БД» и «Архитектурные решения»
- `src/makeit_pipeline/api.py` (структура проекта, как организованы модули)
- `pyproject.toml` (текущие зависимости)

## Критерии выполнения

- [ ] Файл `src/makeit_pipeline/settings_store.py` создан
- [ ] Модуль не импортирует FastAPI (чистый storage слой)
- [ ] При отсутствии `PIPELINE_SETTINGS_ENCRYPTION_KEY` — понятная ошибка с инструкцией генерации
- [ ] Для каждого PUT — свежий nonce (никогда не переиспользуется на одну и ту же запись)
- [ ] Round-trip: `put("default", "k", "v") → get("default", "k") == "v"` для разных размеров значений (10 байт, 1 KB, 10 KB)
- [ ] При попытке расшифровать с неправильным ключом — выбрасывается исключение (а не возвращается garbage)
- [ ] Тесты `tests/test_settings_store.py`: round-trip, list_keys без значений, delete, multi-user isolation, invalid key → exception
- [ ] `ruff check . && ruff format --check .` чисто
- [ ] `pytest tests/test_settings_store.py -x -q` зелёный
