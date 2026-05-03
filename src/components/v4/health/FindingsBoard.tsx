import { useState } from "react";
import type { HealthFinding, HealthReport } from "../../../types/health";
import { LAYER_NAMES } from "../../../types/health";
import { Icon, type IconName } from "./Icon";
import { groupByLayer, pluralize, sortFindings } from "./utils";

// Per-finding action state machine for the «→ issue» button.
// Lives in ProjectHealthPage so re-renders of FindingsBoard don't reset it
// and a finding's terminal state (created/duplicate) is preserved.
export type FindingActionState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "created"; number: number; url: string }
  | { kind: "duplicate"; number: number; url: string }
  | { kind: "error"; message: string };

export interface FindingsBoardProps {
  report: HealthReport;
  // Optional: when omitted (e.g. tests / preview) the «→ issue» button is
  // not rendered at all — the board stays a pure presentational component.
  actionStates?: Map<string, FindingActionState>;
  onCreateIssue?: (finding: HealthFinding) => void;
  hasToken?: boolean;
}

// Top-level findings layout. fails + unknowns get rich grouped views;
// pass and skipped collapse into compact lists below.
export function FindingsBoard({ report, actionStates, onCreateIssue, hasToken }: FindingsBoardProps) {
  const fails = sortFindings(report.findings.filter((f) => f.status === "fail"));
  const unknowns = sortFindings(report.findings.filter((f) => f.status === "unknown"));
  const passes = report.findings.filter((f) => f.status === "pass");
  const skipped = report.findings.filter((f) => f.status === "skipped");

  return (
    <div className="ph-board">
      {fails.length === 0 && unknowns.length === 0 && (
        <CleanCelebration repo={report.repo} count={passes.length} />
      )}
      {fails.length > 0 && (
        <ActionGroup
          title="Требует внимания"
          subtitle={`${fails.length} ${pluralize(fails.length, "нарушение", "нарушения", "нарушений")} по чек-листу`}
          tone="danger"
          icon="alert"
          findings={fails}
          showActions
          defaultOpen
          actionStates={actionStates}
          onCreateIssue={onCreateIssue}
          hasToken={hasToken}
        />
      )}
      {unknowns.length > 0 && (
        <ActionGroup
          title="Ждут drift-проверки"
          subtitle={`${unknowns.length} проверок отложены до запуска LLM-сканирования`}
          tone="warn"
          icon="clock"
          findings={unknowns}
          defaultOpen={fails.length === 0}
        />
      )}
      {passes.length > 0 && (
        <CollapsibleGroup title="Что в порядке" count={passes.length} tone="good" icon="check">
          <PassGrid findings={passes} />
        </CollapsibleGroup>
      )}
      {skipped.length > 0 && (
        <CollapsibleGroup title="Не применимо к этому проекту" count={skipped.length} tone="muted" icon="skip">
          <SkippedList findings={skipped} />
        </CollapsibleGroup>
      )}
    </div>
  );
}

interface ActionGroupProps {
  title: string;
  subtitle: string;
  tone: "danger" | "warn" | "good" | "muted";
  icon: IconName;
  findings: HealthFinding[];
  showActions?: boolean;
  defaultOpen?: boolean;
  actionStates?: Map<string, FindingActionState>;
  onCreateIssue?: (finding: HealthFinding) => void;
  hasToken?: boolean;
}

function ActionGroup({
  title,
  subtitle,
  tone,
  icon,
  findings,
  showActions,
  defaultOpen,
  actionStates,
  onCreateIssue,
  hasToken,
}: ActionGroupProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const byLayer = groupByLayer(findings);
  const layerIds = (Object.keys(byLayer) as unknown as Array<keyof typeof byLayer>)
    .map((k) => Number(k) as 1 | 2 | 3 | 4)
    .filter((id) => byLayer[id].length > 0)
    .sort();
  return (
    <section className={`ph-group ph-group--${tone}`}>
      <header className="ph-group-h" onClick={() => setOpen(!open)}>
        <div className={`ph-group-icon ph-group-icon--${tone}`}><Icon name={icon} /></div>
        <div className="ph-group-titles">
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className={`ph-chevron ${open ? "is-open" : ""}`}><Icon name="chev" /></span>
      </header>
      {open && (
        <div className="ph-group-body">
          {layerIds.map((layerId) => (
            <LayerBlock
              key={layerId}
              layerId={layerId}
              findings={byLayer[layerId]}
              showActions={showActions}
              actionStates={actionStates}
              onCreateIssue={onCreateIssue}
              hasToken={hasToken}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface LayerBlockProps {
  layerId: 1 | 2 | 3 | 4;
  findings: HealthFinding[];
  showActions?: boolean;
  actionStates?: Map<string, FindingActionState>;
  onCreateIssue?: (finding: HealthFinding) => void;
  hasToken?: boolean;
}

function LayerBlock({ layerId, findings, showActions, actionStates, onCreateIssue, hasToken }: LayerBlockProps) {
  return (
    <div className="ph-layerblock">
      <div className="ph-layerblock-h">
        <span className="ph-layerblock-num v4-mono">L{layerId}</span>
        <span className="ph-layerblock-name">{LAYER_NAMES[layerId]}</span>
        <span className="ph-layerblock-count v4-mono">
          {findings.length} {pluralize(findings.length, "пункт", "пункта", "пунктов")}
        </span>
      </div>
      <ul className="ph-finding-list">
        {findings.map((f, i) => (
          <FindingItem
            key={f.rule_id}
            f={f}
            showActions={showActions}
            idx={i}
            actionState={actionStates?.get(f.rule_id) ?? { kind: "idle" }}
            onCreateIssue={onCreateIssue}
            hasToken={hasToken}
          />
        ))}
      </ul>
    </div>
  );
}

interface FindingItemProps {
  f: HealthFinding;
  showActions?: boolean;
  idx: number;
  actionState: FindingActionState;
  onCreateIssue?: (finding: HealthFinding) => void;
  hasToken?: boolean;
}

function FindingItem({ f, showActions, idx, actionState, onCreateIssue, hasToken }: FindingItemProps) {
  const [open, setOpen] = useState(false);
  // The «→ issue» button is only meaningful for fails. unknown/pass/skipped
  // all live outside the actionable groups, but defend in depth so future
  // refactors don't accidentally show it.
  const canCreateIssue = showActions && f.status === "fail" && !!onCreateIssue;
  return (
    <li
      className={`ph-fi ph-fi--${f.status} ph-fi--sev-${f.severity}`}
      style={{ animationDelay: `${idx * 35}ms` }}
    >
      <div className="ph-fi-top">
        <SeverityTag severity={f.severity} status={f.status} />
        <div className="ph-fi-main">
          <div className="ph-fi-title">
            <span>{f.title}</span>
            <span className="ph-fi-rule v4-mono">{f.rule_id}</span>
          </div>
          {f.detail && <div className="ph-fi-detail">{f.detail}</div>}
          {f.source && (
            <div className="ph-fi-source v4-mono">
              <Icon name="book" /> {f.source}
            </div>
          )}
        </div>
        <div className="ph-fi-actions">
          {f.remediation && (
            <button type="button" className="v4-btn ph-fi-toggle" onClick={() => setOpen(!open)}>
              <Icon name={open ? "chev-up" : "lightbulb"} />
              {open ? "Скрыть" : "Что делать"}
            </button>
          )}
          {canCreateIssue && (
            <IssueButton
              state={actionState}
              hasToken={!!hasToken}
              onCreate={() => onCreateIssue!(f)}
            />
          )}
        </div>
      </div>
      {open && f.remediation && (
        <div className="ph-fi-rem">
          <div className="ph-fi-rem-h"><Icon name="lightbulb" /> Рекомендация</div>
          <div className="ph-fi-rem-body">{f.remediation}</div>
        </div>
      )}
    </li>
  );
}

interface IssueButtonProps {
  state: FindingActionState;
  hasToken: boolean;
  onCreate: () => void;
}

// Visual states:
//   idle      — clickable «→ issue»
//   creating  — disabled spinner
//   created /
//   duplicate — anchor «#{N} ✓» opening the issue in a new tab; second click
//               just opens the existing issue, never creates a duplicate.
//   error     — clickable «↻ повторить»; calling onCreate flips back to creating.
//
// When no GitHub token is present we render a disabled button with a tooltip
// instead of trying to act and exploding inside github-actions.ts.
function IssueButton({ state, hasToken, onCreate }: IssueButtonProps) {
  if (!hasToken) {
    return (
      <button
        type="button"
        className="v4-btn v4-btn--pri ph-fi-issue"
        disabled
        title="Нужен GitHub токен — добавьте его в настройках"
      >
        <Icon name="git-branch" /> → issue
      </button>
    );
  }

  switch (state.kind) {
    case "creating":
      return (
        <button
          type="button"
          className="v4-btn v4-btn--pri ph-fi-issue is-loading"
          disabled
          aria-label="Создаю issue…"
        >
          <span className="ph-fi-issue-spin" /> Создаю…
        </button>
      );
    case "created":
    case "duplicate":
      return (
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer noopener"
          className="v4-btn v4-btn--pri ph-fi-issue is-linked"
          title={state.kind === "duplicate" ? `Issue уже существует: #${state.number}` : `Создан issue #${state.number}`}
        >
          <Icon name="check" /> #{state.number}
        </a>
      );
    case "error":
      return (
        <button
          type="button"
          className="v4-btn ph-fi-issue is-error"
          onClick={onCreate}
          title={state.message}
        >
          <Icon name="refresh" /> Повторить
        </button>
      );
    case "idle":
    default:
      return (
        <button
          type="button"
          className="v4-btn v4-btn--pri ph-fi-issue"
          onClick={onCreate}
        >
          <Icon name="git-branch" /> → issue
        </button>
      );
  }
}

interface SeverityTagProps {
  severity: HealthFinding["severity"];
  status: HealthFinding["status"];
}

function SeverityTag({ severity, status }: SeverityTagProps) {
  if (status === "unknown") {
    return (
      <span className="ph-sev ph-sev--unknown">
        <Icon name="clock" /> unknown
      </span>
    );
  }
  return (
    <span className={`ph-sev ph-sev--${severity}`}>
      <span className="ph-sev-dot" />
      {severity}
    </span>
  );
}

interface CollapsibleProps {
  title: string;
  count: number;
  tone: "danger" | "warn" | "good" | "muted";
  icon: IconName;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleGroup({ title, count, tone, icon, children, defaultOpen }: CollapsibleProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className={`ph-group ph-group--${tone}`}>
      <header className="ph-group-h" onClick={() => setOpen(!open)}>
        <div className={`ph-group-icon ph-group-icon--${tone}`}><Icon name={icon} /></div>
        <div className="ph-group-titles">
          <h3>{title}</h3>
          <p>
            {count} {pluralize(count, "пункт", "пункта", "пунктов")}
          </p>
        </div>
        <span className={`ph-chevron ${open ? "is-open" : ""}`}><Icon name="chev" /></span>
      </header>
      {open && <div className="ph-group-body ph-group-body--soft">{children}</div>}
    </section>
  );
}

function PassGrid({ findings }: { findings: HealthFinding[] }) {
  const byLayer = groupByLayer(findings);
  const layerIds = (Object.keys(byLayer) as unknown as Array<keyof typeof byLayer>)
    .map((k) => Number(k) as 1 | 2 | 3 | 4)
    .filter((id) => byLayer[id].length > 0)
    .sort();
  return (
    <div className="ph-pass-grid">
      {layerIds.map((layerId) => (
        <div className="ph-pass-col" key={layerId}>
          <div className="ph-pass-col-h">
            <span className="v4-mono">L{layerId}</span> {LAYER_NAMES[layerId]}
          </div>
          <ul>
            {byLayer[layerId].map((f) => (
              <li key={f.rule_id}>
                <Icon name="check" />
                <span>{f.title}</span>
                <span className="ph-pass-rule v4-mono">{f.rule_id}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SkippedList({ findings }: { findings: HealthFinding[] }) {
  return (
    <ul className="ph-skip-list">
      {findings.map((f) => (
        <li key={f.rule_id}>
          <span className="ph-skip-title">{f.title}</span>
          <span className="ph-skip-rule v4-mono">{f.rule_id}</span>
          {f.detail && <span className="ph-skip-detail">{f.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function CleanCelebration({ repo, count }: { repo: string; count: number }) {
  return (
    <div className="ph-clean">
      <div className="ph-clean-glyph"><Icon name="check-big" /></div>
      <h3>
        Все {count} {pluralize(count, "проверка зелёная", "проверки зелёные", "проверок зелёные")}
      </h3>
      <p>
        <span className="v4-mono">{repo}</span> следует чек-листу MakeIT. Когда что-то изменится — увидишь здесь.
      </p>
    </div>
  );
}

