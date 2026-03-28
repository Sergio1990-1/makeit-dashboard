import type { Milestone } from "../types";
import { DeadlineBadge } from "./DeadlineBadge";

interface Props {
  milestones: Milestone[];
}

export function UrgentDeadlines({ milestones }: Props) {
  const urgent = milestones
    .filter((m) => {
      if (!m.dueOn || m.state === "CLOSED") return false;
      const total = m.openIssues + m.closedIssues;
      if (total > 0 && m.openIssues === 0) return false; // 100% done
      const days = Math.ceil((new Date(m.dueOn).getTime() - Date.now()) / 86400000);
      return days <= 7;
    })
    .sort((a, b) => new Date(a.dueOn!).getTime() - new Date(b.dueOn!).getTime());

  if (urgent.length === 0) return null;

  return (
    <div className="urgent-banner">
      <div className="urgent-title">Ближайшие дедлайны ({urgent.length})</div>
      {urgent.map((m, i) => (
        <div key={i} className="urgent-item">
          <span>
            <span className="urgent-repo">{m.repo}</span> → <strong>{m.title}</strong>
          </span>
          <DeadlineBadge dueOn={m.dueOn} />
        </div>
      ))}
    </div>
  );
}
