import { useState } from "react";
import type { Milestone } from "../types";
import { DeadlineBadge } from "./DeadlineBadge";

interface Props {
  milestone: Milestone;
}

export function MilestoneCard({ milestone }: Props) {
  const [expanded, setExpanded] = useState(false);
  const total = milestone.closedIssues + milestone.openIssues;
  const progress = total > 0 ? Math.round((milestone.closedIssues / total) * 100) : 0;
  const isDone = total > 0 && milestone.openIssues === 0;

  // Sort: open first, then closed
  const sortedIssues = [...(milestone.issues ?? [])].sort((a, b) => {
    if (a.state === b.state) return 0;
    return a.state === "OPEN" ? -1 : 1;
  });

  return (
    <div
      className={`milestone-card ${isDone ? "milestone-done" : ""} ${expanded ? "milestone-expanded" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`Milestone ${milestone.title}, ${milestone.closedIssues} из ${total} задач закрыто. ${expanded ? "Свернуть" : "Раскрыть"} список.`}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <div className="milestone-top">
        <div>
          <div className="milestone-repo-name">{milestone.repo}</div>
          <span className="milestone-title">
            {isDone && <span className="milestone-check">✓ </span>}
            {milestone.title}
          </span>
        </div>
        {isDone
          ? <span className="deadline-badge done-badge">✓ done</span>
          : <DeadlineBadge dueOn={milestone.dueOn} />
        }
      </div>

      {milestone.description && !expanded && (
        <div className="milestone-desc">
          {milestone.description.length > 120
            ? milestone.description.slice(0, 120) + "..."
            : milestone.description}
        </div>
      )}

      <div className="milestone-progress">
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${progress}%`,
              background: progress < 30 ? "#f85149" : progress < 70 ? "#d29922" : "#3fb950",
            }}
          />
        </div>
        <span className="milestone-progress-text" style={{
          color: progress < 30 ? "#f85149" : progress < 70 ? "#d29922" : "#3fb950",
        }}>
          {milestone.closedIssues}/{total} ({progress}%)
        </span>
      </div>

      {expanded && sortedIssues.length > 0 && (
        <div className="milestone-issues" onClick={(e) => e.stopPropagation()}>
          {sortedIssues.map((issue) => (
            <div key={issue.number} className={`ms-issue ${issue.state === "CLOSED" ? "ms-issue-closed" : ""}`}>
              <span className={`ms-issue-status ${issue.state === "CLOSED" ? "closed" : "open"}`}>
                {issue.state === "CLOSED" ? "✓" : "○"}
              </span>
              <a href={issue.url} target="_blank" rel="noopener noreferrer" className="ms-issue-title">
                #{issue.number} {issue.title}
              </a>
              <span className="ms-issue-labels">
                {issue.labels.filter((l) => l.match(/^P[1-4]/)).map((l) => (
                  <span key={l} className={`ms-label ms-label-${l.toLowerCase().split("-")[0]}`}>{l.split("-")[0]}</span>
                ))}
                {issue.labels.filter((l) => l === "blocked").map((l) => (
                  <span key={l} className="ms-label ms-label-blocked">blocked</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {expanded && sortedIssues.length === 0 && (
        <div className="milestone-issues-empty">Нет привязанных issues</div>
      )}
    </div>
  );
}
