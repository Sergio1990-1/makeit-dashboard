# Task-03: BulkCreateModal — массовое создание issues

## Метаданные
- Epic: epic-006
- GitHub Issue: #148
- Приоритет: P2-high
- Зависит от: task-01, task-02
- Параллельно: нет
- Размер: L (~250 строк)

## Описание
Новый компонент `src/components/v4/health/BulkCreateModal.tsx`. Открывается из `Hero.tsx` кнопкой «Создать issues по всем» (показывается только если в `report.findings` есть `status === 'fail'`).

Содержимое модалки:
1. Заголовок: «Создать issues для {N} нарушений в {repo}»
2. Severity-фильтры в шапке (chips): `critical/high/medium/low` с счётчиками. По умолчанию выбраны `≥ medium`.
3. Список fail-findings с чекбоксами:
   - Каждая строка: checkbox + severity badge + rule_id (моно) + title + truncate detail
   - Hover/expand → preview body (тот что пойдёт в issue)
4. Footer: «Выбрано N» + кнопка «Создать N issues» + Cancel.
5. После Submit:
   - Кнопка disabled, прогресс-бар «{done}/{total}»
   - Последовательное создание (1 секунда между запросами — secondary rate limit)
   - Каждый шаг — `findOpenIssueByTitle` → если нет → create → addIssueToProject
   - Лог в модалке: `✓ #N created` / `~ #N already exists` / `✗ error: …`
   - По завершению — sticky toast «Создано {created}, дублей {dups}, ошибок {errors}» со ссылкой на трекер-фильтр
6. Лимит: warning при выборе > 30 — «Это много issues, создание займёт ~{n} секунд»

## Контекст для Claude Code
Прочитай:
- `src/components/v4/MilestoneIssuesPopup.tsx` — пример модалки в проекте
- `src/components/v4/health/Hero.tsx` — куда добавлять кнопку
- task-01, task-02 (вспомогательные функции уже готовы)

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Открытие модалки → видно все fails из текущего отчёта с выбранными по умолчанию
- [ ] Severity-фильтры работают (изменение чекбокса в шапке инвертирует выбор всех в категории)
- [ ] Submit 5 finding'ов: создаётся 5 issues с задержкой 1с, прогресс-бар обновляется
- [ ] Если 2 из 5 уже есть как duplicate — модалка показывает корректный итог: 3 created, 2 dups
- [ ] При закрытии модалки во время создания — операция корректно прерывается (next iteration видит abort flag)
