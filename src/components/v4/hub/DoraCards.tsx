import type { DoraMetricsResult, DoraTier } from "../../../utils/doraCalculator";

/**
 * DORA KPI grid for the Delivery tab (Epic-012 Task-03, FR-33..FR-35).
 *
 * Pure presentation — receives a pre-computed `DoraMetricsResult` and
 * renders four cards: Deploy Frequency, Lead Time, MTTR, Change Failure
 * Rate. Each card is tinted by the metric's DORA tier and shows a short
 * tooltip with the convention used (mirrors docs/DELIVERY.md).
 *
 * A `null` metric value renders as a `—` (NOT zero) per the brief: a
 * missing monitor / no PRs in window should be visually distinguishable
 * from a measured zero.
 */

interface Props {
  metrics: DoraMetricsResult | null;
}

/** Tone-pair (background + accent) per DORA tier. Stays accessible in
 *  both themes via CSS custom-property fallbacks. */
function tierStyle(tier: DoraTier): { background: string; accent: string; label: string } {
  switch (tier) {
    case "elite":
      return { background: "rgba(34, 197, 94, 0.12)", accent: "#16a34a", label: "Elite" };
    case "high":
      return { background: "rgba(132, 204, 22, 0.12)", accent: "#65a30d", label: "High" };
    case "medium":
      return { background: "rgba(234, 179, 8, 0.14)", accent: "#ca8a04", label: "Medium" };
    case "low":
      return { background: "rgba(239, 68, 68, 0.12)", accent: "#dc2626", label: "Low" };
    case "na":
    default:
      return { background: "var(--v4-border, rgba(0,0,0,0.05))", accent: "var(--v4-ink-500)", label: "n/a" };
  }
}

/** Render a number with at most one decimal, or `—` for null. */
function formatNumber(value: number | null, suffix = ""): string {
  if (value === null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  // Strip the trailing `.0` so "12.0" reads as "12" — feels less noisy.
  const text = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  return `${text}${suffix}`;
}

/** Hours → human-readable string (`2h`, `1.5d`). `null` → `—`. */
function formatHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return "—";
  if (hours < 24) return `${formatNumber(hours)}h`;
  return `${formatNumber(hours / 24)}d`;
}

/** Fraction in `[0, 1]` → percentage string. `null` → `—`. */
function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  // value is a [0,1] fraction → ×100 to a percent, then round to 1 decimal.
  const pct = Math.round(value * 100 * 10) / 10;
  const text = Number.isInteger(pct) ? pct.toString() : pct.toFixed(1);
  return `${text}%`;
}

interface CardProps {
  title: string;
  value: string;
  tier: DoraTier;
  tooltip: string;
}

function Card({ title, value, tier, tooltip }: CardProps) {
  const style = tierStyle(tier);
  return (
    <div
      className="v4-dora-card"
      title={tooltip}
      style={{
        padding: 14,
        borderRadius: 10,
        background: style.background,
        borderLeft: `3px solid ${style.accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 92,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--v4-ink-500)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--v4-ink-900, inherit)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 999,
          background: style.accent,
          color: "#fff",
          alignSelf: "flex-start",
          fontWeight: 600,
        }}
      >
        {style.label}
      </div>
    </div>
  );
}

export function DoraCards({ metrics }: Props) {
  // Empty-state when computeDora hasn't been called yet — render four
  // placeholder cards so the grid layout is stable while data loads.
  if (!metrics) {
    return (
      <div
        className="v4-dora-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        <Card title="Deploy Frequency" value="—" tier="na" tooltip="Нет данных" />
        <Card title="Lead Time" value="—" tier="na" tooltip="Нет данных" />
        <Card title="MTTR" value="—" tier="na" tooltip="Нет данных" />
        <Card title="Change Failure Rate" value="—" tier="na" tooltip="Нет данных" />
      </div>
    );
  }

  return (
    <div
      className="v4-dora-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
      }}
    >
      <Card
        title="Deploy Frequency"
        value={formatNumber(metrics.deployFreq, "/day")}
        tier={metrics.tiers.deployFreq}
        tooltip="Commits на main с префиксом feat:/fix:/release: за окно ÷ количество дней окна. Elite ≥ 1/день."
      />
      <Card
        title="Lead Time"
        value={formatHours(metrics.leadTimeHours)}
        tier={metrics.tiers.leadTime}
        tooltip="Медиана (merged_at − created_at) для merged PR в окне. Elite ≤ 1 дня."
      />
      <Card
        title="MTTR"
        value={formatHours(metrics.mttrHours)}
        tier={metrics.tiers.mttr}
        tooltip="Медиана длительности downtime по BetterStack monitor проекта. n/a если monitor не сопоставлен."
      />
      <Card
        title="Change Failure Rate"
        value={formatPercent(metrics.cfr)}
        tier={metrics.tiers.cfr}
        tooltip="Доля деплоев, за которыми в течение 7 дней последовал fix-коммит ИЛИ critical audit finding. Elite ≤ 5%."
      />
    </div>
  );
}

export default DoraCards;
