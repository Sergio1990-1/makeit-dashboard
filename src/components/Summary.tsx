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
    <div className="hero">
      {/* Progress ring + key metrics tiles */}
      <div className="hero-top">
        <div className="hero-ring">
          <svg viewBox="0 0 80 80" className="ring-svg">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-border)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${pctDone * 2.136} ${213.6 - pctDone * 2.136}`}
              strokeDashoffset="0"
            />
          </svg>
          <span className="ring-pct">{pctDone}%</span>
        </div>

        <div className="hero-tiles">
          <div className="hero-tile">
            <span className="hero-tile-value">{metrics.projectCount}</span>
            <span className="hero-tile-label">проектов</span>
          </div>
          <div className="hero-tile">
            <span className="hero-tile-value">{metrics.totalIssues}</span>
            <span className="hero-tile-label">всего</span>
          </div>
          <div className="hero-tile">
            <span className="hero-tile-value hero-tile-value--muted">{totalOpen}</span>
            <span className="hero-tile-label">открыто</span>
          </div>
          <div className="hero-tile">
            <span className="hero-tile-value hero-tile-value--done">{metrics.doneCount}</span>
            <span className="hero-tile-label">закрыто</span>
          </div>
        </div>
      </div>

      {/* Finance tiles */}
      {hasFinances && (
        <div
          className="hero-finance-tiles"
          onClick={onFinanceClick}
          role={onFinanceClick ? "button" : undefined}
          tabIndex={onFinanceClick ? 0 : undefined}
        >
          <div className="hero-tile hero-tile--finance">
            <span className="hero-tile-value">{compactUSD(metrics.totalBudget)}</span>
            <span className="hero-tile-label">бюджет</span>
          </div>
          <div className="hero-tile hero-tile--finance">
            <span className="hero-tile-value hero-tile-value--done">{compactUSD(metrics.totalPaid)}</span>
            <span className="hero-tile-label">оплачено</span>
          </div>
          <div className="hero-tile hero-tile--finance">
            <span className="hero-tile-value hero-tile-value--warn">{compactUSD(metrics.totalRemaining)}</span>
            <span className="hero-tile-label">остаток</span>
          </div>
        </div>
      )}
    </div>
  );
}
