import type { RetroSummary, RetroDetail, RuleChangeAction } from "../../../types";
import { formatPeriodRange } from "./utils";

const VALID_ACTIONS: RuleChangeAction[] = ["add", "modify", "remove"];

function actionTagClass(action: RuleChangeAction): string {
  if (!VALID_ACTIONS.includes(action)) return "v4-tag";
  if (action === "add") return "v4-tag v4-tag--ok";
  if (action === "remove") return "v4-tag v4-tag--danger";
  return "v4-tag";
}

interface ListProps {
  retros: RetroSummary[];
  retroRunning: boolean;
  onSelect: (period: string) => void;
}

export function RetroListV4({ retros, retroRunning, onSelect }: ListProps) {
  if (retros.length === 0) {
    return (
      <div className="v4-empty">
        {retroRunning
          ? "Запуск retro… результаты появятся через несколько секунд."
          : "Ретроспективы ещё не проводились. Нажмите «Run Retro» в шапке."}
      </div>
    );
  }

  return (
    <div className="v4-qa-retros">
      {retros.map((r) => (
        <button
          type="button"
          key={r.period}
          className="v4-qa-retro-card"
          onClick={() => onSelect(r.period)}
        >
          <div className="v4-qa-retro-period">
            <span className="v4-pl-mono">{r.period}</span>
            <span className="v4-qa-text-muted v4-qa-retro-range">
              {formatPeriodRange(r.period)}
            </span>
          </div>
          <div className="v4-qa-retro-summary" title={r.summary}>
            {r.summary}
          </div>
          <div className="v4-qa-retro-stats">
            <span className="v4-tag" title="Паттерны">
              {r.patterns_count} паттернов
            </span>
            <span className="v4-tag" title="Рекомендации">
              {r.recommendations_count} рекомендаций
            </span>
            <span className="v4-tag" title="Изменения правил">
              {r.rule_changes_count} изменений
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

interface DetailProps {
  detail: RetroDetail;
  onBack: () => void;
}

export function RetroDetailV4({ detail, onBack }: DetailProps) {
  return (
    <div className="v4-qa-retro-detail">
      <div className="v4-qa-retro-detail-h">
        <button type="button" className="v4-btn" onClick={onBack}>← Назад</button>
        <h3 className="v4-qa-retro-detail-t">
          Ретроспектива{" "}
          <span className="v4-pl-mono">{detail.period}</span>
          <span className="v4-qa-text-muted v4-qa-retro-detail-range">
            {" "}{formatPeriodRange(detail.period)}
          </span>
        </h3>
      </div>

      <div className="v4-qa-retro-section">
        <div className="v4-qa-retro-label">Итоги</div>
        <p className="v4-qa-retro-text">{detail.summary}</p>
      </div>

      {detail.top_patterns.length > 0 && (
        <div className="v4-qa-retro-section">
          <div className="v4-qa-retro-label">
            Основные паттерны ({detail.top_patterns.length})
          </div>
          <div className="v4-qa-patterns">
            {detail.top_patterns.map((p, i) => (
              <div key={i} className="v4-qa-pattern">
                <div className="v4-qa-pattern-h">
                  <span className="v4-qa-pattern-name">{p.pattern}</span>
                  <span className="v4-tag v4-pl-mono">×{p.count}</span>
                </div>
                {p.examples.length > 0 && (
                  <ul className="v4-qa-pattern-ex">
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

      {detail.recommendations.length > 0 && (
        <div className="v4-qa-retro-section">
          <div className="v4-qa-retro-label">Рекомендации ({detail.recommendations.length})</div>
          <ul className="v4-qa-recs">
            {detail.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {detail.proposed_rule_changes.length > 0 && (
        <div className="v4-qa-retro-section">
          <div className="v4-qa-retro-label">
            Предложенные изменения правил ({detail.proposed_rule_changes.length})
          </div>
          <div className="v4-qa-rules">
            {detail.proposed_rule_changes.map((rc, i) => (
              <div key={i} className="v4-qa-rule">
                <div className="v4-qa-rule-h">
                  <span className="v4-qa-rule-name">{rc.rule}</span>
                  <span className={actionTagClass(rc.action)}>{rc.action}</span>
                </div>
                <div className="v4-qa-rule-rationale">{rc.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
