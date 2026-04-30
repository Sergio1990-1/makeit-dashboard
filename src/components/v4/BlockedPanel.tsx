import type { Issue } from "../../types";

interface Props {
  issues: Issue[];
}

const PRIORITY_TAG: Record<string, string> = {
  P1: "v4-ptag--p1",
  P2: "v4-ptag--p2",
  P3: "v4-ptag--p3",
  P4: "v4-ptag--p4",
};

export function BlockedPanel({ issues }: Props) {
  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t v4-panel-t--danger">
          🚫 Заблокировано <span className="v4-tag v4-tag--danger">{issues.length}</span>
        </div>
        {issues.length > 0 && <button className="v4-linkbtn">К списку →</button>}
      </div>
      {issues.length === 0 ? (
        <div className="v4-empty">Нет заблокированных задач 🎉</div>
      ) : (
        <div className="v4-list">
          {issues.map((issue) => (
            <div key={issue.id} className="v4-litem">
              <span className="v4-litem-repo">{issue.repo}</span>
              <span className="v4-litem-ti">
                <a href={issue.url} target="_blank" rel="noopener noreferrer">
                  {issue.title}
                </a>
              </span>
              {issue.priority && (
                <span className={`v4-ptag ${PRIORITY_TAG[issue.priority] ?? "v4-ptag--p4"}`}>
                  {issue.priority}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
