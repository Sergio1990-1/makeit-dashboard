# MakeIT Dashboard

Live-дашборд по всем проектам MakeIT — данные из GitHub Projects API, карточки проектов, приоритеты, прогресс, blocked items.

## Quick Start

```bash
npm install
npm run dev
```

Откройте http://localhost:5173, введите GitHub Personal Access Token (scopes: `repo`, `read:project`).

## Возможности

- Summary метрики: Todo / In Progress / Review / Done
- Карточки проектов с приоритетами P1-P4 и прогресс-баром
- Stacked bar chart по распределению задач
- Blocked items — все заблокированные issues
- Фильтрация по проекту / приоритету / статусу
- Тёмная/светлая тема (по системной настройке)
- Респонсив: desktop + планшет

## Стек

- React + TypeScript + Vite
- GitHub GraphQL API
- CSS custom properties
- GitHub Pages (deploy)

## Разработка

```bash
npm run dev      # dev-сервер
npm run build    # production build
npm run lint     # ESLint
make check       # lint + typecheck + build
```
