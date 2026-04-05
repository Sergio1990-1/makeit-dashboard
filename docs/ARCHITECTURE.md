# Architecture

## Обзор
SPA с tab-навигацией. Данные из 4 источников: GitHub API, Auditor API, Pipeline API, BetterStack API.

```
Browser → React SPA → GitHub GraphQL API
                    → Auditor REST API (makeit-auditor)
                    → Pipeline REST API (makeit-pipeline)
                    → BetterStack Uptime API
                    ↓
              localStorage (GitHub PAT)
```

## Навигация (вкладки)
| Tab | Компонент | Описание |
|-----|-----------|----------|
| Дашборд | Summary, StackedChart, ClosedChart, BlockedItems | Общие метрики, графики, blocked issues |
| Проекты | ProjectCard, UptimeBar, CommitHeatmap | Карточки проектов с uptime и активностью |
| Milestones | MilestoneCard, UrgentDeadlines, DeadlineBadge | Открытые milestones, дедлайны |
| Завершённые | MilestoneCard | Закрытые milestones |
| Мониторинг | UptimeBar | Uptime всех сервисов (BetterStack) |
| Аудит | AuditTab, AuditProjectCard, AuditConfirmDialog, AuditIssuesDialog, AuditVerifyDialog | Code audit workflow |
| Pipeline | PipelineControlPanel, PipelineClosedChart | Pipeline задачи, live timer, stage progress |

## Компоненты (24 шт.)

### Core
- **TokenForm** — ввод/сброс GitHub PAT
- **Summary** — метрики: проекты, issues по статусам
- **ProjectCard** — карточка проекта: фаза, приоритеты, прогресс
- **Filters** — фильтрация по проекту/приоритету/статусу
- **ErrorBoundary** — error handling wrapper

### Графики и визуализация
- **StackedChart** — горизонтальная диаграмма распределения задач
- **ClosedChart** — график недавно закрытых issues
- **PipelineClosedChart** — 7-дневный график задач, закрытых pipeline (label `agent-completed`)
- **CommitHeatmap** — GitHub-style heatmap коммитов за 12 недель

### Pipeline
- **PipelineControlPanel** — панель управления pipeline: запуск задач, live timer, stage progress, duration tracking

### Audit
- **AuditTab** — главная вкладка аудита: выбор проекта, статус, findings
- **AuditProjectCard** — карточка проекта в Audit tab со статусом аудита
- **AuditConfirmDialog** — подтверждение запуска аудита (стоимость, timeout)
- **AuditIssuesDialog** — создание GitHub Issues из findings
- **AuditVerifyDialog** — верификация findings через Claude перед созданием issues

### Мониторинг
- **UptimeBar** — статус сервиса (up/down/paused), время последней проверки
- **StaleAlert** — алерт для проектов без недавней активности

### Milestones и проекты
- **MilestoneCard** — milestone с progress bar, issue tracking, deadline badge
- **UrgentDeadlines** — milestones с приближающимися дедлайнами
- **DeadlineBadge** — badge для отображения дедлайна

### Утилиты и UI
- **BlockedItems** — список заблокированных issues
- **ChatPanel** / **ChatButton** — чат-интерфейс
- **FinanceEditor** — редактор финансов/затрат

## Данные

### Hooks
- `useDashboard.ts` — проекты, issues, milestones, фильтры, метрики (GitHub GraphQL API)
- `useAudit.ts` — аудит проектов, запуск/отмена, findings, верификация (Auditor API)
- `usePipeline.ts` — pipeline задачи, polling статуса, live timer (Pipeline API)
- `useMonitors.ts` — uptime мониторы (BetterStack API)
- `useChat.ts` — чат-функциональность

### Utils
- `config.ts` — список проектов (хардкод), monitor matching rules
- `github.ts` — GraphQL клиент, загрузка из Projects V2
- `auditor.ts` — REST клиент для Auditor API (run, status, findings, verification, meta)
- `pipeline.ts` — REST клиент для Pipeline API (tasks, stages)
- `betterstack.ts` — BetterStack Uptime API клиент
- `verification.ts` — оркестрация верификации findings (batch processing, progress)
- `verify-agent.ts` — Claude-агент: читает код из GitHub, выносит verdict (CONFIRMED/FALSE_POSITIVE/UNCERTAIN)
- `claude.ts` — Claude API интеграция
- `github-actions.ts` — GitHub API для чтения файлов из репозитория
- `riskScore.ts` — расчёт risk score для аудитов

## Темизация
CSS custom properties. Автопереключение dark/light по `prefers-color-scheme`.
