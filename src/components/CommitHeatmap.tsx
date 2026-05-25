import { memo, useMemo } from "react";
import type { CommitActivity } from "../types";

interface Props {
  activity: CommitActivity;
}

const WEEKS = 12;
const DAYS = 7;
const TOTAL_DAYS = WEEKS * DAYS;

function getColor(count: number): string {
  if (count === 0) return "var(--mk-surface-3)";
  if (count === 1) return "var(--mk-heat-1)";
  if (count <= 3) return "var(--mk-heat-2)";
  if (count <= 6) return "var(--mk-heat-3)";
  return "var(--mk-heat-4)";
}

function CommitHeatmapImpl({ activity }: Props) {
  // Recompute the 84-cell grid only when activity changes — was being
  // rebuilt on every parent render before.
  const cells = useMemo(() => {
    const out: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const date = d.toISOString().split("T")[0];
      out.push({ date, count: activity.byDate[date] ?? 0 });
    }
    return out;
  }, [activity.byDate]);

  return (
    <div className="commit-heatmap">
      <div className="heatmap-grid" style={{ gridTemplateRows: `repeat(${DAYS}, 10px)` }}>
        {cells.map(({ date, count }) => (
          <div
            key={date}
            className="heatmap-cell"
            style={{ background: getColor(count) }}
            title={`${date}: ${count} коммит${count === 1 ? "" : count >= 2 && count <= 4 ? "а" : "ов"}`}
            data-count={count}
          />
        ))}
      </div>
      <div className="heatmap-stats">
        <span className="heatmap-stat">
          <span className="heatmap-stat__value">{activity.today}</span>
          <span className="heatmap-stat__label">сегодня</span>
        </span>
        <span className="heatmap-stat-sep" />
        <span className="heatmap-stat">
          <span className="heatmap-stat__value">{activity.thisWeek}</span>
          <span className="heatmap-stat__label">7д</span>
        </span>
        <span className="heatmap-stat-sep" />
        <span className="heatmap-stat">
          <span className="heatmap-stat__value">{activity.thisMonth}</span>
          <span className="heatmap-stat__label">30д</span>
        </span>
        <span className="heatmap-stat-sep" />
        <span className="heatmap-stat">
          <span className="heatmap-stat__value">{activity.total84d}</span>
          <span className="heatmap-stat__label">84д</span>
        </span>
      </div>
    </div>
  );
}

export const CommitHeatmap = memo(CommitHeatmapImpl);
