# Task-05: One-time миграция localStorage → server

## Метаданные
- Epic: epic-004
- Repo: **makeit-dashboard**
- GitHub Issue: #135
- Приоритет: P2-high
- Зависит от: Task-03 (settings client)
- Параллельно: с Task-04
- Размер: S (~50 строк + тесты)

## Описание

Автоматический one-time перенос секретов из localStorage на сервер при первой загрузке dashboard у существующих пользователей. После успешной миграции localStorage очищается от секретов (но не от UI-настроек).

### Что нужно сделать

1. **Модуль `src/utils/settings-migration.ts`:**
   ```ts
   const LEGACY_KEYS: Array<{ legacyKey: string; settingsKey: SettingsKey }> = [
     { legacyKey: 'github_token', settingsKey: 'github_token' },
     { legacyKey: 'anthropic_api_key', settingsKey: 'anthropic_api_key' },
     { legacyKey: 'betterstack_token', settingsKey: 'betterstack_token' },
     // [после grep-а реальных ключей в коде дополнить]
   ];

   const MIGRATION_FLAG = 'settings_migration_v1_done';

   export async function runOneTimeMigration(): Promise<{
     migrated: string[];
     skipped: string[];
     failed: string[];
   }>;
   ```

2. **Алгоритм:**
   - Если `localStorage.getItem(MIGRATION_FLAG) === 'true'` — выйти сразу (idempotent)
   - Прочитать существующие ключи на сервере через `listSettingsKeys()` — для каждого, если уже есть на сервере → skip (не перезаписываем сервер локальным значением)
   - Для каждого legacy-ключа:
     - Если `localStorage.getItem(legacyKey)` пустой → skip
     - Если уже на сервере → skip + удалить из localStorage
     - Иначе → `setSetting(settingsKey, value)`, при успехе → `localStorage.removeItem(legacyKey)`
   - В конце ставим `localStorage.setItem(MIGRATION_FLAG, 'true')` ТОЛЬКО если `failed.length === 0`. При partial failure флаг НЕ ставим — на следующем page load миграция повторится для оставшихся keys (transient network/5xx не должен permanently suppress retries).
   - При любой ошибке для конкретного ключа — записать в `failed[]`, не прерывать общий процесс

3. **Запуск:**
   - Из `App.tsx` после `useSettings().ready === true`, единожды
   - Результат логировать в console.info: `migration: migrated=2, skipped=1, failed=0`
   - При `failed.length > 0` — показать toast «Не все ключи мигрированы, проверьте Настройки»

4. **Идемпотентность и безопасность:**
   - Флаг `settings_migration_v1_done` гарантирует один прогон. Если нужен re-migration в будущем — введём `_v2`.
   - При очистке `localStorage` — НЕ трогаем `pipeline_settings_token` (bootstrap), `settings_migration_v1_done`, UI-настройки, `theme`, `last-tab` и подобное.
   - Если `setSetting` падает (не 401, а network/5xx) — НЕ удалять из localStorage (данные не потеряны).

5. **Поиск реальных legacy-ключей:**
   - Перед написанием кода: `grep -rn "localStorage" src/` — найти все актуальные имена ключей токенов
   - Список выше — кандидат, но реальный список нужно подтвердить кодом
   - Расходящиеся имена (`gh_pat` vs `github_token`) — явно перечислить с комментарием

## Контекст для Claude Code

Прочитай перед работой:
- `docs/epics/epic-004.md` — секция «FR-6», «Влияние на существующий код»
- `src/utils/settings.ts` (Task-03)
- `src/App.tsx` (где запустить миграцию)
- `grep -rn "localStorage.*token\|localStorage.*api_key\|localStorage.*PAT" src/` — реальные ключи

## Критерии выполнения

- [ ] `src/utils/settings-migration.ts` создан
- [ ] Один прогон при `MIGRATION_FLAG` отсутствует, повторный запуск — no-op
- [ ] При наличии ключа на сервере локальный не перезаписывает серверный
- [ ] localStorage очищается только от тех legacy-ключей, которые успешно сохранились на сервер
- [ ] Bootstrap-токен и UI-предпочтения не затрагиваются
- [ ] Тесты на migration: pre-условия (legacy в LS, нет на сервере) → post (нет в LS, есть на сервере), idempotent re-run
- [ ] `npx tsc --noEmit` чисто
- [ ] `npm run lint` чисто
- [ ] Manual test: положить mock-токены в localStorage → загрузить dashboard → проверить что мигрировано и localStorage очищено
