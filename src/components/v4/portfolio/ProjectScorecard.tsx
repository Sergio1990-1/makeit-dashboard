import type { KeyboardEvent } from "react";
import type { Phase } from "../../../types";
import type { HealthScore } from "../../../types/health";
import type { ProjectTier } from "../../../utils/driftNorm";
import { useDriftNorm } from "../../../hooks/useDriftNorm";
import { DriftDots, type DriftDaysInput } from "./DriftDots";
import { SEVERITY_COLORS } from "./constants";

/**
 * ProjectScorecard — preview card for the Portfolio Surface
 * (Epic-010 Task-01, PRD-008 FR-2 / brief §3.2).
 *
 * Layout:
 *   Header  — repo (mono), tier-pill, phase-badge, client (small),
 *             health-grade A/B/C/D/F (large, right) + colored dot
 *   KPI row — open / in-progress / blocked / overdue-commitments
 *   DriftDots — commit / deploy / audit / client-touch
 *   Footer  — last activity (relative) + cost MTD (if present)
 *
 * Clicking (or Enter/Space) the whole card calls `onSelectRepo(repo)` —
 * Epic-009 routing (owned elsewhere) takes it from there. This component
 * neither imports routing nor mounts itself; Portfolio Surface assembly is
 * Task-06.
 *
 * Pure-injectable (the DORA/NBA pattern of this epic): every datum is a
 * prop. The one exception is the drift norm — the issue specifies DriftDots
 * derives it from `useDriftNorm(repo)`, so the card owns that hook and feeds
 * the resolved norm down. No fetch/N+1 here.
 *
 * Self-contained styling: inline styles over `--v4-*` custom properties with
 * literal fallbacks, so the card is legible in light/dark without touching
 * the shared `v4.css` (parallel Task-02/#344 writes to the same folder).
 */

export type HealthGrade = HealthScore["grade"];

export interface ScorecardKpis {
  /** Open issues. */
  open: number;
  /** Issues currently In Progress. */
  inProgress: number;
  /** Blocked issues. */
  blocked: number;
  /** Overdue client commitments (Epic-011 Promise Tracker). */
  overdueCommitments: number;
}

interface Props {
  repo: string;
  tier: ProjectTier;
  phase: Phase;
  client?: string | null;
  /** Health grade. `null` → not yet computed (renders muted "—"). */
  grade: HealthGrade | null;
  kpis: ScorecardKpis;
  /** Drift measurements (days since each signal). */
  drift: DriftDaysInput;
  /** Days since last activity (relative footer). `null` → unknown. */
  daysSinceActivity?: number | null;
  /** Cost month-to-date in USD. `null`/omitted → footer omits it. */
  costMtdUsd?: number | null;
  /** Epic-009 routing handler — receives `repo` on card activation. */
  onSelectRepo: (repo: string) => void;
}

const PHASE_BADGE: Record<Phase, { icon: string; label: string; color: string }> = {
  development: { icon: "▶", label: "dev", color: "var(--v4-accent-600, #1D4ED8)" },
  support: { icon: "⏸", label: "support", color: "var(--v4-ink-500, #6B7691)" },
  "pre-dev": { icon: "◻", label: "pre-dev", color: "var(--v4-purple-700, #5B21B6)" },
};

// Grade → tone. Shared severity palette (see ./constants) so this can't
// drift apart from DriftDots; the letter itself is the primary, non-color
// signal.
const GRADE_TONE: Record<HealthGrade, string> = {
  A: SEVERITY_COLORS.ok,
  B: SEVERITY_COLORS.strong,
  C: SEVERITY_COLORS.warn,
  D: SEVERITY_COLORS.elevated,
  F: SEVERITY_COLORS.danger,
};

/** Numeric tier (1|2|3), accepting either the numeric or `tier-N` form. */
function tierNumber(tier: ProjectTier): 1 | 2 | 3 {
  if (tier === 1 || tier === "tier-1") return 1;
  if (tier === 2 || tier === "tier-2") return 2;
  return 3;
}

function tierLabel(tier: ProjectTier): string {
  return `T${tierNumber(tier)}`;
}

/** Days → short relative RU string. `null`/invalid → "—". */
function relativeDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return "—";
  const d = Math.max(0, Math.round(days));
  if (d === 0) return "сегодня";
  if (d === 1) return "вчера";
  return `${d}д назад`;
}

/**
 * Compact USD ($940 / $1,2k / $3,5M). Non-finite/negative → null (footer
 * skips it). Uses Intl `ru-RU` formatting (decimal comma + thousands
 * grouping) and an M tier so large sums no longer fall back to an ungrouped
 * `$1250k`-style string.
 */
function compactUsd(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null;
  const ru = (v: number, maxFrac: number): string =>
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFrac,
    }).format(v);
  if (n >= 1_000_000) return `$${ru(n / 1_000_000, 1)}M`;
  if (n >= 1000) return `$${ru(n / 1000, 1)}k`;
  return `$${ru(Math.round(n), 0)}`;
}

interface KpiItemProps {
  icon: string;
  value: number;
  label: string;
  /** Tint the value when > 0 (blocked/overdue read as warnings). */
  danger?: boolean;
}

function KpiItem({ icon, value, label, danger }: KpiItemProps) {
  const isAlert = !!danger && value > 0;
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        fontSize: 12,
        color: isAlert ? SEVERITY_COLORS.danger : "var(--v4-ink-800, #1B2235)",
        fontWeight: isAlert ? 700 : 500,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.7 }}>
        {icon}
      </span>
      <b style={{ fontVariantNumeric: "tabular-nums" }}>{value}</b>
      <span style={{ fontSize: 11, color: "var(--v4-ink-500, #6B7691)", fontWeight: 500 }}>
        {label}
      </span>
    </span>
  );
}

export function ProjectScorecard({
  repo,
  tier,
  phase,
  client,
  grade,
  kpis,
  drift,
  daysSinceActivity,
  costMtdUsd,
  onSelectRepo,
}: Props) {
  // The card owns the norm hook so DriftDots can color against per-project
  // thresholds (issue: "Берёт … norm из useDriftNorm(repo)").
  const { norm, loading: normLoading } = useDriftNorm(repo, tier);

  const phaseBadge = PHASE_BADGE[phase];
  const gradeTone = grade ? GRADE_TONE[grade] : "var(--v4-ink-400, #94A0B8)";
  const cost = compactUsd(costMtdUsd);

  const activate = () => onSelectRepo(repo);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Space scrolls by default — preventDefault so the card "button"
    // behaves like a real button for keyboard users.
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      activate();
    }
  };

  return (
    <div
      className="v4-scorecard"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
      aria-label={`Открыть проект ${repo}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: "var(--v4-r-lg, 12px)",
        background: "var(--v4-card, var(--v4-bg, #fff))",
        border: "1px solid var(--v4-line, #E4E8EF)",
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--v4-mono, ui-monospace, monospace)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--v4-ink-900, #0E1320)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              {repo}
            </span>
            <span
              title={`Tier ${tierNumber(tier)}`}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 999,
                background: "var(--v4-accent-50, #EEF4FF)",
                color: "var(--v4-accent-700, #1E40AF)",
                flexShrink: 0,
              }}
            >
              {tierLabel(tier)}
            </span>
            <span
              title={`Фаза: ${phaseBadge.label}`}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 999,
                border: `1px solid ${phaseBadge.color}`,
                color: phaseBadge.color,
                flexShrink: 0,
              }}
            >
              {phaseBadge.icon} {phaseBadge.label}
            </span>
          </div>
          {client && (
            <div
              style={{
                marginTop: 3,
                fontSize: 11,
                color: "var(--v4-ink-500, #6B7691)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {client}
            </div>
          )}
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
          title={grade ? `Health grade: ${grade}` : "Health grade пока не вычислен"}
        >
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: gradeTone,
              flexShrink: 0,
            }}
          />
          <span
            aria-label={grade ? `Health grade ${grade}` : "Health grade неизвестен"}
            style={{
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              color: gradeTone,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {grade ?? "—"}
          </span>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          borderTop: "1px solid var(--v4-line-soft, #EEF1F6)",
          paddingTop: 8,
        }}
      >
        <KpiItem icon="◯" value={kpis.open} label="открытых" />
        <KpiItem icon="▶" value={kpis.inProgress} label="в работе" />
        <KpiItem icon="⛔" value={kpis.blocked} label="заблок." danger />
        <KpiItem icon="⏰" value={kpis.overdueCommitments} label="просроч." danger />
      </div>

      {/* ── DriftDots ── */}
      <DriftDots norm={norm} loading={normLoading} {...drift} />

      {/* ── Footer ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          color: "var(--v4-ink-500, #6B7691)",
          borderTop: "1px solid var(--v4-line-soft, #EEF1F6)",
          paddingTop: 8,
        }}
      >
        <span title="Последняя активность">
          активность: {relativeDays(daysSinceActivity)}
        </span>
        {cost && (
          <span
            title="Стоимость с начала месяца"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            MTD {cost}
          </span>
        )}
      </div>
    </div>
  );
}

export default ProjectScorecard;
