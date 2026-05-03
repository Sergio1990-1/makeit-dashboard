# Task-05: Semaphore вместо batched-loop

## Метаданные
- Epic: epic-008
- GitHub Issue: #160
- Приоритет: P3-medium
- Зависит от: —
- Параллельно: да
- Размер: M (~80 строк)

## Описание
Текущий код в `src/utils/health-engine.ts:runHealthCheck` использует наивный batch:
```ts
for (let i = 0; i < applicable.length; i += concurrency) {
  const batch = applicable.slice(i, i + concurrency);
  const results = await Promise.all(batch.map((r) => executeCheck(r, ctx)));
  findings.push(...results);
}
```
Это «5-up barrier» — ждёт самый медленный из 5, потом стартует следующие 5. Для smooth concurrency нужен semaphore.

Создать `src/utils/semaphore.ts`:
```ts
export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
```

Заменить в `runHealthCheck`:
```ts
const sem = new Semaphore(5);
const findings = await Promise.all(
  applicable.map((rule) => sem.run(() => executeCheck(rule, ctx)))
);
```

Также можно переиспользовать в `usePortfolioHealth` (epic-005 task-01) и `runDriftScan` (epic-007 task-02).

## Контекст для Claude Code
Прочитай:
- `src/utils/health-engine.ts:runHealthCheck` — батч-цикл

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Скан Beer_bot завершается за то же время или быстрее (smoke на preview server)
- [ ] При concurrency=5 одновременно выполняется максимум 5 правил (можно проверить console.log с counter)
- [ ] Регрессий нет — все 50 правил продолжают возвращать те же результаты
