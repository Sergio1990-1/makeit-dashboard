# Task-05: PortfolioDigestPanel

## Метаданные
- Epic: epic-010
- GitHub Issue: #347
- Приоритет: P2-high
- Зависит от: Epic-012 #02 (cross-project digest generator)
- Параллельно: да (с #02, #03, #04)
- Размер: M

## Описание
Виджет в 2×2-сетке Portfolio Surface. Показывает превью последнего weekly digest по всему портфелю:
1. Читает `digests/{YYYY-WW}-portfolio.md` через GitHub Contents API (репо `Sergio1990-1/makeit-dashboard`).
2. Рендерит первые ~12 строк markdown через `transcript-markdown.ts` (DOMPurify + marked).
3. Кнопка «Открыть полностью» → модалка / новый таб с полным markdown.
4. Кнопка «Сгенерировать новый» → вызывает Epic-012 #02 generator, после успеха перезаписывает текущий week-файл и обновляет превью.

Логика выбора файла: текущий ISO week `YYYY-WW` (`getISOWeek()`). Если файл отсутствует — показывается empty-state «Дайджест за эту неделю ещё не сгенерирован» + активная кнопка «Сгенерировать».

Кэш — sessionStorage `makeit_portfolio_digest_{week}`, TTL — до конца недели. Повторное открытие в той же неделе не делает сетевых запросов.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-010.md` — раздел `PortfolioDigestPanel`
- `docs/prds/PRD-008.md` FR-5, FR-9
- `docs/epics/epic-012/task-02-*.md` — generator API + path convention
- `src/utils/transcript-markdown.ts` — markdown-рендеринг
- `src/utils/github-actions.ts` — пример GitHub Contents API чтения

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Виджет показывает превью markdown (первые ~12 строк) если файл недели существует
- [ ] Empty state с CTA «Сгенерировать» если файла нет
- [ ] Кнопка «Открыть полностью» рендерит весь markdown в модалке / отдельном представлении
- [ ] Кнопка «Сгенерировать новый» вызывает generator из Epic-012 #02, после успеха превью обновляется без полной перезагрузки страницы
- [ ] Кэш sessionStorage предотвращает повторные GitHub-запросы в течение недели
