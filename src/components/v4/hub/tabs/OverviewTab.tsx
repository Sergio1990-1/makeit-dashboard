import { useMemo } from "react";
import type {
  Commitment,
  HubTab,
  NextBestAction,
  ProjectHubData,
  PulseEvent,
  Risk,
} from "../../../../types/hub";
import { Icon } from "../../health/Icon";
import type { IconName } from "../../health/Icon";

interface Props {
  data: ProjectHubData;
  onOpenTab: (tab: HubTab) => void;
}

/**
 * Overview tab — first thing the user sees after clicking a Scorecard row.
 * 4 mini-blocks in a 2×2 grid (stack <768px): NBA / Pulse / Risks / Commitments.
 *
 * All data flows from useProjectHub. In Epic-009 every source is stubbed
 * (empty arrays / null), so every block here must render a sensible empty
 * state without crashing. Real producers land in Epic-011/012.
 *
 * Per FR-20: each block has an "Открыть полностью →" footer link that
 * switches the parent's active tab via onOpenTab.
 */
export function OverviewTab({ data, onOpenTab }: Props) {
  // Defensive defaults: useProjectHub stubs return empty arrays today, but
  // a future caller (e.g. partial-data state) might pass undefined. Guard
  // once at the top so the sub-components can assume arrays.
  const nba = data.nba ?? [];
  const pulse = data.pulse ?? [];
  const risks = data.risks ?? [];
  const commitments = data.commitments ?? [];

  // Visual order follows the attention hierarchy from
  // PROJECT_HUB_DESIGN_BRIEF.md §6: NBA (rank 1) top-left, risks and
  // commitments (rank 3) on row 1 / row 2 col 1 so they stay above the
  // fold; pulse (rank 5, recent activity) lands bottom-right.
  return (
    <div className="v4-hub-overview">
      <NbaBlock nba={nba} onOpenTab={onOpenTab} />
      <RisksSummary risks={risks} onOpenTab={onOpenTab} />
      <CommitmentsSummary commitments={commitments} onOpenTab={onOpenTab} />
      <PulseSummary events={pulse} onOpenTab={onOpenTab} />
    </div>
  );
}

export default OverviewTab;

// ─── NBA block ──────────────────────────────────────────────────────────
// Shows the top-1 Next Best Action expanded (text + reason + stub action
// buttons). Per design brief §6, NBA sits at attention rank 1 — this is
// the "what should I do right now" entry into the Hub.

interface NbaBlockProps {
  nba: NextBestAction[];
  onOpenTab: (tab: HubTab) => void;
}

function NbaBlock({ nba, onOpenTab }: NbaBlockProps) {
  const top = nba[0];

  return (
    <section
      className="v4-hub-mini v4-hub-mini--nba"
      aria-labelledby="v4-hub-mini-nba-title"
    >
      <header className="v4-hub-mini-head">
        <span className="v4-hub-mini-ic v4-hub-mini-ic--nba" aria-hidden="true">
          <Icon name="lightbulb" />
        </span>
        <h3 className="v4-hub-mini-title" id="v4-hub-mini-nba-title">
          Next Best Action
        </h3>
      </header>

      {top ? (
        <div className="v4-hub-mini-body">
          <p className="v4-hub-nba-action">{top.text}</p>
          <p className="v4-hub-nba-reason">
            <span className="v4-hub-nba-reason-label">Почему:</span> {top.reason}
          </p>
          <div className="v4-hub-nba-actions">
            <button
              type="button"
              className="v4-btn v4-btn--pri"
              disabled
              title="Будет включено в Epic-012 Task-05"
            >
              Создать issue
            </button>
            <button
              type="button"
              className="v4-btn"
              disabled
              title="Будет включено в Epic-012 Task-05"
            >
              Отметить сделанным
            </button>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="lightbulb"
          text="NBA пока не сгенерирован"
          hint="Появится после первого scan'а движком рекомендаций"
        />
      )}

      {/* Every mini-block carries the same footer affordance (FR-20).
          NBA has no dedicated tab of its own, so fall back to "activity"
          — the most reasonable place to dig into what the NBA was
          reasoning about. If the producer supplies a targetTab (Epic-012
          NBA engine), honour it instead. */}
      <FooterLink onClick={() => onOpenTab(top?.targetTab ?? "activity")} />
    </section>
  );
}

// ─── Pulse summary ──────────────────────────────────────────────────────
// 5 most recent activity events. Newest first; caller already sorts in
// useProjectHub, but we re-sort defensively in case a producer doesn't.

interface PulseSummaryProps {
  events: PulseEvent[];
  onOpenTab: (tab: HubTab) => void;
}

function PulseSummary({ events, onOpenTab }: PulseSummaryProps) {
  const top5 = useMemo(() => {
    // Use Date.parse so mixed ISO precision (e.g. `…T10:00Z` vs
    // `…T10:00:00.000Z`) sorts chronologically; localeCompare on raw
    // strings would order `Z` after digits and put the less-precise
    // timestamp later than its sub-second sibling for the same instant.
    return [...events]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 5);
  }, [events]);

  return (
    <section
      className="v4-hub-mini v4-hub-mini--pulse"
      aria-labelledby="v4-hub-mini-pulse-title"
    >
      <header className="v4-hub-mini-head">
        <span
          className="v4-hub-mini-ic v4-hub-mini-ic--pulse"
          aria-hidden="true"
        >
          <Icon name="trend" />
        </span>
        <h3 className="v4-hub-mini-title" id="v4-hub-mini-pulse-title">
          Pulse — последние события
        </h3>
      </header>

      {top5.length > 0 ? (
        <ul className="v4-hub-pulse-list">
          {top5.map((event) => (
            <li key={event.id} className="v4-hub-pulse-item">
              <span
                className="v4-hub-pulse-type"
                title={event.type}
                aria-label={`Событие: ${event.type}`}
              >
                {event.type}
              </span>
              <span className="v4-hub-pulse-label">{event.label}</span>
              <time className="v4-hub-pulse-time" dateTime={event.timestamp}>
                {formatRelative(event.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="clock" text="Пока нет событий" />
      )}

      <FooterLink onClick={() => onOpenTab("activity")} />
    </section>
  );
}

// ─── Risks summary ──────────────────────────────────────────────────────
// Top-3 critical/high open risks. "open" filter is implicit — mitigated /
// accepted risks should never appear on Overview.

interface RisksSummaryProps {
  risks: Risk[];
  onOpenTab: (tab: HubTab) => void;
}

function RisksSummary({ risks, onOpenTab }: RisksSummaryProps) {
  const top = useMemo(() => {
    return risks
      .filter(
        (r) =>
          r.status === "open" &&
          (r.severity === "critical" || r.severity === "high"),
      )
      .slice(0, 3);
  }, [risks]);

  return (
    <section
      className="v4-hub-mini v4-hub-mini--risks"
      aria-labelledby="v4-hub-mini-risks-title"
    >
      <header className="v4-hub-mini-head">
        <span
          className="v4-hub-mini-ic v4-hub-mini-ic--risks"
          aria-hidden="true"
        >
          <Icon name="alert" />
        </span>
        <h3 className="v4-hub-mini-title" id="v4-hub-mini-risks-title">
          Риски — топ-3
        </h3>
      </header>

      {top.length > 0 ? (
        <ul className="v4-hub-risk-list">
          {top.map((risk) => (
            <li
              key={risk.id}
              className={`v4-hub-risk-item v4-hub-risk-item--${risk.severity}`}
            >
              <span
                className={`v4-hub-risk-sev v4-hub-risk-sev--${risk.severity}`}
              >
                {severityLabel(risk.severity)}
              </span>
              <span className="v4-hub-risk-title">{risk.title}</span>
              {risk.owner ? (
                <span className="v4-hub-risk-owner">@{risk.owner}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="check" text="Активных рисков нет" />
      )}

      <FooterLink onClick={() => onOpenTab("decisions")} />
    </section>
  );
}

// ─── Commitments summary ────────────────────────────────────────────────
// Top-3 overdue + due-this-week (status "open" only). Sorted by urgency:
// overdue first, then by dueDate asc.

interface CommitmentsSummaryProps {
  commitments: Commitment[];
  onOpenTab: (tab: HubTab) => void;
}

function CommitmentsSummary({
  commitments,
  onOpenTab,
}: CommitmentsSummaryProps) {
  // No useMemo here: filtering reads Date.now() (impure per
  // react-hooks/purity rules), and the list is tiny (top-3 of a
  // small set). One pass on every render is cheap.
  const top = filterUrgentCommitments(commitments);

  return (
    <section
      className="v4-hub-mini v4-hub-mini--commitments"
      aria-labelledby="v4-hub-mini-commitments-title"
    >
      <header className="v4-hub-mini-head">
        <span
          className="v4-hub-mini-ic v4-hub-mini-ic--commitments"
          aria-hidden="true"
        >
          <Icon name="clock" />
        </span>
        <h3 className="v4-hub-mini-title" id="v4-hub-mini-commitments-title">
          Обещания — топ-3
        </h3>
      </header>

      {top.length > 0 ? (
        <ul className="v4-hub-commit-list">
          {top.map((c, i) => {
            const isOverdue = c.status === "overdue";
            return (
              <li
                // Commitment has no id (text+client is its dedup key);
                // the list is a stable top-3 derived synchronously, so
                // a composite key is collision-safe and churn-free.
                key={`${c.text} ${c.client} ${i}`}
                className={`v4-hub-commit-item${
                  isOverdue ? " v4-hub-commit-item--overdue" : ""
                }`}
              >
                <span
                  className={`v4-hub-commit-badge v4-hub-commit-badge--${
                    isOverdue ? "overdue" : "soon"
                  }`}
                >
                  {isOverdue ? "Просрочено" : formatRelative(c.due)}
                </span>
                <span className="v4-hub-commit-title">{c.text}</span>
                {c.client ? (
                  <span className="v4-hub-commit-owner">{c.client}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon="check-big" text="Все обещания в срок" />
      )}

      <FooterLink onClick={() => onOpenTab("decisions")} />
    </section>
  );
}

// ─── Shared primitives ──────────────────────────────────────────────────

interface EmptyStateProps {
  icon: IconName;
  text: string;
  hint?: string;
}

function EmptyState({ icon, text, hint }: EmptyStateProps) {
  // No live-region role — these states are static page content, not
  // status announcements; the surrounding <section aria-labelledby>
  // already gives screen readers the context.
  return (
    <div className="v4-hub-mini-empty">
      <span className="v4-hub-mini-empty-ic" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <p className="v4-hub-mini-empty-text">{text}</p>
      {hint ? <p className="v4-hub-mini-empty-hint">{hint}</p> : null}
    </div>
  );
}

interface FooterLinkProps {
  onClick: () => void;
}

function FooterLink({ onClick }: FooterLinkProps) {
  return (
    <footer className="v4-hub-mini-foot">
      <button
        type="button"
        className="v4-hub-mini-link"
        onClick={onClick}
      >
        Открыть полностью →
      </button>
    </footer>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Filter + sort commitments for the Overview surface. Overdue first,
 * then due-within-7-days by `due` asc, top 3. Done commitments are
 * always dropped. Malformed ISO dates are skipped (Date.parse → NaN)
 * instead of throwing.
 *
 * Note: `commitments` here may carry the persisted `open`/`done` only
 * (the producer doesn't always pre-derive `overdue`), so this also
 * treats a past-due `open` as urgent rather than relying solely on a
 * pre-set `overdue` status.
 *
 * Lives outside React (no hook) so react-hooks/purity doesn't flag
 * Date.now(); callers run it synchronously every render.
 */
function filterUrgentCommitments(commitments: Commitment[]): Commitment[] {
  const now = Date.now();
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

  return commitments
    .filter((c) => {
      if (c.status === "done") return false;
      if (c.status === "overdue") return true;
      const due = Date.parse(c.due);
      if (Number.isNaN(due)) return false;
      return due <= weekFromNow;
    })
    .sort((a, b) => {
      const aOver = a.status === "overdue" ? 0 : 1;
      const bOver = b.status === "overdue" ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return a.due.localeCompare(b.due);
    })
    .slice(0, 3);
}

function severityLabel(severity: Risk["severity"]): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return severity;
  }
}

/**
 * Tiny relative-time formatter for ISO timestamps. Stays inline to avoid
 * pulling in a heavy locale lib for four mini-blocks; the strings are
 * Russian per repo convention. Past timestamps render as "N мин/ч/дн
 * назад", future ones as "через N мин/ч/дн".
 */
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = t - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);

  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;

  let value: number;
  let unit: string;
  if (abs < min) {
    return past ? "только что" : "сейчас";
  } else if (abs < hr) {
    value = Math.round(abs / min);
    unit = "мин";
  } else if (abs < day) {
    value = Math.round(abs / hr);
    unit = "ч";
  } else {
    value = Math.round(abs / day);
    unit = "дн";
  }
  return past ? `${value} ${unit} назад` : `через ${value} ${unit}`;
}
