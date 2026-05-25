import type { FindingStatus, HealthFinding } from "../../../types/health";
import { isOnboardingRuleId } from "../../../utils/onboardingReadinessRules";

/**
 * Onboarding Readiness Checklist (Epic-012 Task-04).
 *
 * Renders the six `onboarding.*` rules from the health report as a tight
 * pass/fail list. Each row shows ✓ for pass, ✗ for fail, ⏳ for unknown
 * (auditor service down etc.), and — for skipped. Failing rows expose the
 * rule's `remediation` text via a `title` tooltip so users can act
 * immediately without leaving the Hub.
 *
 * Pure presentation: caller supplies findings from `useProjectHub` /
 * `usePortfolioHealth`. Empty state covers the «health report ещё не
 * сгенерирован» case (rare; usually means the project hasn't been
 * classified in PROJECT_CHECKLIST.yaml yet).
 */

interface Props {
  findings: HealthFinding[];
}

type IconKind = "pass" | "fail" | "unknown" | "skipped";

const ICON: Record<IconKind, string> = {
  pass: "✓",
  fail: "✗",
  unknown: "⏳",
  skipped: "—",
};

const ICON_LABEL: Record<IconKind, string> = {
  pass: "Выполнено",
  fail: "Не выполнено",
  unknown: "Не удалось проверить",
  skipped: "Пропущено",
};

// Explicit, exhaustive FindingStatus → IconKind map. The two unions are
// identical today, but keying by `FindingStatus` makes a new status member a
// compile error here until it's deliberately mapped, rather than silently
// passing through an implicit cross-type assignment.
const STATUS_ICON: Record<FindingStatus, IconKind> = {
  pass: "pass",
  fail: "fail",
  unknown: "unknown",
  skipped: "skipped",
};

export function OnboardingChecklist({ findings }: Props) {
  const onboarding = findings.filter((f) => isOnboardingRuleId(f.rule_id));

  if (onboarding.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          border: "1px dashed var(--mk-line)",
          borderRadius: 10,
          color: "var(--v4-ink-500)",
          fontSize: 13,
        }}
      >
        Onboarding-чеклист появится после первого health-сканирования проекта.
      </div>
    );
  }

  const passed = onboarding.filter((f) => f.status === "pass").length;
  const total = onboarding.length;

  return (
    <section
      aria-labelledby="v4-hub-onboarding-title"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h3
          id="v4-hub-onboarding-title"
          style={{ fontSize: 14, fontWeight: 600, margin: 0 }}
        >
          Onboarding Readiness
        </h3>
        <span
          style={{
            fontSize: 12,
            color: "var(--v4-ink-500)",
            fontVariantNumeric: "tabular-nums",
          }}
          aria-label={`${passed} из ${total} правил выполнены`}
        >
          {passed}/{total}
        </span>
      </header>

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
        {onboarding.map((f) => {
          const kind: IconKind = STATUS_ICON[f.status];
          // Compose a tooltip: detail (always) + remediation (only when
          // failing — pass / skipped don't need a fix). Falsy guard so we
          // never render the literal string «undefined» in `title`.
          // Native `title` collapses whitespace and ignores `\n`, so join
          // with a visible inline separator instead of blank lines.
          const tooltipParts: string[] = [];
          if (f.detail) tooltipParts.push(f.detail);
          if (f.status === "fail" && f.remediation) {
            tooltipParts.push(`Как починить: ${f.remediation}`);
          }
          const tooltip = tooltipParts.join(" — ");

          return (
            <li
              key={f.rule_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                border: "1px solid var(--mk-line-soft)",
                borderRadius: 6,
                fontSize: 13,
              }}
              title={tooltip || undefined}
            >
              <span
                aria-label={ICON_LABEL[kind]}
                role="img"
                style={{
                  display: "inline-flex",
                  width: 18,
                  justifyContent: "center",
                  color:
                    kind === "pass"
                      ? "var(--mk-success)"
                      : kind === "fail"
                        ? "var(--mk-danger)"
                        : "var(--v4-ink-500)",
                  fontWeight: 600,
                }}
              >
                {ICON[kind]}
              </span>
              <span
                style={{
                  flex: 1,
                  color:
                    kind === "fail"
                      ? "var(--v4-ink-900)"
                      : "var(--v4-ink-700)",
                }}
              >
                {f.title}
              </span>
              {f.status === "fail" && f.remediation ? (
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    color: "var(--v4-ink-500)",
                    cursor: "help",
                  }}
                >
                  ?
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default OnboardingChecklist;
