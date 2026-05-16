import type { ProjectNorm } from "../../../utils/driftNorm";
import { SEVERITY_COLORS, DRIFT_WARN_MULT, DRIFT_STALE_MULT } from "./constants";

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
 *
 * Grounded-only rendering (issue #457): a signal is "supplied at the
 * portfolio level" only when the caller passes its `daysSinceX` prop with
 * a value (a number, or `null` meaning "tracked but no measurement yet").
 * When the prop is absent / `undefined` the signal is simply not wired in
 * this surface — we render NO dot for it rather than a perpetual grey
 * "нет данных", which read as broken. Today only commit is supplied; the
 * rest stay hidden until their data path lands (separate cost decision,
 * #456/#462). Explicit `null` is still shown as the honest grey
 * "нет данных" so a tracked-but-empty signal (e.g. a repo with zero
 * commits) is NOT silently dropped.
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

// Shared severity palette (see ./constants) so dot color can't drift apart
// from ProjectScorecard's grade tone; the glyph adds a non-color cue.
const DOT_STYLE: Record<DriftSeverity, DotStyle> = {
  ok: { bg: SEVERITY_COLORS.ok, glyph: "●", word: "в норме" },
  warn: { bg: SEVERITY_COLORS.warn, glyph: "◐", word: "отставание" },
  stale: { bg: SEVERITY_COLORS.danger, glyph: "▲", word: "просрочено" },
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
  if (days >= norm * DRIFT_STALE_MULT) return "stale";
  if (days >= norm * DRIFT_WARN_MULT) return "warn";
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

  // Render only signals actually supplied by this surface. `undefined`
  // means the caller does not wire this signal here at all (vs. `null` =
  // tracked but no measurement yet) — hiding it avoids the misleading
  // perpetual grey "нет данных" dot (issue #457).
  const groundedKeys = DRIFT_KEYS.filter(
    ({ key }) => daysByKey[key] !== undefined,
  );

  // Nothing wired (shouldn't happen — commit is always supplied) → render
  // nothing rather than an empty labelled group.
  if (groundedKeys.length === 0) return null;

  return (
    <div
      className="v4-drift-dots"
      role="group"
      aria-label="Drift-индикаторы"
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      {groundedKeys.map(({ key, label }) => {
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
