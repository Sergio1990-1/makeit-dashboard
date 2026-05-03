# Task-01: URL persistence для selectedRepo

## Метаданные
- Epic: epic-008
- GitHub Issue: #156
- Приоритет: P3-medium
- Зависит от: —
- Параллельно: да
- Размер: S (~50 строк)

## Описание
Refresh страницы на Health-странице сейчас возвращает к списку. Нужно сохранять `selectedRepo` в URL.

В `src/components/v4/ProjectsView.tsx`:
1. На mount: читаем `URLSearchParams.get('repo')`. Если есть — `setSelectedRepo(value)`.
2. Когда `selectedRepo` меняется — `history.pushState({repo}, '', '?repo=' + repo)` (или `?` без параметра при null).
3. Слушатель `popstate` — синхронизирует state с URL (back/forward кнопки).

Не подключаем react-router — лишняя зависимость для одного use-case.

## Контекст для Claude Code
Прочитай:
- `src/components/v4/ProjectsView.tsx` — текущая state логика
- MDN: history.pushState, popstate

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Открыл Health Beer_bot → URL `?repo=Beer_bot` → refresh → Beer_bot всё ещё открыт
- [ ] Browser Back возвращает к списку проектов
- [ ] Browser Forward возвращает обратно к Health Beer_bot
- [ ] При смене вкладки (Дашборд, Milestones и т.д.) — `?repo=` не остаётся (очищается)
