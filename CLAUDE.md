# MakeIT Dashboard

## Проект
Live-дашборд по всем проектам MakeIT. Данные из GitHub Projects API.

## Стек
- React 19 + TypeScript + Vite
- GitHub GraphQL API (без backend, без БД)
- CSS (custom properties, dark/light theme)
- Deploy: GitHub Pages + VPS (Docker)

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

## Deploy

### GitHub Pages (основной)
- base path: `/makeit-dashboard/` (vite.config.ts)
- CI/CD: `.github/workflows/ci.yml`

### VPS (89.167.17.79)
- Docker: `Dockerfile` (multi-stage: node build → nginx)
- Compose: `/opt/apps/makeit-stack/docker-compose.yml`
- Nginx proxy: `/opt/apps/nginx-proxy/conf.d/makeit.conf`
- Basic Auth: admin/пароль в `.htpasswd`
- Runtime config: `/opt/apps/makeit-stack/config.js` (подменяет API URLs)

### Runtime Config (API URLs)
- `public/config.js` — задаёт `window.__MAKEIT_CONFIG__`
- На VPS монтируется отдельный `config.js` с серверными URL
- `AUDITOR_URL` и `PIPELINE_URL` читаются в `auditor.ts` / `pipeline.ts`
- Дефолт: `localhost:8765` / `localhost:8766` (для локальной разработки)

### Пересборка на VPS
```bash
ssh root@89.167.17.79
cd /opt/apps/makeit-stack
# обновить код:
cd makeit-dashboard && git pull && cd ..
# или rsync с Mac:
# rsync -az --exclude='.git' --exclude='node_modules' --exclude='dist' ~/Desktop/makeit-dashboard/ root@89.167.17.79:/opt/apps/makeit-stack/makeit-dashboard/
docker compose build dashboard && docker compose up -d dashboard
```

## Важно
- Не коммитить .env файлы
- GitHub token — только в localStorage, никогда в коде
- base path для GitHub Pages: настроить в vite.config.ts (env `VITE_BASE`)
