# Task-02: runDriftScan оркестратор + Hero кнопка с прогрессом

## Метаданные
- Epic: epic-007
- GitHub Issue: #150
- Приоритет: P3-medium
- Зависит от: task-01
- Параллельно: нет
- Размер: M (~180 строк)

## Описание
Оркестратор + UI скелет.

1. `src/utils/health-llm.ts:runDriftScan(token, owner, repo, doc, classification, claudeKey)`:
   - Получает все Layer 4 правила применимые к repo (через `ruleApplies`)
   - Для каждого: `getCached → null` → запускает соответствующий evidence collector + LLM call (или regex-only для template_filled), возвращает `HealthFinding`
   - Concurrency = 2 (Anthropic rate limit safe)
   - Прогресс через callback `onProgress({done, total, currentRule})`
   - Возвращает `{findings: HealthFinding[], scannedAt: ISO, costEstimate?: number}`

2. Заглушки для Layer 4 правил пока возвращают `unknown` с `detail: "TBD task-NN"`. Реальные impl — task-03..07.

3. `src/hooks/useProjectHealth.ts` расширяется:
   ```ts
   interface State {
     ...
     driftScanning: boolean;
     driftProgress: { done: number; total: number } | null;
   }
   scanDrift(): Promise<void>
   ```
   После `runDriftScan` — мерджит новые findings в существующий report (заменяет `unknown` для Layer 4), сохраняет в sessionStorage.

4. `src/components/v4/health/Hero.tsx`:
   - Кнопка drift из no-op в active. Disabled если нет Claude key или scan уже идёт
   - Прогресс-бар: «Drift {done}/{total} • {currentRule}»
   - Tooltip на disabled-кнопке: «Нужен Claude API key — настрой в шапке»
   - После завершения — toast «Drift-скан: +N fails, M cached»

## Контекст для Claude Code
Прочитай:
- task-01 (LLM-infra)
- `src/components/v4/health/Hero.tsx` — где сейчас no-op кнопка
- `src/hooks/useProjectHealth.ts` — добавляем метод scanDrift
- `src/utils/health-engine.ts:runHealthCheck` — паттерн оркестрации

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Запуск scanDrift на mankassa-app проходит без ошибок (даже если все правила вернут unknown — заглушки)
- [ ] Прогресс-бар обновляется в реальном времени
- [ ] При отсутствии Claude key — кнопка disabled с tooltip
- [ ] Повторный scanDrift в течение того же tree-sha — мгновенный (всё из кэша)
