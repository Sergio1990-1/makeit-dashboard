# Task-01: Claude budget tracker + Settings panel

## Метаданные
- Epic: epic-012
- GitHub Issue: #359
- Приоритет: P2-high
- Зависит от: —
- Параллельно: да (с #02-#06)
- Размер: M

## Описание
Hard cap на расход Claude API — $30/мес на весь портфель. Каждый вызов логируется в localStorage с tokens + estimated cost. Tier-логика: 80% — warning в UI, 110% — автоматический fallback на Haiku до конца месяца, 200% — hard-stop (защита от runaway loop).

1. `src/utils/claudeBudget.ts` — API: `logCall({type, model, inputTokens, outputTokens})`, `getSpend() → {month, total, byType, capPct}`, `shouldFallbackToHaiku() → boolean`, `isHardStopped() → boolean`. Cost-таблица по моделям (Sonnet $3/$15 per Mtok, Haiku $0.80/$4). Storage key `makeit_claude_budget:{YYYY-MM}`.
2. `src/components/v4/SettingsBudgetPanel.tsx` — новая секция в Settings: текущий spend / cap $30 / прогресс-бар (зелёный/жёлтый/красный) / breakdown по call-type (digest, nba, sentiment, verify) / кнопка «Reset month» с confirm.
3. Hard cap и порог fallback должны быть конфигурируемыми (константы в начале файла), не зашиты в UI.

## Контекст для Claude Code
Прочитай:
- `docs/epics/epic-012.md` — секция Budget cap
- `docs/prds/PRD-008.md` FR-41
- `src/utils/claude.ts` — текущая интеграция Claude API (точка интеграции для logCall)
- `src/components/v4/SettingsView.tsx` — куда монтировать panel

## Критерии выполнения
- [ ] type-check + lint + build чистые
- [ ] `logCall` корректно считает cost по input/output tokens × tariff модели
- [ ] При 110% spend → `shouldFallbackToHaiku()` возвращает true и не сбрасывается до следующего месяца
- [ ] При 200% spend → `isHardStopped()` блокирует все calls (callers проверяют флаг)
- [ ] `SettingsBudgetPanel` показывает spend / cap / breakdown с обновлением после каждого call
- [ ] Reset month очищает текущий месячный bucket после confirm
