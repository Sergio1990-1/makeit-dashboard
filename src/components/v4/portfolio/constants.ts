/**
 * Shared Portfolio Surface palette + drift thresholds (Epic-010, #392).
 *
 * `ProjectScorecard` (grade tone, KPI alert) and `DriftDots` (dot color,
 * classify thresholds) previously hard-coded the same severity hexes and
 * drift multipliers in two separate files — a palette-drift risk flagged in
 * review as the surface grows. This is the single source for both.
 *
 * Tones are self-contained readable hexes (deliberately NOT theme vars) so
 * they read on light AND dark Scorecards; the grade letter / dot glyph is
 * always the primary, non-color signal.
 */

export const SEVERITY_COLORS = {
  /** A grade · in-norm drift */
  ok: "#16a34a",
  /** B grade */
  strong: "#65a30d",
  /** C grade · lagging drift */
  warn: "#ca8a04",
  /** D grade */
  elevated: "#ea580c",
  /** F grade · overdue drift · KPI alert */
  danger: "#dc2626",
} as const;

/**
 * Drift severity bands as a multiple of the per-project norm
 * (epic-010.md color rule: warn ≥ 1.5×, stale ≥ 3×).
 */
export const DRIFT_WARN_MULT = 1.5;
export const DRIFT_STALE_MULT = 3;
