import type { MilestoneIssue } from "../../../types";
import { formatShortDate } from "../../../utils/date";

interface Props {
  issue: MilestoneIssue;
  /** Render with reduced spacing (used inside the milestone card expansion) */
  dense?: boolean;
}

export function MilestoneIssueRow({ issue, dense = false }: Props) {
  const isClosed = issue.state === "CLOSED";
  const priority = issue.labels
    .map((l) => /^P[1-4]\b/i.exec(l)?.[0]?.toUpperCase())
    .find((x): x is string => Boolean(x));
  const isBlocked = issue.labels.some((l) => l.toLowerCase() === "blocked");
  return (
    <li
      className={`v4-mspopup-issue${isClosed ? " is-closed" : ""}${
        dense ? " v4-mspopup-issue--dense" : ""
      }`}
    >
      <span
        className={`v4-mspopup-issue-st v4-mspopup-issue-st--${
          isClosed ? "closed" : "open"
        }`}
        aria-label={isClosed ? "Закрыт" : "Открыт"}
      >
        {isClosed ? "✓" : "○"}
      </span>
      <a
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        className="v4-mspopup-issue-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="v4-mspopup-issue-num num">#{issue.number}</span>{" "}
        {issue.title}
      </a>
      <span className="v4-mspopup-issue-tags">
        {priority && (
          <span className={`v4-ptag v4-ptag--${priority.toLowerCase()}`}>
            {priority}
          </span>
        )}
        {isBlocked && (
          <span
            className="v4-ptag"
            style={{ background: "#FEE4E2", color: "#B42318" }}
          >
            blocked
          </span>
        )}
      </span>
      {isClosed && issue.closedAt && (
        <span className="v4-mspopup-issue-date num">
          {formatShortDate(issue.closedAt)}
        </span>
      )}
    </li>
  );
}
