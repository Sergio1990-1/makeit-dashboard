# Task-03: Dashboard settings client + bootstrap UX

## Метаданные
- Epic: epic-004
- Repo: **makeit-dashboard**
- GitHub Issue: #133
- Приоритет: P2-high
- Зависит от: Task-02 (рабочие endpoints)
- Параллельно: нет (блокирует Task-04 и Task-05)
- Размер: S (~80 строк + тесты)

## Описание

Создать `src/utils/settings.ts` — клиент Pipeline settings API с in-memory кешем и bootstrap-token flow.

### Что нужно сделать

1. **Клиент `settings.ts`:**
   ```ts
   export type SettingsKey = 'github_token' | 'anthropic_api_key' | 'betterstack_token';

   export async function loadAllSettings(): Promise<Record<string, string>>;
   export async function getSetting(key: SettingsKey): Promise<string | null>;
   export async function setSetting(key: SettingsKey, value: string): Promise<void>;
   export async function deleteSetting(key: SettingsKey): Promise<void>;
   export async function listSettingsKeys(): Promise<string[]>;

   export function getBootstrapToken(): string | null;  // из localStorage
   export function setBootstrapToken(token: string): void;
   export function clearBootstrapToken(): void;
   ```

   - Все запросы используют `${PIPELINE_BASE_URL}/settings/...` с заголовком `Authorization: Bearer ${getBootstrapToken()}`
   - In-memory кеш `Map<string, string>` для значений (заполняется одним `loadAllSettings()` на старте, обновляется на set/delete)
   - При 401 — вызывается `clearBootstrapToken()` и бросается `new SettingsAuthError()` (отдельный класс)
   - При 5xx или network — бросается `new SettingsUnavailableError()`

2. **Bootstrap UI компонент `SettingsBootstrap.tsx`:**
   - Если `getBootstrapToken()` пустой ИЛИ последний запрос вернул `SettingsAuthError` — рендерится вместо основного приложения
   - Поле ввода токена + кнопка «Подключить»
   - При ОК сохраняет токен и пытается `loadAllSettings()` — если успех, показывает основной app
   - Краткая инструкция как получить токен (ссылка на runbook)

3. **Глобальный provider/hook `useSettings()` (или просто экспортировать функции):**
   - Минимальный API: `useSettings()` возвращает `{ ready, error, retry }`
   - В `App.tsx` обернуть основное приложение: пока не ready — показать `SettingsBootstrap` или error UI
   - Если `error instanceof SettingsUnavailableError` — диагностический экран «Pipeline недоступен» с кнопкой retry

4. **НЕ делать в этой задаче:**
   - Не трогать существующих потребителей (`utils/github.ts`, `claude.ts`, `betterstack.ts`) — это Task-04
   - Не делать миграцию localStorage — это Task-05
   - Не строить полную панель управления настройками — только bootstrap flow

## Контекст для Claude Code

Прочитай перед работой:
- `docs/epics/epic-004.md` — секция «Frontend изменения»
- `src/utils/pipeline.ts` (паттерн fetch к Pipeline API, использование `PIPELINE_BASE_URL`)
- `src/App.tsx` (где обернуть provider)
- Task-02 OpenAPI — формат body/responses

## Критерии выполнения

- [ ] `src/utils/settings.ts` создан, все экспорты с типами
- [ ] Bearer-token берётся из localStorage (`pipeline_settings_token`)
- [ ] In-memory кеш работает — повторные `getSetting` не делают новых HTTP-запросов
- [ ] При 401 кеш очищается и `clearBootstrapToken()` вызывается
- [ ] `SettingsBootstrap` компонент рендерится при отсутствии/невалидности токена
- [ ] Диагностический экран при недоступности Pipeline (кнопка retry работает)
- [ ] `npx tsc --noEmit` чисто
- [ ] `npm run lint` чисто
- [ ] Smoke test через preview: ввести валидный токен → попасть в основной app; ввести невалидный → остаться на bootstrap
