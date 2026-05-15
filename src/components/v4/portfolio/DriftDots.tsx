import type { ProjectNorm } from "../../../utils/driftNorm";

/**
 * DriftDots — four colored dots showing how stale each project signal is
 * versus its per-project norm (Epic-010 Task-01, PRD-008 FR-2/§3.2).
 *
 * Pure presentation: takes the `daysSinceX` measurements and a resolved
 * `ProjectNorm` (from `useDriftNorm` in the parent Scorecard) and renders
 * commit / deploy / audit / client-touch dots.
 *
 * Color rule (from epic-010.md "Архитектурные решения"):
 *   green   days < 1.5 × norm   (incl. the still-acceptable band norm..1.5×norm)
 *   yellow  1.5 × norm ≤ days < 3 × norm
 *   red     days ≥ 3 × norm
 * "red wins" — the steepest threshold is checked first.
 *
 * A11y: color is never the *only* signal. Each dot has a `title` tooltip
 * («commit: 4д назад, норма 2д»), an `aria-label` with the same text plus
 * the severity word, and a glyph (●/◐/▲) so red/green is distinguishable
 * without color perception. `role="img"` so SR announces the label.
 */

export type DriftSeverity = "ok" | "warn" | "stale" | "unknown";

interface DriftKey {
  key: keyof ProjectNorm;
  /** Russian label used in the tooltip. */
  label: string;
}

// Order mirrors §3.2 ("commit / deploy / audit / client-touch").
const DRIFT_KEYS: DriftKey[] = [
  { key: "commit_cadence_days", label: "commit" },
  { key: "deploy_freq_days", label: "deploy" },
  { key: "audit_freq_days", label: "audit" },
  { key: "client_touch_interval_days", label: "client" },
];

interface DotStyle {
  bg: string;
  glyph: string;
  word: string;
}

// Tints carry their own readable color (not a theme var) so the dot is
// legible on both light and dark Scorecards; the glyph adds a non-color cue.
const DOT_STYLE: Record<DriftSeverity, DotStyle> = {
  ok: { bg: "#16a34a", glyph: "●", word: "в норме" },
  warn: { bg: "#ca8a04", glyph: "◐", word: "отставание" },
  stale: { bg: "#dc2626", glyph: "▲", word: "просрочено" },
  unknown: { bg: "var(--v4-ink-300, #C5CCDA)", glyph: "○", word: "нет данных" },
};

/**
 * Classify one signal. `days === null` → unknown (no measurement yet).
 * `norm` is guaranteed positive by `coerceNorm` in driftNorm.ts, but we
 * still guard `norm <= 0` so a future bad caller can't yield Infinity/NaN
 * thresholds (would otherwise paint everything green).
 */
function classifyDrift(
  days: number | null | undefined,
  norm: number | undefined,
): DriftSeverity {
  if (days === null || days === undefined || !Number.isFinite(days)) {
    return "unknown";
  }
  if (norm === undefined || !Number.isFinite(norm) || norm <= 0) {
    return "unknown";
  }
  if (days >= norm * 3) return "stale";
  if (days >= norm * 1.5) return "warn";
  return "ok";
}

function tooltipText(label: string, days: number | null | undefined, norm: number | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) {
    return `${label}: нет данных`;
  }
  const normPart =
    norm !== undefined && Number.isFinite(norm) && norm > 0 ? `, норма ${norm}д` : "";
  return `${label}: ${Math.round(days)}д назад${normPart}`;
}

export interface DriftDaysInput {
  /** Days since last commit on the default branch. */
  daysSinceCommit?: number | null;
  /** Days since last deploy / release. */
  daysSinceDeploy?: number | null;
  /** Days since last audit run. */
  daysSinceAudit?: number | null;
  /** Days since last client touchpoint. */
  daysSinceClientTouch?: number | null;
}

interface Props extends DriftDaysInput {
  /** Resolved norms (from `useDriftNorm`). `null` while loading. */
  norm: ProjectNorm | null;
  /** True while `useDriftNorm` is still resolving — dots render muted. */
  loading?: boolean;
}

export function DriftDots({
  norm,
  loading = false,
  daysSinceCommit,
  daysSinceDeploy,
  daysSinceAudit,
  daysSinceClientTouch,
}: Props) {
  const daysByKey: Record<keyof ProjectNorm, number | null | undefined> = {
    commit_cadence_days: daysSinceCommit,
    deploy_freq_days: daysSinceDeploy,
    audit_freq_days: daysSinceAudit,
    client_touch_interval_days: daysSinceClientTouch,
  };

  return (
    <div
      className="v4-drift-dots"
      role="group"
      aria-label="Drift-индикаторы"
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      {DRIFT_KEYS.map(({ key, label }) => {
        const days = daysByKey[key];
        const normValue = norm ? norm[key] : undefined;
        // While the norm is still loading we can't classify — show muted.
        const severity: DriftSeverity =
          loading || norm === null ? "unknown" : classifyDrift(days, normValue);
        const style = DOT_STYLE[severity];
        const tip = loading
          ? `${label}: загрузка нормы…`
          : tooltipText(label, days, normValue);
        return (
          <span
            key={key}
            role="img"
            aria-label={`${tip} — ${style.word}`}
            title={tip}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: style.bg,
              color: "#fff",
              fontSize: 9,
              lineHeight: 1,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            <span aria-hidden="true">{style.glyph}</span>
          </span>
        );
      })}
    </div>
  );
}

export default DriftDots;
