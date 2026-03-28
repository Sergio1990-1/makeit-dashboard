interface Props {
  dueOn: string | null;
}

function daysUntil(dueOn: string): number {
  return Math.ceil((new Date(dueOn).getTime() - Date.now()) / 86400000);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
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
    return <span className="deadline-badge info">{days}д — {formatDate(dueOn)}</span>;
  }
  return <span className="deadline-badge neutral">{formatDate(dueOn)}</span>;
}
