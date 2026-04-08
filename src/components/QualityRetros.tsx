import type { RetroSummary, RetroDetail, RuleChangeAction } from "../types";

const VALID_ACTIONS: RuleChangeAction[] = ["add", "modify", "remove"];

function actionClass(action: RuleChangeAction): string {
  return VALID_ACTIONS.includes(action) ? `qr-rule-action--${action}` : "";
}

// ── RetroList ───────────────────────────────────────────────────────

interface RetroListProps {
  retros: RetroSummary[];
  retroRunning: boolean;
  onSelect: (period: string) => void;
  onRunRetro: (period?: string) => void;
}

export function RetroList({ retros, retroRunning, onSelect, onRunRetro }: RetroListProps) {
  return (
    <div className="qr-list">
      <div className="qr-list-header">
        <span className="qr-list-count">{retros.length} ретроспектив</span>
        <button
          className="btn btn-sm btn-primary"
          disabled={retroRunning}
          onClick={() => onRunRetro()}
        >
          {retroRunning ? "Запуск…" : "▶ Run Retro"}
        </button>
      </div>

      {retros.length === 0 ? (
        <div className="qr-empty">
          Ретроспективы ещё не проводились. Нажмите «Run Retro» для запуска.
        </div>
      ) : (
        <div className="qr-items">
          {retros.map((r) => (
            <button
              key={r.period}
              className="qr-item"
              onClick={() => onSelect(r.period)}
            >
              <div className="qr-item-period">{r.period}</div>
              <div className="qr-item-summary">{r.summary}</div>
              <div className="qr-item-stats">
                <span className="qr-stat" title="Паттерны">{r.patterns_count} паттернов</span>
                <span className="qr-stat" title="Рекомендации">{r.recommendations_count} рекомендаций</span>
                <span className="qr-stat" title="Изменения правил">{r.rule_changes_count} изменений</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RetroDetailView ─────────────────────────────────────────────────

interface RetroDetailProps {
  detail: RetroDetail;
  onBack: () => void;
}

export function RetroDetailView({ detail, onBack }: RetroDetailProps) {
  return (
    <div className="qr-detail">
      <div className="qr-detail-header">
        <button className="btn btn-sm" onClick={onBack}>← Назад</button>
        <h3 className="qr-detail-title">Ретроспектива: {detail.period}</h3>
      </div>

      {/* Summary */}
      <div className="qr-detail-section">
        <div className="qr-detail-label">Итоги</div>
        <p className="qr-detail-text">{detail.summary}</p>
      </div>

      {/* Top Patterns */}
      {detail.top_patterns.length > 0 && (
        <div className="qr-detail-section">
          <div className="qr-detail-label">
            Основные паттерны ({detail.top_patterns.length})
          </div>
          <div className="qr-patterns">
            {detail.top_patterns.map((p, i) => (
              <div key={i} className="qr-pattern">
                <div className="qr-pattern-header">
                  <span className="qr-pattern-name">{p.pattern}</span>
                  <span className="qr-pattern-count">×{p.count}</span>
                </div>
                {p.examples.length > 0 && (
                  <ul className="qr-pattern-examples">
                    {p.examples.map((ex, j) => (
                      <li key={j}>{ex}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {detail.recommendations.length > 0 && (
        <div className="qr-detail-section">
          <div className="qr-detail-label">
            Рекомендации ({detail.recommendations.length})
          </div>
          <ul className="qr-recommendations">
            {detail.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Proposed Rule Changes */}
      {detail.proposed_rule_changes.length > 0 && (
        <div className="qr-detail-section">
          <div className="qr-detail-label">
            Предложенные изменения правил ({detail.proposed_rule_changes.length})
          </div>
          <div className="qr-rule-changes">
            {detail.proposed_rule_changes.map((rc, i) => (
              <div key={i} className="qr-rule-change">
                <div className="qr-rule-header">
                  <span className="qr-rule-name">{rc.rule}</span>
                  <span className={`qr-rule-action ${actionClass(rc.action)}`}>
                    {rc.action}
                  </span>
                </div>
                <div className="qr-rule-rationale">{rc.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
