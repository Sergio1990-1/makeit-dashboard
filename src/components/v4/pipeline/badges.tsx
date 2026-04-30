import type {
  ComplexityLevel,
  EscalationCategory,
  Outcome,
} from "../../../utils/pipeline";

const RISK_STYLE: Record<string, { label: string; cls: string }> = {
  low: { label: "auto", cls: "v4-pl-risk--low" },
  medium: { label: "guarded", cls: "v4-pl-risk--medium" },
  high: { label: "gated", cls: "v4-pl-risk--high" },
};

const POLICY_TOOLTIP: Record<string, string> = {
  full_auto: "Автоматический merge",
  guarded_auto: "Merge после подтверждения",
  human_gated: "Останавливается на PR",
};

export function RiskBadge({
  riskLevel,
  executionPolicy,
}: {
  riskLevel?: string;
  executionPolicy?: string;
}) {
  if (!riskLevel) return null;
  const style = RISK_STYLE[riskLevel] ?? RISK_STYLE.high;
  const tooltip = executionPolicy
    ? POLICY_TOOLTIP[executionPolicy] ?? executionPolicy
    : undefined;
  return (
    <span className={`v4-pl-badge ${style.cls}`} title={tooltip}>
      {style.label}
    </span>
  );
}

export function RiskDot({ riskLevel }: { riskLevel?: string }) {
  if (!riskLevel) return null;
  const style = RISK_STYLE[riskLevel];
  if (!style) return null;
  return (
    <span
      className={`v4-pl-risk-dot ${style.cls}`}
      title={`Риск: ${style.label}`}
      aria-hidden="true"
    />
  );
}

const COMPLEXITY_STYLE: Record<ComplexityLevel, { label: string; cls: string }> = {
  auto: { label: "AUTO", cls: "v4-pl-cx--auto" },
  assisted: { label: "ASSISTED", cls: "v4-pl-cx--assisted" },
  manual: { label: "MANUAL", cls: "v4-pl-cx--manual" },
};

export function ComplexityBadge({
  complexity,
  model,
}: {
  complexity?: ComplexityLevel;
  model?: string;
}) {
  if (!complexity) return null;
  const style = COMPLEXITY_STYLE[complexity] ?? COMPLEXITY_STYLE.manual;
  return (
    <span
      className={`v4-pl-badge ${style.cls}`}
      title={model ? `Model: ${model}` : undefined}
    >
      {style.label}
      {model && <span className="v4-pl-badge-sub">{model}</span>}
    </span>
  );
}

const OUTCOME_STYLE: Record<Outcome, { label: string; cls: string }> = {
  merged_clean: { label: "✓ Сделано", cls: "v4-pl-outcome--clean" },
  merged_with_followup: {
    label: "⚙ Код на main, нужен ops",
    cls: "v4-pl-outcome--followup",
  },
  not_merged: { label: "✗ Не доехало до main", cls: "v4-pl-outcome--missed" },
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const style = OUTCOME_STYLE[outcome];
  if (!style) return null;
  return <span className={`v4-pl-badge ${style.cls}`}>{style.label}</span>;
}

const CATEGORY_STYLE: Record<EscalationCategory, { label: string; cls: string }> = {
  ci_failed: { label: "CI упал", cls: "v4-pl-cat--err" },
  ci_infra_blocked: { label: "CI заблокирован (billing)", cls: "v4-pl-cat--warn" },
  review_unfixable: { label: "Review: блокирующие замечания", cls: "v4-pl-cat--err" },
  timeout: { label: "Таймаут", cls: "v4-pl-cat--neutral" },
  parse_failure: { label: "Ошибка парсинга", cls: "v4-pl-cat--neutral" },
  other: { label: "Другое", cls: "v4-pl-cat--neutral" },
};

export function CategoryBadge({ category }: { category: EscalationCategory }) {
  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other;
  return <span className={`v4-pl-badge ${style.cls}`}>{style.label}</span>;
}

const VERDICT_STYLE: Record<string, string> = {
  APPROVED: "v4-pl-verdict--ok",
  CHANGES_REQUESTED: "v4-pl-verdict--changes",
  PARTIAL: "v4-pl-verdict--partial",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const cls = VERDICT_STYLE[verdict] ?? "v4-pl-verdict--partial";
  return <span className={`v4-pl-badge ${cls}`}>{verdict}</span>;
}
