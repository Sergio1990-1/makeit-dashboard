# Architecture

## Обзор
Чистый фронтенд SPA. Нет backend, нет БД. Данные из GitHub API.

```
Browser → React SPA → GitHub GraphQL API
                    ↓
              localStorage (token)
```

## Компоненты
- **TokenForm** — ввод/сброс GitHub PAT
- **Summary** — метрики: проекты, issues по статусам
- **ProjectCard** — карточка проекта: фаза, приоритеты, прогресс
- **Filters** — фильтрация по проекту/приоритету/статусу
- **StackedChart** — горизонтальная диаграмма распределения
- **BlockedItems** — список заблокированных issues

## Данные
- `utils/config.ts` — список проектов (хардкод)
- `utils/github.ts` — GraphQL клиент, загрузка из Projects V2
- `hooks/useDashboard.ts` — state management, фильтры, метрики

## Темизация
CSS custom properties. Автопереключение dark/light по `prefers-color-scheme`.
