import type { Issue } from "../types";

interface Props {
  issues: Issue[];
}

export function BlockedItems({ issues }: Props) {
  if (issues.length === 0) return null;

  return (
    <div className="bento-panel span-4">
      <div className="bento-panel-title" style={{ color: "var(--color-danger)" }}>
        Заблокировано
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-danger)", fontSize: "var(--text-base)" }}>
          {issues.length}
        </span>
      </div>
      <div className="blocked-list">
        {issues.map((issue) => (
          <div key={issue.id} className="blocked-item">
            <span className="blocked-repo">{issue.repo}</span>
            <a href={issue.url} target="_blank" rel="noopener noreferrer" className="blocked-title">
              {issue.title}
            </a>
            {issue.priority && <span className={`priority-tag priority-${issue.priority.toLowerCase()}`}>{issue.priority}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
