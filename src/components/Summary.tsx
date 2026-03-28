import type { SummaryMetrics } from "../types";

interface Props {
  metrics: SummaryMetrics;
  onFinanceClick?: () => void;
}

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function Summary({ metrics, onFinanceClick }: Props) {
  const hasFinances = metrics.totalBudget > 0;

  return (
    <>
      <div className="summary">
        <div className="summary-card">
          <span className="summary-value">{metrics.projectCount}</span>
          <span className="summary-label">Проектов</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{metrics.totalIssues}</span>
          <span className="summary-label">Всего issues</span>
        </div>
        <div className="summary-card todo">
          <span className="summary-value">{metrics.todoCount}</span>
          <span className="summary-label">Todo</span>
        </div>
        <div className="summary-card done">
          <span className="summary-value">{metrics.doneCount}</span>
          <span className="summary-label">Done</span>
        </div>
      </div>

      {hasFinances && (
        <div className="summary finance-summary" onClick={onFinanceClick} style={{ cursor: onFinanceClick ? "pointer" : undefined }} title="Нажмите для редактирования">
          <div className="summary-card clickable budget">
            <span className="summary-value">{formatUSD(metrics.totalBudget)}</span>
            <span className="summary-label">Бюджет</span>
          </div>
          <div className="summary-card clickable paid">
            <span className="summary-value">{formatUSD(metrics.totalPaid)}</span>
            <span className="summary-label">Оплачено</span>
          </div>
          <div className="summary-card clickable remaining">
            <span className="summary-value">{formatUSD(metrics.totalRemaining)}</span>
            <span className="summary-label">Остаток</span>
          </div>
        </div>
      )}
    </>
  );
}
