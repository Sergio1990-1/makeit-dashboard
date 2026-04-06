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
  components/       — React-компоненты (29 шт., см. docs/ARCHITECTURE.md)
  hooks/            — Custom hooks:
    useDashboard.ts   — проекты, фильтры, метрики (GitHub API)
    useAudit.ts       — запуск аудитов, статус, findings (Auditor API)
    usePipeline.ts    — pipeline задачи, live timer (Pipeline API)
    useMonitors.ts    — uptime мониторы (BetterStack API)
    useChat.ts        — чат-интерфейс
  types/            — TypeScript типы
  utils/            — Клиенты API и утилиты:
    config.ts         — список проектов (хардкод)
    github.ts         — GraphQL клиент, загрузка из Projects V2
    auditor.ts        — Auditor REST API клиент
    pipeline.ts       — Pipeline REST API клиент
    transcript.ts     — Transcript API клиент (Pipeline backend)
    transcript-markdown.ts — Markdown-рендеринг BRIEF (DOMPurify + marked)
    betterstack.ts    — BetterStack Uptime API клиент
    verification.ts   — оркестрация верификации audit findings
    verify-agent.ts   — Claude-агент для верификации отдельного finding
    claude.ts         — Claude API интеграция
    github-actions.ts — GitHub Actions API (чтение файлов из репо)
    riskScore.ts      — расчёт risk score для аудитов
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
- SPA с tab-навигацией (8 вкладок: Дашборд, Проекты, Milestones, Завершённые, Мониторинг, Pipeline, Транскрипты, Аудит)
- GitHub PAT хранится в localStorage
- Данные загружаются при открытии + по кнопке «Обновить»
- Проекты захардкожены в src/utils/config.ts

## Источники данных
- **GitHub GraphQL API** — проекты, issues, milestones, коммиты
- **Auditor API** (`AUDITOR_URL`) — запуск аудитов, findings, верификация
- **Pipeline API** (`PIPELINE_URL`) — pipeline задачи, статус, stage progress, транскрипция аудио
- **BetterStack API** — uptime мониторинг сервисов
- **Claude API** — верификация audit findings (browser-side)

## Подсистемы
- **Audit** — запуск code audit, просмотр findings по категориям, верификация через Claude, создание GitHub Issues
- **Pipeline** — управление pipeline задачами, live timer, stage progress, 7-дневный график закрытых задач
- **Transcripts** — загрузка аудио/текста, транскрипция (OpenAI Whisper), LLM-обработка → BRIEF.md с решениями/требованиями. Редактор с live preview, история обработок, гранулярный прогресс
- **Monitoring** — uptime сервисов (BetterStack), commit heatmap, stale alerts
- **Milestones** — open/done milestones, urgent deadlines, progress tracking

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

### Деплой на VPS (одна команда)
```bash
ssh root@89.167.17.79 bash /opt/apps/makeit-stack/deploy.sh
```
Скрипт: git pull обоих репо → docker compose build → up -d → restart nginx → проверка 4 сервисов (Dashboard, Auditor, Cache, Pipeline tunnel).

Репозитории на сервере клонированы через SSH (`git@github.com:Sergio1990-1/...`).

### Pipeline Mac (двухмаковая архитектура)
- Pipeline API (makeit-pipeline) работает на отдельном Mac (sergeymakarov)
- Запускается через macOS LaunchAgent (`com.makeit.pipeline-api`)
- SSH reverse tunnel (`com.makeit.pipeline-tunnel`) пробрасывает порт 8766 на VPS
- `load_dotenv()` встроен в `api.py`, ручной source .env не нужен
- Обновление pipeline: `git pull` + перезапуск LaunchAgent на pipeline Mac
- Pipeline Mac НЕ деплоится через VPS deploy.sh — обновляется отдельно

## Важно
- Не коммитить .env файлы
- GitHub token — только в localStorage, никогда в коде
- base path для GitHub Pages: настроить в vite.config.ts (env `VITE_BASE`)
