import { useSyncExternalStore, useState } from "react";
import {
  FALLBACK_PCT,
  HARD_STOP_PCT,
  MONTHLY_CAP_USD,
  WARN_PCT,
  getSpendSnapshot,
  resetCurrentMonth,
  subscribe,
  type ClaudeCallType,
} from "../../utils/claudeBudget";

/**
 * Settings section showing this month's Claude API spend against the
 * portfolio-wide hard cap (Epic-012 Task-01 / FR-41).
 *
 * Pure read-only view sourced from `claudeBudget` via
 * `useSyncExternalStore`. The store re-notifies on every `logCall` /
 * `resetCurrentMonth`, so the panel stays live without polling.
 *
 * The panel is intentionally dumb: it does not enforce thresholds — that
 * is the job of `assertNotHardStopped` / `effectiveModel` at call sites.
 */

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Tier-based colour for the progress bar and percentage label. */
function tierColor(pct: number): string {
  if (pct >= FALLBACK_PCT) return "var(--v4-danger-700, #b91c1c)";
  if (pct >= WARN_PCT) return "var(--v4-warning-700, #b45309)";
  return "var(--v4-success-700, #15803d)";
}

/** Background tint matching tier — used for the progress bar fill. */
function tierFill(pct: number): string {
  if (pct >= FALLBACK_PCT) return "var(--v4-danger-500, #ef4444)";
  if (pct >= WARN_PCT) return "var(--v4-warning-500, #f59e0b)";
  return "var(--v4-success-500, #10b981)";
}

/** Russian label for a known call category. Unknown values pass through. */
function typeLabel(type: ClaudeCallType | string): string {
  switch (type) {
    case "audit":
      return "Audit issue gen";
    case "verify":
      return "Audit verify";
    case "chat":
      return "Чат";
    case "drift":
      return "Drift checks";
    case "digest":
      return "Project Digest";
    case "nba":
      return "Next Best Action";
    case "sentiment":
      return "Sentiment";
    case "other":
      return "Прочее";
    default:
      return type;
  }
}

export function SettingsBudgetPanel() {
  // External store keeps the panel in sync with every Claude call
  // without polling. `getSpendSnapshot` returns a reference-stable
  // value between mutations so React doesn't see a fake change every
  // render — `subscribe` invalidates the snapshot on `notify()`.
  const spend = useSyncExternalStore(subscribe, getSpendSnapshot, getSpendSnapshot);
  const [confirmReset, setConfirmReset] = useState(false);

  // Clamp the visual fill to [0, 100] so an overshoot doesn't blow the
  // bar past its container; the numeric label still shows the true value.
  const fillPct = Math.min(100, Math.max(0, spend.capPct));
  const color = tierColor(spend.capPct);
  const fill = tierFill(spend.capPct);

  // Sort breakdown by spend desc so the biggest contributors lead. Empty
  // bucket → friendlier message instead of an empty list.
  const breakdownEntries = Object.entries(spend.byType)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  let tierMessage: { text: string; color: string } | null = null;
  if (spend.capPct >= HARD_STOP_PCT) {
    tierMessage = {
      text: `Hard-stop активен (≥${HARD_STOP_PCT}%) — все Claude-запросы отклоняются до конца месяца или сброса.`,
      color: "var(--v4-danger-700, #b91c1c)",
    };
  } else if (spend.capPct >= FALLBACK_PCT) {
    tierMessage = {
      text: `Активен fallback на Haiku (≥${FALLBACK_PCT}%) — Sonnet/Opus автоматически заменяются.`,
      color: "var(--v4-danger-700, #b91c1c)",
    };
  } else if (spend.capPct >= WARN_PCT) {
    tierMessage = {
      text: `Расход выше ${WARN_PCT}% — приближаемся к fallback на Haiku.`,
      color: "var(--v4-warning-700, #b45309)",
    };
  }

  return (
    <div
      style={{
        marginTop: 4,
        padding: 12,
        border: "1px solid var(--v4-border, rgba(0,0,0,0.1))",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>Claude API budget</div>
        <div style={{ fontSize: 12, color: "var(--v4-ink-500)" }}>{spend.month}</div>
      </div>

      <div style={{ color: "var(--v4-ink-500)", fontSize: 12, marginBottom: 10 }}>
        Hard cap {fmtUsd(MONTHLY_CAP_USD)} в месяц на весь портфель. На {WARN_PCT}% — UI
        warning, на {FALLBACK_PCT}% — авто-fallback на Haiku, на {HARD_STOP_PCT}% — hard-stop.
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
          gap: 8,
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
          {fmtUsd(spend.total)} / {fmtUsd(spend.capUsd)}
        </span>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: 13,
            fontWeight: 600,
            color,
          }}
        >
          {spend.capPct.toFixed(0)}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Claude API spend"
        aria-valuenow={Math.round(spend.capPct)}
        aria-valuemin={0}
        aria-valuemax={HARD_STOP_PCT}
        style={{
          height: 8,
          background: "var(--v4-border, rgba(0,0,0,0.08))",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${fillPct}%`,
            height: "100%",
            background: fill,
            transition: "width 200ms ease",
          }}
        />
      </div>

      {tierMessage !== null && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: tierMessage.color,
          }}
        >
          {tierMessage.text}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div
          style={{
            fontSize: 12,
            color: "var(--v4-ink-500)",
            marginBottom: 6,
          }}
        >
          Разбивка по типу вызовов
        </div>
        {breakdownEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--v4-ink-500)" }}>
            В этом месяце ещё не было Claude API вызовов.
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {breakdownEntries.map(([type, amount]) => (
              <li
                key={type}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>{typeLabel(type)}</span>
                <span>{fmtUsd(amount as number)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {confirmReset ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--v4-ink-700)" }}>
              Сбросить расход за {spend.month}? История прошлых месяцев останется.
            </span>
            <button
              type="button"
              className="v4-btn"
              onClick={() => setConfirmReset(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="v4-btn"
              style={{ color: "var(--v4-danger-700, #b91c1c)" }}
              onClick={() => {
                resetCurrentMonth();
                setConfirmReset(false);
              }}
            >
              Подтвердить сброс
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="v4-btn"
            onClick={() => setConfirmReset(true)}
            disabled={spend.total === 0}
            title={spend.total === 0 ? "Нечего сбрасывать" : "Сбросить месячный расход"}
          >
            Сбросить месяц
          </button>
        )}
      </div>
    </div>
  );
}
