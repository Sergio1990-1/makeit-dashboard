# Epic-011: New Data Sources — Activity, Decisions, Risks, Commitments, Renewals

## Метаданные
- PRD: PRD-008
- Epic-issue: #370
- Milestone: #12
- Дедлайн: 2026-06-12 (9 задач × 1.5 дня + 5 буфер) — стартует после Epic-009
- Статус: planning
- Приоритет: P2-high

## Обзор

Парсеры, источники данных, sessionStorage-tracking и UI вкладок Activity + Decisions & Risks. После эпика данные доступны в `useProjectHub` (реальные, не stub).

## Архитектурные решения

- **Per-project yaml** — все метаданные в репо самого проекта: `docs/risks.yaml`, `docs/commitments.yaml`, `docs/renewals.yaml`. Дашборд читает через GitHub Contents API. CRUD пишет через PUT contents (создаёт коммит).
- **commitments в BRIEF.md** — как первичный источник; `docs/commitments.yaml` опционален как extracted/synced версия. Парсер сначала ищет `commitments:` секцию в BRIEF.md, потом fallback на yaml.
- **decisions** — парсятся из `decisions:` секции в BRIEF.md + conventional commits (`feat:` / `fix:` / `refactor:` — игнор; `decide:` / `accept:` — кандидаты). ADR файлы (`docs/adr/*.md`) — опциональный источник.
- **risks.yaml** — schema: `{id, title, severity, probability, mitigation, owner, due, status, source}`. Source = `manual | transcript-extracted | audit-promoted`.
- **renewals.yaml** — schema: `{type, name, expires_at, notes, source}`. Type ∈ ssl, domain, contract, license. Auto-сканер deprecated/CVE deps добавляет «virtual» entries без записи в yaml.
- **Activity Pulse aggregator** — `activityPulseAggregator.ts` merge'ит 4 источника: GitHub events (commits/issues/PRs) → REST `/repos/{repo}/events`; Pipeline runs → existing pipeline.ts client; Transcripts → existing transcript.ts client; Audit findings → existing auditor.ts client. Limit 100 событий per source за 30 дней.
- **lastVisitedStore** — `sessionStorage` ключ `makeit_hub_last_visited:{repo}` → ISO timestamp. Per-device, не синхронизируется. При reload — сохраняется в session. При close tab — теряется (это by design — «новая сессия = всё свежее»).
- **Risk extraction из транскриптов** — manual trigger в Risk Register UI; кнопка «Extract from transcripts». Claude Haiku читает последние 5 транскриптов проекта, возвращает структурированный list рисков, пользователь approve/reject каждый.
- **GitHub Contents API write** — CRUD на yaml файлы. Branch-creation не нужен (commits прямо в main). Минимизировать commits: batched-CRUD (одна транзакция = один commit с N изменениями).

## Изменения в БД

N/A.

## API изменения

- `src/utils/github-contents.ts` (новый): `readYaml(repo, path)`, `writeYaml(repo, path, data, commitMessage)`, обёртка над GitHub Contents API
- `src/utils/decisionLogExtractor.ts` (новый): `extractDecisions(briefMd, commits) → Decision[]`
- `src/utils/commitmentsExtractor.ts` (новый): `extractCommitments(briefMd, yaml) → Commitment[]`
- `src/utils/renewalsScanner.ts` (новый): `scanRenewals(repo, yaml, packageJson) → Renewal[]`
- `src/utils/activityPulseAggregator.ts` (новый): `aggregatePulse(repo, since) → PulseEvent[]`
- `src/utils/lastVisitedStore.ts` (новый): `getLastVisited(repo) → ISO | null`, `markVisited(repo)`, `unreadCount(events, repo) → number`

## Frontend изменения

- `src/hooks/useProjectHub.ts` — расширяется: реальные `decisions`, `commitments`, `risks`, `renewals`, `pulse`, `inboxCount`
- `src/components/v4/hub/tabs/ActivityTab.tsx` — реальная реализация (Pulse timeline + Inbox + Open PRs + Open Runs)
- `src/components/v4/hub/tabs/DecisionsRisksTab.tsx` — реальная реализация (4 секции: Decisions / Risks / Commitments / Renewals)
- `src/components/v4/hub/PulseTimeline.tsx` — vertical timeline
- `src/components/v4/hub/RiskRegisterTable.tsx` — CRUD table
- `src/components/v4/hub/CommitmentsTable.tsx` — CRUD table
- `src/components/v4/hub/RenewalsTable.tsx` — read + CRUD over manual entries
- `src/components/v4/hub/DecisionLog.tsx` — read-only chronological list
- `src/styles/v4.css` — `Pulse Timeline`, `Hub Tables` секции

## Влияние на существующий код

- `useProjectHub` — stub-поля становятся реальными. Виджеты в Overview Tab автоматически начинают показывать настоящие данные.
- GitHub API нагрузка — увеличивается на ~5 запросов per repo при открытии Hub (events / contents × 3 / PRs). Митигация — кэш sessionStorage 5 минут per repo.
- Per-project репо — нужно опционально создать `docs/risks.yaml` / `docs/commitments.yaml` / `docs/renewals.yaml`. Если файлов нет — Hub показывает empty state с кнопкой «Создать». Bootstrap-шаблоны в `makeit-knowledge/Skills/templates/hub/`.

## Целостность бизнес-логики

- **CRUD через GitHub Contents API** — eventual consistency. При concurrent edit двух браузеров последний выигрывает. Митигация: ETag-проверка перед PUT, при conflict — показать «диалог сравнения» с force-overwrite опцией.
- **lastVisitedStore — per-device** — open Hub на двух машинах = два независимых счётчика unread. By design.
- **Pulse Events truncation** — limit 100 per source за 30 дней. Старые события не показываются. Если нужны — открыть GitHub напрямую (линк).

## Задачи

| # | Задача | Зависимости | Параллельно | Размер |
|---|--------|------------|-------------|--------|
| 01 | `github-contents.ts` + `decisionLogExtractor.ts` + DecisionLog component (read-only) | Epic-009 #03 | да (с #02..#04) | M |
| 02 | `commitmentsExtractor.ts` + `CommitmentsTable` (CRUD) + write via contents API | Epic-009 #03 | да | L |
| 03 | `riskRegister.ts` types + `RiskRegisterTable` (CRUD) + write via contents API | Epic-009 #03 | да | L |
| 04 | `renewalsScanner.ts` + `RenewalsTable` (read + CRUD over manual entries) + deps scanner | Epic-009 #03 | да | L |
| 05 | `lastVisitedStore.ts` + sessionStorage tracking + inbox-badge на ActivityTab | Epic-009 #03 | да | S |
| 06 | `activityPulseAggregator.ts` (merge 4 sources, dedup, sort) + PulseTimeline component | Epic-009 #03 | да (с #07) | L |
| 07 | `ActivityTab` сборка: Pulse + Inbox + Open PRs + Open Runs | 05, 06 | — | M |
| 08 | `DecisionsRisksTab` сборка: 4 секции в layout, navigation между ними | 01, 02, 03, 04 | — | M |
| 09 | Risk extraction from transcripts (Claude Haiku, manual trigger, approve/reject UI) + bootstrap templates в makeit-knowledge | 03 | — | M |
