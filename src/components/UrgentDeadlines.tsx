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

  const overdue = items.filter((i) => i.days < 0);
  const today = items.filter((i) => i.days === 0);
  const thisWeek = items.filter((i) => i.days > 0);

  return (
    <div className="deadlines">
      {overdue.length > 0 && (
        <DeadlineGroup
          label="Просрочено"
          variant="overdue"
          items={overdue}
        />
      )}
      {today.length > 0 && (
        <DeadlineGroup
          label="Сегодня"
          variant="today"
          items={today}
        />
      )}
      {thisWeek.length > 0 && (
        <DeadlineGroup
          label="Эта неделя"
          variant="week"
          items={thisWeek}
        />
      )}
    </div>
  );
}

function DeadlineGroup({ label, variant, items }: {
  label: string;
  variant: "overdue" | "today" | "week";
  items: GroupedItem[];
}) {
  return (
    <div className={`dl-group dl-group--${variant}`}>
      <div className="dl-group-header">
        <span className={`dl-dot dl-dot--${variant}`} />
        <span className="dl-group-label">{label}</span>
        <span className="dl-group-count">{items.length}</span>
      </div>
      {items.map((item, i) => {
        const m = item.milestone;
        const pct = m.openIssues + m.closedIssues > 0
          ? Math.round((m.closedIssues / (m.openIssues + m.closedIssues)) * 100)
          : 0;
        return (
          <div key={i} className="dl-item">
            <div className="dl-item-content">
              <span className="dl-repo">{m.repo}</span>
              <span className="dl-title">{m.title}</span>
            </div>
            <div className="dl-item-meta">
              <span className="dl-pct">{pct}%</span>
              {item.days < 0 && (
                <span className="dl-badge dl-badge--overdue">{Math.abs(item.days)}д</span>
              )}
              {item.days === 0 && (
                <span className="dl-badge dl-badge--today">сегодня</span>
              )}
              {item.days > 0 && (
                <span className="dl-badge dl-badge--week">{item.days}д — {formatDate(m.dueOn!)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
