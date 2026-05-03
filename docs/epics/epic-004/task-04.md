# Task-04: Settings UI panel + рефакторинг потребителей

## Метаданные
- Epic: epic-004
- Repo: **makeit-dashboard**
- GitHub Issue: #134
- Приоритет: P2-high
- Зависит от: Task-03 (settings client)
- Параллельно: с Task-05
- Размер: L (~250 строк + рефакторинг 5-7 файлов)

## Описание

UI-панель управления секретами и миграция всех существующих потребителей токенов на settings client.

### Что нужно сделать

1. **Компонент `src/components/SettingsPanel.tsx`:**
   - Список ключей: GitHub PAT, Anthropic Claude key, BetterStack token (управляемый через константу `MANAGED_KEYS`)
   - Для каждого ключа: маскированный показ (последние 4 символа), кнопка «Изменить», кнопка «Очистить»
   - Кнопка «Изменить» открывает inline-форму с полем ввода (type=password), submit делает `setSetting(key, value)` через клиент Task-03
   - Индикатор синхронизации: zеленая точка «синхронизировано», серая «загрузка», красная «ошибка»
   - Кнопка «Сменить bootstrap-токен» (`clearBootstrapToken()` + reload)
   - Раздел «Опасная зона»: «Очистить все секреты на сервере»

2. **Точка входа:**
   - Добавить пункт «Настройки» в основную навигацию (Header или TabNav, в зависимости от текущей структуры)
   - Альтернативно (если согласовано в реализации): иконка ⚙️ в правом верхнем углу

3. **Рефакторинг потребителей** — заменить чтение localStorage на `getSetting()`:
   - `src/utils/github.ts` — использовать `getSetting('github_token')`. Хук `useDashboard` уже передаёт токен — сохранить контракт, но источник токена меняется.
   - `src/utils/claude.ts` и `src/utils/verify-agent.ts` — `getSetting('anthropic_api_key')`
   - `src/utils/betterstack.ts` — `getSetting('betterstack_token')`
   - Удалить старые input-поля токенов из других мест (Header, AuditPanel и т.п.) — единая точка ввода теперь в SettingsPanel

4. **FR-8 — обработка истёкших токенов:**
   - При получении 401 от GitHub/Claude/BetterStack — глобальный обработчик показывает toast «Токен GitHub истёк» с кнопкой «Открыть Настройки»
   - Реализация: обернуть fetch-функции в utils/* в общий wrapper или диспатчить custom event, который слушает SettingsPanel

5. **Контракт хуков:**
   - `useDashboard(token)` и подобные — продолжают принимать token как параметр (не ломаем)
   - На уровне App.tsx: после `useSettings().ready === true` читаем `getSetting('github_token')` синхронно из кеша и передаём в хуки. До ready — App не рендерится (Task-03 уже это обеспечивает).

## Контекст для Claude Code

Прочитай перед работой:
- `docs/epics/epic-004.md` — секции «Frontend изменения», «Влияние на существующий код»
- `src/utils/settings.ts` (Task-03)
- Все файлы из списка рефакторинга — посмотреть текущие места чтения localStorage
- `src/App.tsx`, `src/hooks/useDashboard.ts` — flow прокидывания токена
- `src/components/` — найти текущие компоненты с input-полями токенов (`grep -rn "localStorage.*token\|token.*localStorage\|github_token" src/`)

## Критерии выполнения

- [ ] `SettingsPanel.tsx` создан со всеми операциями (list, set, delete, clear-all)
- [ ] Маскирование значений работает (никогда не показываем полный токен на дисплее без явного раскрытия)
- [ ] Все потребители читают из settings client, прямой `localStorage.getItem('github_token')` и т.д. удалён из кодa (кроме файла миграции из Task-05)
- [ ] FR-8 — toast при 401 от внешнего API с кнопкой «Открыть Настройки» работает хотя бы для GitHub
- [ ] `npx tsc --noEmit` чисто
- [ ] `npm run lint` чисто
- [ ] `npm run build` зелёный
- [ ] Manual test через preview: ввод нового токена в панели → reload → токен сохранился, dashboard работает
- [ ] Manual test: подменить токен на невалидный → dashboard показывает error → toast «токен истёк» с кнопкой «Открыть Настройки»
- [ ] Скриншот SettingsPanel приложить в PR
