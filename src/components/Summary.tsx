import type { SummaryMetrics } from "../types";

interface Props {
  metrics: SummaryMetrics;
  onFinanceClick?: () => void;
}

function compactUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

export function Summary({ metrics, onFinanceClick }: Props) {
  const hasFinances = metrics.totalBudget > 0;
  // TODO + In Progress + Review
  const totalOpen = metrics.todoCount + metrics.inProgressCount + metrics.reviewCount;
  const pctDone = metrics.totalIssues > 0
    ? Math.round((metrics.doneCount / metrics.totalIssues) * 100)
    : 0;

  return (
    <div className="bento-panel span-4 panel-metrics">
      <div className="bento-panel-title">
        Сводка задач
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color: "var(--color-text-secondary)"}}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </div>

      <div className="metric-group" style={{ alignItems: "center" }}>
        <div className="progress-ring" style={{ "--pct": `${pctDone}%` } as React.CSSProperties}>
          <div className="ring-pct-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{pctDone}%</div>
        </div>

        <div className="metrics-grid">
          <div>
            <div className="metric-value val-success">{metrics.doneCount}</div>
            <div className="metric-label">Сделано</div>
          </div>
          <div>
            <div className="metric-value val-accent">{metrics.inProgressCount}</div>
            <div className="metric-label">В процессе</div>
          </div>
          <div>
            <div className="metric-value" style={{color: "var(--color-text-secondary)"}}>{metrics.todoCount}</div>
            <div className="metric-label">TODO</div>
          </div>
          <div>
            <div className="metric-value val-danger">{totalOpen - metrics.inProgressCount - metrics.todoCount}</div>
            <div className="metric-label">Проверка/Блок</div>
          </div>
        </div>
      </div>

      {hasFinances && (
        <div 
          className="metric-finance-group" 
          onClick={onFinanceClick}
          role={onFinanceClick ? "button" : undefined}
        >
          <div className="mfg-item">
            <div className="mfg-val">{compactUSD(metrics.totalBudget)}</div>
            <div className="mfg-lbl">Бюджет</div>
          </div>
          <div className="mfg-item">
            <div className="mfg-val val-success">{compactUSD(metrics.totalPaid)}</div>
            <div className="mfg-lbl">Оплачено</div>
          </div>
          <div className="mfg-item">
            <div className="mfg-val val-warning">{compactUSD(metrics.totalRemaining)}</div>
            <div className="mfg-lbl">Остаток</div>
          </div>
        </div>
      )}
    </div>
  );
}
