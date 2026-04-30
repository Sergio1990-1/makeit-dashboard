import { useState } from "react";
import type { Milestone } from "../../../types";
import { daysUntil, formatShortDate } from "../../../utils/date";
import { classifyMilestone } from "./classifyMilestone";

interface Props {
  milestone: Milestone;
}

const PRIORITY_TAG: Record<string, string> = {
  P1: "v4-ptag--p1",
  P2: "v4-ptag--p2",
  P3: "v4-ptag--p3",
  P4: "v4-ptag--p4",
};

function inferPriority(m: Milestone): string | null {
  const labels = (m.issues ?? []).flatMap((i) => i.labels);
  for (const p of ["P1", "P2", "P3", "P4"]) {
    if (labels.some((l) => l.startsWith(p))) return p;
  }
  return null;
}

function DeadlineBadge({ dueOn, days }: { dueOn: string | null; days: number | null }) {
  if (!dueOn) return <span className="v4-ms-badge v4-ms-badge--neutral">без дедлайна</span>;
  if (days === null) return null;
  if (days < 0) return <span className="v4-ms-badge v4-ms-badge--overdue">просрочен {Math.abs(days)}д</span>;
  if (days === 0) return <span className="v4-ms-badge v4-ms-badge--warn">сегодня</span>;
  if (days <= 3) return <span className="v4-ms-badge v4-ms-badge--warn">{days}д осталось</span>;
  if (days <= 14) return <span className="v4-ms-badge v4-ms-badge--info">{days}д · {formatShortDate(dueOn)}</span>;
  return <span className="v4-ms-badge v4-ms-badge--neutral">{formatShortDate(dueOn)}</span>;
}

const DESC_LIMIT = 160;

export function MilestoneCardV4({ milestone }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const total = milestone.openIssues + milestone.closedIssues;
  const progress = total > 0 ? Math.round((milestone.closedIssues / total) * 100) : 0;
  const days = milestone.dueOn ? daysUntil(milestone.dueOn) : null;
  const cls = classifyMilestone(milestone, days);
  const isDone = cls === "done";

  const fillColor =
    isDone
      ? "var(--v4-success-500)"
      : progress >= 70
      ? "var(--v4-success-500)"
      : progress >= 30
      ? "var(--v4-accent-500)"
      : "var(--v4-warn-500)";

  const priority = inferPriority(milestone);
  const sortedIssues = [...(milestone.issues ?? [])].sort((a, b) => {
    if (a.state === b.state) return 0;
    return a.state === "OPEN" ? -1 : 1;
  });

  const desc = milestone.description ?? "";
  const descTruncated = desc.length > DESC_LIMIT && !descOpen ? desc.slice(0, DESC_LIMIT).trimEnd() + "…" : desc;

  return (
    <div className={`v4-mscard-full v4-mscard-full--${cls}`}>
      {/* Header */}
      <div
        className="v4-mscard-full-h"
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
      >
        <div className="v4-mscard-full-titlerow">
          <div className="v4-mscard-full-meta">
            <span className="v4-mscard-full-repo">{milestone.repo}</span>
            <span className={`v4-mscard-full-arrow ${expanded ? "is-open" : ""}`}>▸</span>
          </div>
          <div className="v4-mscard-full-badges">
            {priority && !isDone && (
              <span className={`v4-ptag ${PRIORITY_TAG[priority] ?? "v4-ptag--p4"}`}>
                {priority}
              </span>
            )}
            {isDone ? (
              <span className="v4-ms-badge v4-ms-badge--done">done ✓</span>
            ) : (
              <DeadlineBadge dueOn={milestone.dueOn} days={days} />
            )}
          </div>
        </div>
        <div className="v4-mscard-full-title">
          <a
            href={milestone.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="v4-mscard-full-titlelink"
          >
            {isDone && <span className="v4-mscard-full-check">✓ </span>}
            {milestone.title}
          </a>
        </div>
        {desc && (
          <div className="v4-mscard-full-desc">
            {descTruncated}
            {desc.length > DESC_LIMIT && (
              <button
                type="button"
                className="v4-linkbtn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDescOpen((v) => !v);
                }}
              >
                {descOpen ? "свернуть" : "ещё"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="v4-mscard-full-progress">
        <div className="v4-ptrack v4-mscard-full-track">
          <div
            className="v4-pfill"
            style={{ width: `${progress}%`, background: fillColor }}
          />
        </div>
        <span className="v4-mscard-full-pct num">
          {milestone.closedIssues}/{total} ({progress}%)
        </span>
      </div>

      {/* Expanded issue list */}
      {expanded && sortedIssues.length > 0 && (
        <div className="v4-mscard-full-issues">
          {sortedIssues.map((issue) => {
            const isClosed = issue.state === "CLOSED";
            return (
              <div
                key={issue.number}
                className={`v4-ms-issue ${isClosed ? "v4-ms-issue--closed" : ""}`}
              >
                <span
                  className={`v4-ms-issue-status ${isClosed ? "v4-ms-issue-status--closed" : "v4-ms-issue-status--open"}`}
                  aria-hidden="true"
                >
                  {isClosed ? "✓" : "○"}
                </span>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v4-ms-issue-title"
                >
                  #{issue.number} {issue.title}
                </a>
                <span className="v4-ms-issue-labels">
                  {issue.labels
                    .filter((l) => /^P[1-4]/.test(l))
                    .map((l) => {
                      const p = l.split("-")[0];
                      return (
                        <span
                          key={l}
                          className={`v4-ptag ${PRIORITY_TAG[p] ?? "v4-ptag--p4"}`}
                        >
                          {p}
                        </span>
                      );
                    })}
                  {issue.labels.includes("blocked") && (
                    <span className="v4-ms-issue-blocked">blocked</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {expanded && sortedIssues.length === 0 && (
        <div className="v4-mscard-full-issues v4-mscard-full-issues--empty">
          Нет привязанных issues
        </div>
      )}
    </div>
  );
}
