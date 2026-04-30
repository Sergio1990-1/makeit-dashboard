import { useState } from "react";
import type { DiscoveryData, DiscoverySuggestion, ProjectResearch, ResearchData } from "../../../types";
import { effortTagClass, impactTagClass } from "./utils";

interface Props {
  pr: ProjectResearch;
  agentStarting: boolean;
  onLaunchResearch: (repo: string) => void;
  onLaunchDiscovery: (repo: string) => void;
}

type Section = "competitors" | "pains" | "opportunities" | "discovery";

export function ResearchProjectCardV4({
  pr,
  agentStarting,
  onLaunchResearch,
  onLaunchDiscovery,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  // Pre-open the Discovery section by default — it's the most useful view
  // for an actively-investigated project. Initialising openSection here
  // (rather than passing defaultOpen down) keeps the parent state in sync
  // with what's visually open, so the first toggle click closes correctly.
  const [openSection, setOpenSection] = useState<Section | null>("discovery");

  const hasResearch = !!pr.research;
  const hasDiscovery = !!pr.discovery;
  const hasData = hasResearch || hasDiscovery;
  const totalIdeas = pr.discovery?.suggestions.length ?? 0;
  const quickWins = pr.discovery?.quickWins.length ?? 0;
  const competitors = pr.research?.competitors.length ?? 0;
  const pains = pr.research?.painPoints.length ?? 0;
  const opportunities = pr.research?.opportunities.length ?? 0;

  const health: "ok" | "warn" | "unknown" =
    hasResearch && hasDiscovery ? "ok"
    : hasData ? "warn"
    : "unknown";

  function toggleExpand() {
    if (!hasData) return;
    setExpanded((v) => !v);
  }

  function toggleSection(s: Section) {
    setOpenSection((cur) => (cur === s ? null : s));
  }

  return (
    <div className={`v4-rsh-card v4-rsh-card--${health}${expanded ? " is-expanded" : ""}`}>
      {/* Header is a row of plain spans + nested buttons + an explicit
          expand <button> at the end. We deliberately do NOT make the
          whole row a role="button" — that would nest interactive elements
          (the action buttons) inside another interactive element, which
          violates WCAG 4.1.1 and breaks screen-reader navigation. */}
      <div className="v4-rsh-card-h">
        <div className="v4-rsh-card-name">
          <span className="v4-rsh-card-title">{pr.repo}</span>
          {pr.loading && <span className="v4-rsh-card-loading" aria-label="Загрузка" />}
          {hasResearch && <span className="v4-tag v4-tag--ok">research</span>}
          {hasDiscovery && <span className="v4-tag v4-tag--ok">discovery</span>}
          {!hasData && !pr.loading && (
            <span className="v4-tag v4-rsh-text-muted">{pr.error ?? "нет данных"}</span>
          )}
        </div>

        <div className="v4-rsh-card-stats">
          {competitors > 0 && (
            <span className="v4-rsh-card-stat" title="Конкуренты">
              <b>{competitors}</b> конк.
            </span>
          )}
          {pains > 0 && (
            <span className="v4-rsh-card-stat" title="Болевые точки">
              <b>{pains}</b> болей
            </span>
          )}
          {totalIdeas > 0 && (
            <span className="v4-rsh-card-stat" title="Идеи из discovery">
              <b>{totalIdeas}</b> идей
            </span>
          )}
          {quickWins > 0 && (
            <span className="v4-rsh-card-stat v4-rsh-text-success" title="Quick wins">
              <b>{quickWins}</b> QW
            </span>
          )}
        </div>

        <div className="v4-rsh-card-actions">
          <button
            type="button"
            className="v4-btn"
            onClick={() => onLaunchResearch(pr.repo)}
            disabled={agentStarting}
            title="Запустить Research агента"
          >
            Research
          </button>
          {hasResearch && (
            <button
              type="button"
              className="v4-btn"
              onClick={() => onLaunchDiscovery(pr.repo)}
              disabled={agentStarting}
              title="Запустить Discovery агента (требует RESEARCH.md)"
            >
              Discovery
            </button>
          )}
        </div>

        {hasData && (
          <button
            type="button"
            className="v4-rsh-card-chevron"
            onClick={toggleExpand}
            disabled={!hasData}
            aria-expanded={hasData ? expanded : undefined}
            aria-label={expanded ? `Свернуть ${pr.repo}` : `Развернуть ${pr.repo}`}
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
      </div>

      {expanded && hasData && (
        <div className="v4-rsh-card-body">
          {hasResearch && pr.research && (
            <CompetitorMatrix research={pr.research} />
          )}
          {hasResearch && pr.research && pr.research.painPoints.length > 0 && (
            <CollapsibleSection
              title={`Болевые точки (${pains})`}
              isOpen={openSection === "pains"}
              onToggle={() => toggleSection("pains")}
              tone="warn"
            >
              <ul className="v4-rsh-list">
                {pr.research.painPoints.map((p) => (
                  <li key={p.theme}>{p.theme}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
          {hasResearch && pr.research && pr.research.opportunities.length > 0 && (
            <CollapsibleSection
              title={`Возможности (${opportunities})`}
              isOpen={openSection === "opportunities"}
              onToggle={() => toggleSection("opportunities")}
              tone="ok"
            >
              <ul className="v4-rsh-list">
                {pr.research.opportunities.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
          {hasDiscovery && pr.discovery && (
            <CollapsibleSection
              title={`Discovery идеи (${totalIdeas})`}
              isOpen={openSection === "discovery"}
              onToggle={() => toggleSection("discovery")}
              tone="ok"
            >
              <DiscoverySection discovery={pr.discovery} />
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  tone: "ok" | "warn";
  children: React.ReactNode;
}

function CollapsibleSection({ title, isOpen, onToggle, tone, children }: SectionProps) {
  return (
    <div className={`v4-rsh-section v4-rsh-section--${tone}`}>
      <button
        type="button"
        className="v4-rsh-section-h"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="v4-rsh-section-arrow" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
        <span className="v4-rsh-section-title">{title}</span>
      </button>
      {isOpen && <div className="v4-rsh-section-body">{children}</div>}
    </div>
  );
}

function CompetitorMatrix({ research }: { research: ResearchData }) {
  const { featureMatrix, competitors } = research;
  const features = Object.keys(featureMatrix);

  if (features.length === 0 && competitors.length === 0) return null;

  // Matrix view
  if (features.length > 0) {
    const compNames = new Set<string>();
    for (const row of Object.values(featureMatrix)) {
      for (const key of Object.keys(row)) compNames.add(key);
    }
    const headers = Array.from(compNames);
    return (
      <div className="v4-rsh-section v4-rsh-section--neutral">
        <div className="v4-rsh-section-h-static">
          <span className="v4-rsh-section-title">Матрица функций</span>
        </div>
        <div className="v4-rsh-section-body">
          <div className="v4-rsh-matrix-wrap">
            <table className="v4-rsh-matrix">
              <thead>
                <tr>
                  <th>Функция</th>
                  {headers.map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f}>
                    <td className="v4-rsh-matrix-feature">{f}</td>
                    {headers.map((h) => {
                      const val = featureMatrix[f]?.[h] ?? "—";
                      const isYes = /✅|\byes\b|\bда\b|\+/i.test(val);
                      const isNo = /❌|\bno\b|\bнет\b|^−$|^-$/i.test(val);
                      return (
                        <td
                          key={h}
                          className={isYes ? "v4-rsh-cell-yes" : isNo ? "v4-rsh-cell-no" : ""}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: cards
  return (
    <div className="v4-rsh-section v4-rsh-section--neutral">
      <div className="v4-rsh-section-h-static">
        <span className="v4-rsh-section-title">Конкуренты ({competitors.length})</span>
      </div>
      <div className="v4-rsh-section-body">
        <div className="v4-rsh-comp-grid">
          {competitors.map((c) => (
            <div key={c.name} className="v4-rsh-comp">
              <div className="v4-rsh-comp-name">{c.name}</div>
              {c.url && <div className="v4-rsh-comp-url v4-pl-mono">{c.url}</div>}
              {c.pricing && <div className="v4-rsh-comp-meta">Цена: {c.pricing}</div>}
              {c.audience && <div className="v4-rsh-comp-meta">Аудитория: {c.audience}</div>}
              {c.features.length > 0 && (
                <ul className="v4-rsh-comp-features">
                  {c.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoverySection({ discovery }: { discovery: DiscoveryData }) {
  const { quickWins, strategicBets, niceToHaves } = discovery;
  return (
    <div className="v4-rsh-disc">
      {quickWins.length > 0 && (
        <DiscoveryGroup title="Quick Wins" suggestions={quickWins} accent="ok" />
      )}
      {strategicBets.length > 0 && (
        <DiscoveryGroup title="Strategic Bets" suggestions={strategicBets} accent="warn" />
      )}
      {niceToHaves.length > 0 && (
        <DiscoveryGroup title="Nice to Have" suggestions={niceToHaves} accent="neutral" />
      )}
    </div>
  );
}

function DiscoveryGroup({
  title,
  suggestions,
  accent,
}: {
  title: string;
  suggestions: DiscoverySuggestion[];
  accent: "ok" | "warn" | "neutral";
}) {
  return (
    <div className={`v4-rsh-disc-group v4-rsh-disc-group--${accent}`}>
      <div className="v4-rsh-disc-group-h">
        <span className="v4-rsh-disc-group-t">{title}</span>
        <span className="v4-pl-mono v4-rsh-text-muted">{suggestions.length}</span>
      </div>
      <div className="v4-rsh-disc-list">
        {suggestions.map((s, i) => (
          // Composite key to handle near-duplicates: name should be unique
          // most of the time; the description prefix breaks ties; index is
          // a last-resort fallback if both name+description collide.
          <div
            key={`${s.name}::${(s.description ?? "").slice(0, 40)}::${i}`}
            className="v4-rsh-disc-item"
          >
            <div className="v4-rsh-disc-h">
              <span className="v4-rsh-disc-name">{s.name}</span>
              <div className="v4-rsh-disc-badges">
                {s.effort && <span className={effortTagClass(s.effort)}>{s.effort}</span>}
                {s.impact && <span className={impactTagClass(s.impact)}>{s.impact}</span>}
              </div>
            </div>
            {s.description && <div className="v4-rsh-disc-desc">{s.description}</div>}
            {s.evidence && (
              <div className="v4-rsh-disc-evidence">Источник: {s.evidence}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
