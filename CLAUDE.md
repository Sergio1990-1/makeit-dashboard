# MakeIT Dashboard

## Проект
Live-дашборд по всем проектам MakeIT. Данные из GitHub Projects API.

## Стек
- React 19 + TypeScript + Vite
- GitHub GraphQL API (без backend, без БД)
- CSS (custom properties, dark/light theme)
- Deploy: GitHub Pages

## Структура
```
src/
  components/   — React-компоненты (TokenForm, Summary, ProjectCard, etc.)
  hooks/        — Custom hooks (useDashboard)
  types/        — TypeScript типы
  utils/        — Config проектов, GitHub API client
```

## Запуск
```bash
npm install
npm run dev        # dev-сервер на localhost:5173
npm run build      # production build → dist/
```

## Конвенции
- Conventional Commits: feat:, fix:, docs:, chore:
- Язык кода: English
- Язык UI/docs: Русский
- Линтер: ESLint (Vite default config)
- Форматирование: Prettier (если установлен)

## Тестирование
```bash
npm run lint       # ESLint
npx tsc --noEmit   # Type check
npm run build      # Build check
```

## Архитектура
- SPA без роутинга
- GitHub PAT хранится в localStorage
- Данные загружаются при открытии + по кнопке «Обновить»
- Проекты захардкожены в src/utils/config.ts
- Фильтрация: по проекту, приоритету, статусу

## Важно
- Не коммитить .env файлы
- GitHub token — только в localStorage, никогда в коде
- base path для GitHub Pages: настроить в vite.config.ts если нужно
