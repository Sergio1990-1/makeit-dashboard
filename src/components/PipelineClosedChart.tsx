import type { ProjectData } from "../types";
import { toLocalDay, getLast7Days, formatDay } from "../utils/date";
import { closedChartAvgPerDay } from "./v4/pipeline/utils";

interface Props {
  projects: ProjectData[];
}

const PIPELINE_LABEL = "agent-completed";

export function PipelineClosedChart({ projects }: Props) {
  const days = getLast7Days();

  const countsByDay: Record<string, number> = {};
  for (const day of days) countsByDay[day] = 0;

  for (const p of projects) {
    for (const issue of p.issues) {
      if (issue.closedAt && issue.labels.includes(PIPELINE_LABEL)) {
        const closedDay = toLocalDay(new Date(issue.closedAt));
        if (closedDay in countsByDay) {
          countsByDay[closedDay]++;
        }
      }
    }
  }

  const maxCount = Math.max(...Object.values(countsByDay), 1);
  const total = Object.values(countsByDay).reduce((a, b) => a + b, 0);

  // Average over the same 7-day window shown — keeps the badge honest
  // (avg ≈ total/7); the old slice(0,6)/6 silently dropped today (#524).
  const avgPerDay = closedChartAvgPerDay(countsByDay, days);

  return (
    <div className="bento-panel pipeline-closed-chart-panel">
      <div className="bento-panel-title">
        <span>Закрытые Pipeline за неделю</span>
        <div style={{ display: "flex", gap: "var(--mk-sp-4)" }}>
          <span className="closed-chart-total-badge closed-chart-badge-pipeline">
            Всего: {total}
          </span>
          <span className="closed-chart-total-badge">Среднее в день: {avgPerDay}</span>
        </div>
      </div>

      <div className="closed-chart">
        {days.map((day) => {
          const count = countsByDay[day];
          const pct = (count / maxCount) * 100;
          const isToday = day === days[days.length - 1];

          return (
            <div key={day} className={`closed-chart-row ${isToday ? "closed-chart-row-today" : ""}`}>
              <span className="closed-chart-day">{formatDay(day)}</span>
              <div className="closed-chart-bar-track">
                <div className="closed-chart-bar-stack">
                  {count > 0 && (
                    <div
                      className="closed-chart-bar-fill closed-chart-bar-fill-pipeline"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              </div>
              <span className={`closed-chart-count ${count === 0 ? "closed-chart-count-zero" : ""}`}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
