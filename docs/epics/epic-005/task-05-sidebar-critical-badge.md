# Task-05: Sidebar badge с числом критичных fails

## Метаданные
- Epic: epic-005
- GitHub Issue: #145
- Приоритет: P2-high
- Зависит от: task-01
- Параллельно: да (с task-04)
- Размер: S (~30 строк)

## Описание
В `Sidebar.tsx` на пункте «Дашборд» показывать red-dot + счётчик, если в портфеле есть `severity=critical` fails.

Источник: `usePortfolioHealth.reports.flatMap(r => r.findings.filter(f => f.status === 'fail' && f.severity === 'critical'))`.

Если 0 — badge не рисуется. Если >0 — `· N` рядом с лейблом «Дашборд».

## Контекст для Claude Code
Прочитай:
- `src/components/v4/Sidebar.tsx`
- task-01 (хук usePortfolioHealth)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Badge корректно показывается при наличии critical
- [ ] При 0 critical — никаких индикаторов
