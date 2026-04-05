import type { ProjectData } from "../types";

interface Props {
  projects: ProjectData[];
}

const PIPELINE_LABEL = "agent-completed";

function toLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toLocalDay(d));
  }
  return days;
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("ru-RU", { month: "short" });
  return `${weekday}, ${day} ${month}`;
}

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

  const previous6Days = days.slice(0, 6);
  const sum6Days = previous6Days.reduce((sum, day) => sum + countsByDay[day], 0);
  const avg6Days = Math.round(sum6Days / 6);

  return (
    <div className="bento-panel pipeline-closed-chart-panel">
      <div className="bento-panel-title">
        <span>Закрытые Pipeline за неделю</span>
        <div style={{ display: "flex", gap: "var(--sp-4)" }}>
          <span className="closed-chart-total-badge closed-chart-badge-pipeline">
            Всего: {total}
          </span>
          <span className="closed-chart-total-badge">Среднее в день: {avg6Days}</span>
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
