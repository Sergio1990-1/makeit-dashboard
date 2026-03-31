import type { ProjectData } from "../types";

interface Props {
  projects: ProjectData[];
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
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

export function ClosedChart({ projects }: Props) {
  const days = getLast7Days();

  // Count closed issues per day across all projects
  const countsByDay: Record<string, number> = {};
  for (const day of days) countsByDay[day] = 0;

  for (const p of projects) {
    for (const issue of p.issues) {
      if (issue.closedAt) {
        const closedDay = issue.closedAt.slice(0, 10);
        if (closedDay in countsByDay) {
          countsByDay[closedDay]++;
        }
      }
    }
  }

  const maxCount = Math.max(...Object.values(countsByDay), 1);
  const total = Object.values(countsByDay).reduce((a, b) => a + b, 0);

  return (
    <div className="bento-panel span-8 panel-chart">
      <div className="bento-panel-title">
        Активность (Закрытые Issue)
        <span className="closed-chart-total-badge" style={{color: "var(--color-text-secondary)", fontWeight: "normal"}}>Всего за неделю: {total}</span>
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
                <div
                  className="closed-chart-bar-fill"
                  style={{ width: `${pct}%` }}
                />
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
