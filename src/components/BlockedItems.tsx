import type { Issue } from "../types";

interface Props {
  issues: Issue[];
}

export function BlockedItems({ issues }: Props) {
  if (issues.length === 0) return null;

  return (
    <section className="blocked-section">
      <h2>Blocked Items ({issues.length})</h2>
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
    </section>
  );
}
