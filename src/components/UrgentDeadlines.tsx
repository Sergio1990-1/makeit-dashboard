import type { Milestone } from "../types";

interface Props {
  milestones: Milestone[];
}

function daysUntil(dueOn: string): number {
  return Math.ceil((new Date(dueOn).getTime() - Date.now()) / 86400000);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

interface GroupedItem {
  milestone: Milestone;
  days: number;
}

export function UrgentDeadlines({ milestones }: Props) {
  const items: GroupedItem[] = milestones
    .filter((m) => {
      if (!m.dueOn || m.state === "CLOSED") return false;
      const total = m.openIssues + m.closedIssues;
      if (total > 0 && m.openIssues === 0) return false;
      const days = daysUntil(m.dueOn);
      return days <= 7;
    })
    .map((m) => ({ milestone: m, days: daysUntil(m.dueOn!) }))
    .sort((a, b) => a.days - b.days);

  if (items.length === 0) return null;

  return (
    <div className="bento-panel span-4 panel-deadlines">
      <div className="bento-panel-title" style={{ color: "var(--color-danger)" }}>
        Горящие дедлайны
      </div>
      <div className="dl-list">
        {items.map((item, i) => {
          const m = item.milestone;
          const isOverdue = item.days < 0;
          const isToday = item.days === 0;
          const borderColor = isOverdue ? "var(--color-danger)" : isToday ? "var(--color-warning)" : "var(--color-primary)";
          const badgeClass = isOverdue ? "danger" : isToday ? "warning" : "primary";

          return (
            <div key={i} className="dl-item" style={{ borderLeftColor: borderColor }}>
              <span className="dl-repo">{m.repo}</span>
              <span className="dl-title">{m.title}</span>
              <div className="dl-badges">
                {isOverdue && <span className={`badge badge-${badgeClass}`}>ПРОСРОЧЕНО ({Math.abs(item.days)}д)</span>}
                {isToday && <span className={`badge badge-${badgeClass}`}>СЕГОДНЯ</span>}
                {!isOverdue && !isToday && <span className={`badge badge-${badgeClass}`}>{item.days}д — {formatDate(m.dueOn!)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
