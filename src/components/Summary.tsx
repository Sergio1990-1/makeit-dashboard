import type { SummaryMetrics } from "../types";

interface Props {
  metrics: SummaryMetrics;
}

export function Summary({ metrics }: Props) {
  return (
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
      <div className="summary-card in-progress">
        <span className="summary-value">{metrics.inProgressCount}</span>
        <span className="summary-label">In Progress</span>
      </div>
      <div className="summary-card review">
        <span className="summary-value">{metrics.reviewCount}</span>
        <span className="summary-label">Review</span>
      </div>
      <div className="summary-card done">
        <span className="summary-value">{metrics.doneCount}</span>
        <span className="summary-label">Done</span>
      </div>
    </div>
  );
}
