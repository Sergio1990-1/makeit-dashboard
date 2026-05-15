# Task-09: Risk extraction из транскриптов + bootstrap templates

## Метаданные
- Epic: epic-011
- GitHub Issue: #358
- Приоритет: P2-high
- Зависит от: Task-03
- Параллельно: нет
- Размер: M

## Описание
Manual-trigger извлечение рисков из последних 5 транскриптов проекта через Claude Haiku + approve/reject UI + bootstrap-шаблоны для новых проектов.

1. `src/utils/extractRisksFromTranscripts.ts` — `extractRisks(repo) → ProposedRisk[]`. Берёт последние 5 BRIEF.md из transcript API, шлёт в Claude Haiku с промптом «извлеки риски в формате `{title, severity, probability, mitigation, source: transcript-id}`». Возвращает структурированный list.
2. UI: в `RiskRegisterTable` — кнопка «Extract from transcripts». Click → loading → modal со списком предложенных рисков, у каждого Approve / Reject / Edit. Approve → append в `docs/risks.yaml` с `source: 'transcript-extracted'`.
3. Bootstrap templates — отдельный PR в `makeit-knowledge` репозиторий: `Skills/templates/hub/risks.yaml`, `commitments.yaml`, `renewals.yaml`, `project_norm.yaml`. Минимальные валидные skeletons с комментариями-примерами для каждого поля.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — Risk extraction секция
- `docs/prds/PRD-008.md` FR-30
- `src/utils/claude.ts` — Claude API клиент (Haiku подходит)
- `src/utils/transcript.ts` — transcript API
- `src/components/v4/hub/RiskRegisterTable.tsx` (Task-03)
- `makeit-knowledge` репо — структура `Skills/templates/`

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] Кнопка «Extract from transcripts» работает на проекте с транскриптами
- [ ] Modal показывает proposed risks с Approve / Reject / Edit
- [ ] Approved risk появляется в risks.yaml с `source: 'transcript-extracted'`
- [ ] Reject — никаких записей в yaml
- [ ] PR в makeit-knowledge с 4 шаблонами создан и описан
- [ ] При пустой истории транскриптов — graceful empty state
