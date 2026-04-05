# Overview

## Что это
MakeIT Dashboard — внутренний инструмент для мониторинга всех проектов MakeIT в одном интерфейсе.

## Для кого
Для команды MakeIT — видеть текущий статус всех проектов, приоритеты, заблокированные задачи.

## Проблема
Данные по проектам разбросаны по GitHub — нужно заходить в каждый проект отдельно. Нет единой картины.

## Решение
SPA-дашборд с 7 вкладками, который собирает данные из нескольких источников и показывает в удобном виде.

## Возможности
- **Дашборд** — summary метрики, stacked chart, закрытые issues, blocked items
- **Проекты** — карточки проектов с приоритетами, прогрессом, uptime и commit heatmap
- **Milestones** — открытые milestones с progress bar и urgent deadlines
- **Мониторинг** — uptime всех сервисов через BetterStack
- **Аудит** — запуск code audit (makeit-auditor), просмотр findings по категориям, верификация через Claude, создание GitHub Issues
- **Pipeline** — управление dev pipeline (makeit-pipeline), live timer, stage progress, график закрытых задач

## Источники данных
- **GitHub Projects V2** — project #1, owner Sergio1990-1 (проекты, issues, milestones)
- **Auditor API** (makeit-auditor) — code audit: findings, categories, verification
- **Pipeline API** (makeit-pipeline) — dev tasks: stages, progress, completion
- **BetterStack Uptime API** — мониторинг доступности сервисов
- **Claude API** — верификация audit findings (browser-side, Anthropic SDK)
- Репозитории: Sewing-ERP, mankassa-app, solotax-kg, biznews-kg, Beer_bot, uchet-bot, quiet-walls, moliyakg
