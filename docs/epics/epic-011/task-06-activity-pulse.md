# Task-06: Activity Pulse aggregator + PulseTimeline компонент

## Метаданные
- Epic: epic-011
- GitHub Issue: #355
- Приоритет: P2-high
- Зависит от: Epic-009 #03
- Параллельно: да (с #07)
- Размер: L

## Описание
Агрегатор событий из 4 источников и vertical timeline компонент для Activity Tab.

1. `src/utils/activityPulseAggregator.ts` — `aggregatePulse(repo, since: ISO) → PulseEvent[]`. Merge'ит:
   - GitHub events → REST `GET /repos/{repo}/events` (commits, issues, PRs, releases)
   - Pipeline runs → existing `pipeline.ts` client
   - Transcripts → existing `transcript.ts` client
   - Audit findings → existing `auditor.ts` client
   Каждый источник: limit 100 событий за последние 30 дней. Dedup по `{source, id}`. Sort по `timestamp` desc.
2. `PulseEvent` schema: `{id, source: 'github'|'pipeline'|'transcript'|'audit', type: string, timestamp: ISO, title: string, url?: string, meta?: Record<string, unknown>}`.
3. `src/components/v4/hub/PulseTimeline.tsx` — vertical timeline: дата-группировка («Сегодня» / «Вчера» / «N дней назад»), иконка по source, click → открыть `url` в новой вкладке. Empty state.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-011.md` — Activity Pulse aggregator секция
- `docs/prds/PRD-008.md` FR-42, FR-43
- `docs/PROJECT_HUB_DESIGN_BRIEF.md` — Activity tab
- `src/utils/pipeline.ts`, `src/utils/transcript.ts`, `src/utils/auditor.ts` — клиенты
- `src/utils/github.ts` — GitHub auth/headers

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `aggregatePulse` возвращает merged sorted-desc список из 4 источников
- [ ] Limit 100 per source соблюдается; total ≤ 400 events
- [ ] Dedup по `{source, id}` работает
- [ ] `PulseTimeline` группирует по дате (Сегодня / Вчера / N дней назад)
- [ ] Click по event → `window.open(url, '_blank')` если url задан
- [ ] sessionStorage кэш 5 минут per repo (по PRD митигации)
