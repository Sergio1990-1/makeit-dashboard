import type { Milestone } from "../../types";
import { daysUntil, formatShortDate } from "../../utils/date";

interface Props {
  milestones: Milestone[];
}

export function UrgentDeadlinesPanel({ milestones }: Props) {
  const items = milestones
    .filter((m) => {
      if (!m.dueOn || m.state === "CLOSED") return false;
      const total = m.openIssues + m.closedIssues;
      if (total > 0 && m.openIssues === 0) return false;
      const days = daysUntil(m.dueOn);
      return days <= 7;
    })
    .map((m) => ({ milestone: m, days: daysUntil(m.dueOn!) }))
    .sort((a, b) => a.days - b.days);

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t v4-panel-t--danger">
          🔥 Горящие дедлайны <span className="v4-tag v4-tag--danger">≤ 7 дней</span>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="v4-empty">Нет дедлайнов на ближайшие 7 дней</div>
      ) : (
        <div className="v4-list">
          {items.map(({ milestone: m, days }) => {
            const isOverdue = days < 0;
            const isToday = days === 0;
            const cls = isOverdue
              ? "v4-litem--over"
              : isToday
              ? "v4-litem--today"
              : "v4-litem--soon";
            const badgeCls = isOverdue
              ? "v4-litem-badge--danger"
              : isToday
              ? "v4-litem-badge--warn"
              : "v4-litem-badge--primary";
            const badgeText = isOverdue
              ? `просрочено ${Math.abs(days)}д`
              : isToday
              ? "сегодня"
              : `через ${days}д · ${formatShortDate(m.dueOn!)}`;
            return (
              <div key={m.url} className={`v4-litem v4-litem--dl ${cls}`}>
                <span className="v4-litem-repo">{m.repo}</span>
                <span className="v4-litem-ti">
                  <a href={m.url} target="_blank" rel="noopener noreferrer">
                    {m.title}
                  </a>
                </span>
                <span className={`v4-litem-badge ${badgeCls}`}>{badgeText}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
