import { useEffect, useRef, useState } from "react";
import { useResearch } from "../hooks/useResearch";
import type { ProjectResearch, ResearchData, DiscoveryData, DiscoverySuggestion } from "../types";

interface Props {
  repos: string[];
}

const EFFORT_BADGE: Record<string, string> = {
  S: "rsh-effort-s",
  M: "rsh-effort-m",
  L: "rsh-effort-l",
  XL: "rsh-effort-xl",
};

const IMPACT_BADGE: Record<string, string> = {
  critical: "rsh-impact-critical",
  high: "rsh-impact-high",
  medium: "rsh-impact-medium",
  low: "rsh-impact-low",
};

function EffortBadge({ effort }: { effort: string }) {
  if (!effort) return null;
  return <span className={`rsh-badge ${EFFORT_BADGE[effort] ?? ""}`}>{effort}</span>;
}

function ImpactBadge({ impact }: { impact: string }) {
  if (!impact) return null;
  return <span className={`rsh-badge ${IMPACT_BADGE[impact] ?? ""}`}>{impact}</span>;
}

// ── Competitor Matrix ──

function CompetitorMatrix({ research }: { research: ResearchData }) {
  const { featureMatrix, competitors } = research;
  const features = Object.keys(featureMatrix);
  if (!features.length && !competitors.length) return null;

  // If we have a matrix table, show it
  if (features.length > 0) {
    const compNames = new Set<string>();
    for (const row of Object.values(featureMatrix)) {
      for (const key of Object.keys(row)) compNames.add(key);
    }
    const headers = Array.from(compNames);

    return (
      <div className="rsh-section">
        <h3 className="rsh-section-title">Матрица функций</h3>
        <div className="rsh-table-wrap">
          <table className="rsh-table">
            <thead>
              <tr>
                <th>Функция</th>
                {headers.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f}>
                  <td className="rsh-feature-name">{f}</td>
                  {headers.map((h) => {
                    const val = featureMatrix[f]?.[h] ?? "—";
                    const isYes = /✅|\byes\b|\bда\b|\+/i.test(val);
                    const isNo = /❌|\bno\b|\bнет\b|^−$|^-$/i.test(val);
                    return (
                      <td key={h} className={isYes ? "rsh-cell-yes" : isNo ? "rsh-cell-no" : ""}>
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
    );
  }

  // Fallback: show competitor cards
  return (
    <div className="rsh-section">
      <h3 className="rsh-section-title">Конкуренты ({competitors.length})</h3>
      <div className="rsh-cards">
        {competitors.map((c) => (
          <div key={c.name} className="rsh-card">
            <div className="rsh-card-title">{c.name}</div>
            {c.url && <div className="rsh-card-url">{c.url}</div>}
            {c.pricing && <div className="rsh-card-meta">Цена: {c.pricing}</div>}
            {c.audience && <div className="rsh-card-meta">Аудитория: {c.audience}</div>}
            {c.features.length > 0 && (
              <ul className="rsh-card-features">
                {c.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pain Points ──

function PainPoints({ research }: { research: ResearchData }) {
  if (!research.painPoints.length) return null;
  return (
    <div className="rsh-section">
      <h3 className="rsh-section-title">Болевые точки ({research.painPoints.length})</h3>
      <ul className="rsh-list">
        {research.painPoints.map((p, i) => (
          <li key={i} className="rsh-list-item rsh-pain">{p.theme}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Opportunities ──

function Opportunities({ research }: { research: ResearchData }) {
  if (!research.opportunities.length) return null;
  return (
    <div className="rsh-section">
      <h3 className="rsh-section-title">Возможности ({research.opportunities.length})</h3>
      <ul className="rsh-list">
        {research.opportunities.map((o, i) => (
          <li key={i} className="rsh-list-item rsh-opp">{o}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Discovery Suggestions ──

function SuggestionCard({ s }: { s: DiscoverySuggestion }) {
  return (
    <div className="rsh-suggestion">
      <div className="rsh-suggestion-header">
        <span className="rsh-suggestion-name">{s.name}</span>
        <span className="rsh-suggestion-badges">
          <EffortBadge effort={s.effort} />
          <ImpactBadge impact={s.impact} />
        </span>
      </div>
      {s.description && <div className="rsh-suggestion-desc">{s.description}</div>}
      {s.evidence && <div className="rsh-suggestion-evidence">Источник: {s.evidence}</div>}
    </div>
  );
}

function DiscoverySection({ discovery }: { discovery: DiscoveryData }) {
  const { quickWins, strategicBets, niceToHaves } = discovery;
  if (!quickWins.length && !strategicBets.length && !niceToHaves.length) return null;

  return (
    <>
      {quickWins.length > 0 && (
        <div className="rsh-section">
          <h3 className="rsh-section-title rsh-title-qw">
            Quick Wins ({quickWins.length})
          </h3>
          <div className="rsh-suggestions">
            {quickWins.map((s, i) => <SuggestionCard key={i} s={s} />)}
          </div>
        </div>
      )}
      {strategicBets.length > 0 && (
        <div className="rsh-section">
          <h3 className="rsh-section-title rsh-title-sb">
            Strategic Bets ({strategicBets.length})
          </h3>
          <div className="rsh-suggestions">
            {strategicBets.map((s, i) => <SuggestionCard key={i} s={s} />)}
          </div>
        </div>
      )}
      {niceToHaves.length > 0 && (
        <div className="rsh-section">
          <h3 className="rsh-section-title rsh-title-nth">
            Nice to Have ({niceToHaves.length})
          </h3>
          <div className="rsh-suggestions">
            {niceToHaves.map((s, i) => <SuggestionCard key={i} s={s} />)}
          </div>
        </div>
      )}
    </>
  );
}

// ── Project Panel ──

function ProjectPanel({ pr }: { pr: ProjectResearch }) {
  const [expanded, setExpanded] = useState(false);
  const hasData = pr.research || pr.discovery;

  const stats = {
    competitors: pr.research?.competitors.length ?? 0,
    painPoints: pr.research?.painPoints.length ?? 0,
    suggestions: pr.discovery?.suggestions.length ?? 0,
    quickWins: pr.discovery?.quickWins.length ?? 0,
  };

  return (
    <div className={`rsh-project ${expanded ? "rsh-project-expanded" : ""}`}>
      <div className="rsh-project-header" onClick={() => hasData && setExpanded(!expanded)}>
        <div className="rsh-project-name">
          {pr.repo}
          {pr.loading && <span className="rsh-loading-dot" />}
        </div>
        <div className="rsh-project-stats">
          {hasData ? (
            <>
              {stats.competitors > 0 && <span className="rsh-stat">{stats.competitors} конкур.</span>}
              {stats.painPoints > 0 && <span className="rsh-stat">{stats.painPoints} проблем</span>}
              {stats.suggestions > 0 && <span className="rsh-stat">{stats.suggestions} идей</span>}
              {stats.quickWins > 0 && <span className="rsh-stat rsh-stat-qw">{stats.quickWins} QW</span>}
            </>
          ) : (
            <span className="rsh-stat rsh-stat-empty">{pr.error ?? "Нет данных"}</span>
          )}
        </div>
        {hasData && (
          <span className="rsh-chevron">{expanded ? "▾" : "▸"}</span>
        )}
      </div>

      {expanded && hasData && (
        <div className="rsh-project-body">
          {pr.research && (
            <>
              <CompetitorMatrix research={pr.research} />
              <PainPoints research={pr.research} />
              <Opportunities research={pr.research} />
            </>
          )}
          {pr.discovery && <DiscoverySection discovery={pr.discovery} />}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──

export function ResearchTab({ repos }: Props) {
  const { projects, loading, refresh } = useResearch();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current && repos.length > 0) {
      loadedRef.current = true;
      refresh(repos);
    }
  }, [repos, refresh]);

  const totalSuggestions = projects.reduce((n, p) => n + (p.discovery?.suggestions.length ?? 0), 0);
  const totalQuickWins = projects.reduce((n, p) => n + (p.discovery?.quickWins.length ?? 0), 0);
  const projectsWithData = projects.filter((p) => p.research || p.discovery).length;

  return (
    <div className="bento-panel span-12 panel-projects">
      <div className="bento-panel-title">
        <div>
          Research / Discovery
          <span className="audit-header-sub">RESEARCH.md + DISCOVERY.md из репозиториев</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => refresh(repos)} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {loading && projects.length === 0 && (
        <div className="rsh-loading">
          <div className="audit-spinner" />
          Загрузка данных из репозиториев...
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="empty-state">Нажмите «Обновить» для загрузки данных</div>
      )}

      {projects.length > 0 && (
        <>
          <div className="rsh-summary">
            <div className="rsh-summary-item">
              <div className="rsh-summary-value">{projectsWithData}</div>
              <div className="rsh-summary-label">проектов с данными</div>
            </div>
            <div className="rsh-summary-item">
              <div className="rsh-summary-value">{totalSuggestions}</div>
              <div className="rsh-summary-label">идей всего</div>
            </div>
            <div className="rsh-summary-item rsh-summary-qw">
              <div className="rsh-summary-value">{totalQuickWins}</div>
              <div className="rsh-summary-label">quick wins</div>
            </div>
          </div>

          <div className="rsh-projects">
            {projects.map((pr) => <ProjectPanel key={pr.repo} pr={pr} />)}
          </div>
        </>
      )}
    </div>
  );
}
