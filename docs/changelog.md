# Changelog

## [Unreleased]
### Added
- Tab-навигация: Дашборд, Проекты, Milestones, Завершённые, Мониторинг, Аудит, Pipeline
- **Audit подсистема**: AuditTab, AuditProjectCard, AuditConfirmDialog, AuditIssuesDialog, AuditVerifyDialog
- Верификация audit findings через Claude (verification.ts, verify-agent.ts)
- Категоризация findings (bug, security, business_logic, architecture, performance, data_integrity)
- **Pipeline подсистема**: PipelineControlPanel с live timer и stage progress
- PipelineClosedChart — 7-дневный график задач, закрытых pipeline
- Подсветка pipeline-closed issues в графиках
- **Мониторинг**: UptimeBar (BetterStack API), CommitHeatmap (12 недель)
- **Milestones**: MilestoneCard, UrgentDeadlines, DeadlineBadge
- ClosedChart — график недавно закрытых issues
- StaleAlert — алерт для неактивных проектов
- ChatPanel / ChatButton — чат-интерфейс
- FinanceEditor — редактор финансов
- ErrorBoundary — error handling
- Новые hooks: useAudit, usePipeline, useMonitors, useChat
- Новые API клиенты: auditor.ts, pipeline.ts, betterstack.ts
- VPS deploy: Docker multi-stage + nginx proxy + runtime config
- Design system audit и consistency refactor

### Fixed
- Верификация: retry, abort propagation, index-based verdict lookup
- Pipeline timer: правильная длительность для задач с follow-up stages

## [0.1.0] — 2026-03-24
### Added
- Инициализация проекта
- React + TypeScript + Vite
- GitHub GraphQL API интеграция
- Карточки проектов с приоритетами и прогрессом
- Summary метрики
- Stacked bar chart
- Blocked items секция
- Фильтрация по проекту/приоритету/статусу
- Dark/light тема
- CI/CD: lint + build + GitHub Pages deploy
