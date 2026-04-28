import { daysUntil, formatShortDate } from "../utils/date";

interface Props {
  dueOn: string | null;
}

export function DeadlineBadge({ dueOn }: Props) {
  if (!dueOn) return <span className="deadline-badge neutral">без дедлайна</span>;

  const days = daysUntil(dueOn);

  if (days < 0) {
    return <span className="deadline-badge overdue">просрочен {Math.abs(days)}д</span>;
  }
  if (days <= 3) {
    return <span className="deadline-badge warning">{days}д осталось</span>;
  }
  if (days <= 14) {
    return <span className="deadline-badge info">{days}д — {formatShortDate(dueOn)}</span>;
  }
  return <span className="deadline-badge neutral">{formatShortDate(dueOn)}</span>;
}
