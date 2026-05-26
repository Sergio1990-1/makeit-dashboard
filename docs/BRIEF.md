# BRIEF: makeit-dashboard

## Проект
- Репозиторий: Sergio1990-1/makeit-dashboard
- Клиент: внутренний (PORTFOLIO.md — тип «Свой», Tier 3)

## Цель
Единый live-дашборд по всем проектам MakeIT: статус, приоритеты, заблокированные задачи, аудит, pipeline, мониторинг — в одном SPA с 12 вкладками и 5 внешними API.

## Контекст
Данные по проектам разбросаны по GitHub — нет единой картины. Дашборд — control tower портфеля MakeIT. Развитие: март (инициация + базовые вкладки), апрель (Transcripts + Pipeline chart + BetterStack), май (Epic-010/011/012 — design tokens, Quality, Codex-Quality, Debate).

## Пользователь
- Роль: команда MakeIT (оператор портфеля)
- Сценарий: вместо обхода каждого репозитория — один SPA со сводными метриками, drift-сигналами, аудитом, pipeline, транскриптами, исследованиями, quality-метриками

## Scope

### Входит (из `src/App.tsx` VALID_TABS — 12 вкладок реализованы)
- Дашборд (summary метрики, stacked / closed charts, blocked items)
- Проекты (карточки с приоритетами P1-P4, прогресс, uptime, commit heatmap 12 нед)
- Milestones (open + done, deadline badges, urgent warnings)
- Мониторинг (BetterStack uptime по сервисам)
- Аудит (запуск, findings по категориям, Claude verification, создание GitHub Issues)
- Pipeline (control, live timer, stage progress, 7-дневный chart)
- Транскрипты (Whisper API → LLM → BRIEF.md с редактором marked + DOMPurify)
- Исследование, Спецификации, Качество кода, Codex-Quality, Debate

### Интеграции (5 API, см. `src/utils/`)
- GitHub GraphQL (Projects V2 #1 Sergio1990-1)
- Auditor REST (localhost:8765 dev / VPS prod через config.js runtime)
- Pipeline REST (localhost:8766 dev через SSH tunnel на Mac)
- BetterStack Uptime (через Cloudflare Worker proxy для CORS)
- Claude API (`@anthropic-ai/sdk` v0.80.0, browser-side)

### Не входит (по отсутствию реализации в коде)
- Multi-user — single operator (GitHub PAT в localStorage)
- Native mobile app — только PWA responsiveness
- Real-time sync — refresh по кнопке, без WebSocket

### Уточнения для владельца
- Auto-fix audit findings — сейчас только создание GitHub Issues; авто-правка кода в scope?
- Auth для Auditor/Pipeline API — сейчас предполагается nginx basic auth, нет OAuth в коде; это намеренно?
- Async file uploads для Transcripts — сейчас синхронная загрузка без прогресс-бара; критично для больших файлов?

## Источник
Собственная идея (внутренний инструмент). Первый коммит 2026-03-25.

## Commitments
Внутренний Tier-3 инструмент — нет клиентских commitments с дедлайнами. Развитие через internal sprints (Epic-010/011/012 на май 2026 — design tokens + quality). Файл `docs/commitments.yaml` содержит placeholder, реальных дат нет.

## Особое замечание: `docs/business_process.yaml`
Дашборд содержит `business_process.yaml` (3 процесса: delivery end-to-end, pipeline auto-dev, +1) — необычно для simple-проекта. Причина: дашборд **визуализирует и оркестрирует** процессы ДРУГИХ проектов, не описывает свой собственный workflow разработки. Это exception, не нарушение классификации.
