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
  const totalOpen = metrics.todoCount + metrics.inProgressCount + metrics.reviewCount;
  const pctDone = metrics.totalIssues > 0
    ? Math.round((metrics.doneCount / metrics.totalIssues) * 100)
    : 0;

  return (
    <div className="bento-panel span-4 panel-summary">
      <div className="summary-inner">
        <div className="bento-panel-title">
          <span>Сводка задач</span>
        </div>

        <div className="summary-main">
          <div className="progress-ring-container">
            <div className="progress-ring" style={{ "--pct": `${pctDone}%` } as React.CSSProperties}>
              <div className="ring-content">
                <span className="ring-value">{pctDone}%</span>
                <span className="ring-label">Готово</span>
              </div>
            </div>
          </div>

          <div className="summary-stats-grid">
            <div className="stat-item stat-item--primary">
              <span className="stat-value val-success">{metrics.doneCount}</span>
              <span className="stat-label">Сделано</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{metrics.totalIssues}</span>
              <span className="stat-label">Всего</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{totalOpen}</span>
              <span className="stat-label">Открыто</span>
            </div>
          </div>
        </div>
      </div>

      {hasFinances && (
        <div className="summary-footer" onClick={onFinanceClick}>
          <div className="finance-row">
            <div className="finance-block">
              <div className="finance-icon-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 0 0 4h15a1 1 0 0 0 1-1v-2"/></svg></div>
              <div className="finance-text">
                <span className="finance-val">{compactUSD(metrics.totalBudget)}</span>
                <span className="finance-lbl">БЮДЖЕТ</span>
              </div>
            </div>
            <div className="finance-block">
              <div className="finance-icon-box finance-icon-box--success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg></div>
              <div className="finance-text">
                <span className="finance-val val-success">{compactUSD(metrics.totalPaid)}</span>
                <span className="finance-lbl">ОПЛАЧЕНО</span>
              </div>
            </div>
            <div className="finance-block">
              <div className="finance-icon-box finance-icon-box--warn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
              <div className="finance-text">
                <span className="finance-val val-warning">{compactUSD(metrics.totalRemaining)}</span>
                <span className="finance-lbl">ОСТАТОК</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
