import { useMemo } from "react";
import type { ProjectData } from "../../../types";
import { toLocalDay, getLast7Days, formatDay } from "../../../utils/date";

interface Props {
  projects: ProjectData[];
  /** Anchor for stable date window */
  lastUpdated: Date | null;
}

const PIPELINE_LABEL = "agent-completed";

export function PipelineClosedChartV4({ projects, lastUpdated }: Props) {
  const { days, countsByDay, total, avg6Days } = useMemo(() => {
    const days = getLast7Days();
    const countsByDay: Record<string, number> = {};
    for (const day of days) countsByDay[day] = 0;
    for (const p of projects) {
      for (const issue of p.issues) {
        if (issue.closedAt && issue.labels.includes(PIPELINE_LABEL)) {
          const closedDay = toLocalDay(new Date(issue.closedAt));
          if (closedDay in countsByDay) countsByDay[closedDay]++;
        }
      }
    }
    const total = Object.values(countsByDay).reduce((a, b) => a + b, 0);
    const previous6 = days.slice(0, 6);
    const sum6 = previous6.reduce((s, d) => s + countsByDay[d], 0);
    const avg6 = Math.round(sum6 / 6);
    return { days, countsByDay, total, avg6Days: avg6 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, lastUpdated?.getTime()]);

  const max = Math.max(...Object.values(countsByDay), 1);
  const todayKey = days[days.length - 1];

  return (
    <div className="v4-panel v4-pl-chart-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Закрыто Pipeline за неделю <span className="v4-tag">7 дней</span>
        </div>
        <div className="v4-panel-meta">
          всего {total} · ср. в день {avg6Days}
        </div>
      </div>
      <div className="v4-pl-chart">
        {days.map((day) => {
          const count = countsByDay[day];
          const pct = (count / max) * 100;
          const isToday = day === todayKey;
          return (
            <div
              key={day}
              className={`v4-pl-chart-row ${isToday ? "v4-pl-chart-row--today" : ""}`}
            >
              <span className="v4-pl-chart-day">{formatDay(day)}</span>
              <div className="v4-pl-chart-track">
                {count > 0 && (
                  <div
                    className="v4-pl-chart-fill"
                    style={{ width: `${pct}%` }}
                    title={`${day}: ${count}`}
                  />
                )}
              </div>
              <span
                className={`v4-pl-chart-count ${count === 0 ? "v4-pl-chart-count--zero" : ""}`}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
