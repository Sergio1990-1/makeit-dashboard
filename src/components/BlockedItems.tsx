import type { Issue } from "../types";

interface Props {
  issues: Issue[];
}

export function BlockedItems({ issues }: Props) {
  if (issues.length === 0) return null;

  return (
    <div className="bento-panel span-4">
      <div className="bento-panel-title" style={{ color: "var(--color-danger)" }}>
        Заблокировано 🚫
        <span className="mono" style={{ color: "var(--color-danger)", fontSize: "var(--text-md)", fontWeight: 800 }}>
          {issues.length}
        </span>
      </div>
      <div className="blocked-list">
        {issues.map((issue) => (
          <div key={issue.id} className="blocked-item">
            <div className="blocked-row-main">
              <div className="blocked-info">
                <span className="blocked-repo">{issue.repo}</span>
                <a href={issue.url} target="_blank" rel="noopener noreferrer" className="blocked-title">
                  {issue.title}
                </a>
              </div>
              {issue.priority && (
                <span className={`priority-tag priority-${issue.priority.toLowerCase()}`}>
                  {issue.priority}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
