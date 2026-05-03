import { useState } from "react";
import type { HealthFinding, HealthReport } from "../../../types/health";
import { LAYER_NAMES } from "../../../types/health";
import { Icon, type IconName } from "./Icon";
import { groupByLayer, pluralize, sortFindings } from "./utils";

interface BoardProps {
  report: HealthReport;
}

// Top-level findings layout. fails + unknowns get rich grouped views;
// pass and skipped collapse into compact lists below.
export function FindingsBoard({ report }: BoardProps) {
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
}

function ActionGroup({ title, subtitle, tone, icon, findings, showActions, defaultOpen }: ActionGroupProps) {
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
            <LayerBlock key={layerId} layerId={layerId} findings={byLayer[layerId]} showActions={showActions} />
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
}

function LayerBlock({ layerId, findings, showActions }: LayerBlockProps) {
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
          <FindingItem key={f.rule_id} f={f} showActions={showActions} idx={i} />
        ))}
      </ul>
    </div>
  );
}

interface FindingItemProps {
  f: HealthFinding;
  showActions?: boolean;
  idx: number;
}

function FindingItem({ f, showActions, idx }: FindingItemProps) {
  const [open, setOpen] = useState(false);
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
          {showActions && (
            <button type="button" className="v4-btn v4-btn--pri ph-fi-issue" disabled title="Доступно после iteration 4">
              <Icon name="git-branch" /> Создать issue
            </button>
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
