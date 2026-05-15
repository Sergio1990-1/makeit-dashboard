import { useEffect, useState } from "react";
import { fetchBudget, type BudgetSummary } from "../../utils/pipeline";

interface Props {
  /** GitHub repo slug (e.g. `Sergio1990-1/moliyakg`). */
  project: string;
  /** Override polling cadence (ms). Default 60 s per epic-035 spec. */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_MS = 60_000;

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function statusColor(status: BudgetSummary["status"], percentage: number | null): string {
  // Mirrors the pipeline's Telegram-alert thresholds so the visual state
  // matches the operator's notifications: <60% green, 60-80% yellow,
  // >=80% red.  ``status`` from the API already encodes this band, but
  // we re-derive the colour from ``percentage`` so a buggy backend that
  // returns ``status="ok"`` with ``percentage=92`` still paints red.
  if (percentage === null) return "var(--v4-muted-500, #6b7280)";
  if (percentage >= 80 || status === "exceeded") return "var(--v4-danger-500, #ef4444)";
  if (percentage >= 60 || status === "warning") return "var(--v4-warning-500, #f59e0b)";
  return "var(--v4-success-500, #10b981)";
}

/**
 * Per-project monthly budget widget (epic-035 Task-06).
 *
 * Polls ``GET /pipeline/budget/{owner}/{repo}`` every 60 s and renders a
 * progress bar with ``$spent / $cap (pct%)``.  At ≥80% the bar pulses to
 * draw operator attention.  When the project has no cap configured the
 * widget renders a neutral "cap не задан" line.
 *
 * Fetch failures (404 / 503 / network) collapse to ``null`` from the
 * pipeline client and the widget returns ``null`` — never crashes the
 * project card.
 */
export function BudgetWidget({ project, pollIntervalMs = DEFAULT_POLL_MS }: Props) {
  const [data, setData] = useState<BudgetSummary | null>(null);
  // Distinguish "still loading first response" from "loaded, no data" so
  // the widget does not flash a placeholder on every project card during
  // initial mount.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // The closure-scoped ``cancelled`` flag is the single load-bearing
    // guard against late ``setState`` after unmount or a deps-change
    // re-run.  ``clearInterval`` stops the timer, ``cancelled`` catches
    // the in-flight ``await fetchBudget`` whose result must be discarded.
    let cancelled = false;

    const tick = async () => {
      const snap = await fetchBudget(project);
      if (cancelled) return;
      setData(snap);
      setLoaded(true);
    };

    void tick();
    const id = window.setInterval(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [project, pollIntervalMs]);

  if (!loaded || data === null) {
    // First mount before the first response OR persistent fetch failure:
    // return nothing so the card layout does not jitter.  When the
    // backend recovers the next tick will populate state and the widget
    // appears.
    return null;
  }

  const { monthly_spent_usd, monthly_cap_usd, percentage, status, last_alert_at } = data;

  if (monthly_cap_usd === null || percentage === null) {
    return (
      <div className="v4-budget-widget v4-budget-widget--no-cap" title="Monthly cap не задан">
        <span className="v4-budget-line">
          {formatUsd(monthly_spent_usd)} в этом месяце · cap не задан
        </span>
      </div>
    );
  }

  // Clamp the visual progress bar to [0, 100] so an overshoot (>100%)
  // does not stretch the track beyond its container.  The numeric
  // ``percentage`` in the label still shows the true value.
  const fillWidth = Math.min(100, Math.max(0, percentage));
  const color = statusColor(status, percentage);
  const pulse = percentage >= 80;

  return (
    <div
      className={`v4-budget-widget v4-budget-widget--${status}${pulse ? " v4-budget-widget--pulse" : ""}`}
      title={
        last_alert_at
          ? `Последний alert: ${last_alert_at}`
          : `Monthly cap ${formatUsd(monthly_cap_usd)}`
      }
    >
      <div className="v4-budget-line">
        <span className="num">
          {formatUsd(monthly_spent_usd)} / {formatUsd(monthly_cap_usd)}
        </span>
        <span className="v4-budget-pct num">({percentage.toFixed(0)}%)</span>
      </div>
      <div className="v4-ptrack v4-budget-track">
        <div
          className="v4-pfill"
          style={{ width: `${fillWidth}%`, background: color }}
        />
      </div>
      {last_alert_at && (
        <div className="v4-budget-alert">alert: {last_alert_at.slice(0, 10)}</div>
      )}
    </div>
  );
}
