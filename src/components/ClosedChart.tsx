import type { ProjectData } from "../types";
import { toLocalDay, getLast7Days, formatDay } from "../utils/date";

interface Props {
  projects: ProjectData[];
}

const PIPELINE_LABEL = "agent-completed";

export function ClosedChart({ projects }: Props) {
  const days = getLast7Days();

  const countsByDay: Record<string, { manual: number; pipeline: number }> = {};
  for (const day of days) countsByDay[day] = { manual: 0, pipeline: 0 };

  for (const p of projects) {
    for (const issue of p.issues) {
      if (issue.closedAt) {
        const closedDay = toLocalDay(new Date(issue.closedAt));
        if (closedDay in countsByDay) {
          if (issue.labels.includes(PIPELINE_LABEL)) {
            countsByDay[closedDay].pipeline++;
          } else {
            countsByDay[closedDay].manual++;
          }
        }
      }
    }
  }

  const maxCount = Math.max(
    ...Object.values(countsByDay).map((c) => c.manual + c.pipeline),
    1,
  );
  const total = Object.values(countsByDay).reduce(
    (a, c) => a + c.manual + c.pipeline,
    0,
  );
  const totalPipeline = Object.values(countsByDay).reduce(
    (a, c) => a + c.pipeline,
    0,
  );

  const previous6Days = days.slice(0, 6);
  const sum6Days = previous6Days.reduce(
    (sum, day) => sum + countsByDay[day].manual + countsByDay[day].pipeline,
    0,
  );
  const avg6Days = Math.round(sum6Days / 6);

  return (
    <div className="bento-panel span-8 panel-chart">
      <div className="bento-panel-title">
        <span>Закрытые ISSUES</span>
        <div style={{ display: "flex", gap: "var(--sp-4)" }}>
          <span className="closed-chart-total-badge">Всего за неделю: {total}</span>
          {totalPipeline > 0 && (
            <span className="closed-chart-total-badge closed-chart-badge-pipeline">
              Pipeline: {totalPipeline}
            </span>
          )}
          <span className="closed-chart-total-badge">Среднее в день: {avg6Days}</span>
        </div>
      </div>

      {totalPipeline > 0 && (
        <div className="closed-chart-legend">
          <span className="closed-chart-legend-item">
            <span className="closed-chart-legend-dot closed-chart-legend-dot-manual" />
            Вручную
          </span>
          <span className="closed-chart-legend-item">
            <span className="closed-chart-legend-dot closed-chart-legend-dot-pipeline" />
            Pipeline
          </span>
        </div>
      )}

      <div className="closed-chart">
        {days.map((day) => {
          const { manual, pipeline } = countsByDay[day];
          const total = manual + pipeline;
          const pctManual = (manual / maxCount) * 100;
          const pctPipeline = (pipeline / maxCount) * 100;
          const isToday = day === days[days.length - 1];

          return (
            <div key={day} className={`closed-chart-row ${isToday ? "closed-chart-row-today" : ""}`}>
              <span className="closed-chart-day">{formatDay(day)}</span>
              <div className="closed-chart-bar-track">
                <div className="closed-chart-bar-stack">
                  {manual > 0 && (
                    <div
                      className="closed-chart-bar-fill"
                      style={{ width: `${pctManual}%` }}
                      title={`Вручную: ${manual}`}
                    />
                  )}
                  {pipeline > 0 && (
                    <div
                      className="closed-chart-bar-fill closed-chart-bar-fill-pipeline"
                      style={{ width: `${pctPipeline}%` }}
                      title={`Pipeline: ${pipeline}`}
                    />
                  )}
                </div>
              </div>
              <span className={`closed-chart-count ${total === 0 ? "closed-chart-count-zero" : ""}`}>
                {total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
