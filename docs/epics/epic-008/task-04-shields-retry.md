# Task-04: shields.io retry в coverage_threshold

## Метаданные
- Epic: epic-008
- GitHub Issue: #159
- Приоритет: P3-medium
- Зависит от: —
- Параллельно: да
- Размер: S (~25 строк)

## Описание
В `src/utils/health-engine.ts` case `coverage_threshold`:

Текущий код дёргает `fetch(url)` один раз. Добавить retry helper:

```ts
async function fetchWithRetry(url: string, retries = 1, baseDelay = 250): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, baseDelay * Math.pow(4, attempt)));
        continue;
      }
      return r; // последняя попытка с не-ок ответом — отдаём как есть
    } catch (err) {
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, baseDelay * Math.pow(4, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
```

Использовать только для shields.io (внутренний использует обычный rest). После 1 retry — если всё ещё не 200, отдаём `unknown`.

## Контекст для Claude Code
Прочитай:
- `src/utils/health-engine.ts` — case `coverage_threshold`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Кодовый smoke: при `fetch` → throw → finding: unknown с пометкой «coverage сервис недоступен»
- [ ] При первом 5xx, втором 200 — должен вернуть успешно (через retry)
