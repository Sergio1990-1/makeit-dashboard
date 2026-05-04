import { useState } from "react";
import type { Milestone } from "../../../types";
import { formatShortDate } from "../../../utils/date";
import type { MilestoneStatusKind } from "./classifyMilestone";
import { MilestoneIssueRow } from "./MilestoneIssueRow";
import {
  countBlocked,
  countByPriority,
  inferPriority,
  repoGlyphColor,
} from "./utils";

interface Props {
  milestone: Milestone;
  density: "comfortable" | "compact";
  /** Days until due, precomputed by the parent view against the data-refresh
   *  anchor. `null` when the milestone has no `dueOn`. Passed in so card
   *  badges/risk strip never drift from group bucket and aggregate counters
   *  between refreshes (e.g. across midnight). */
  days: number | null;
  /** Classification bucket precomputed alongside `days`. Same anchor as
   *  the parent's grouping/sorting/aggregates. */
  cls: MilestoneStatusKind;
  onSelect?: (m: Milestone) => void;
}

function isModClick(e: { metaKey: boolean; ctrlKey: boolean; button: number }) {
  return e.metaKey || e.ctrlKey || e.button === 1;
}

const DESC_LIMIT = 140;

const FILL_BY_CLS: Record<string, string> = {
  overdue: "v4-mscv-fill--overdue",
  warn: "v4-mscv-fill--warn",
  soon: "v4-mscv-fill--soon",
  norm: "v4-mscv-fill--norm",
  done: "v4-mscv-fill--done",
  noeta: "v4-mscv-fill--noeta",
};

export function MilestoneCardV4({ milestone, density, days, cls, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);

  const total = milestone.openIssues + milestone.closedIssues;
  const pct = total > 0 ? Math.round((milestone.closedIssues / total) * 100) : 0;
  const left = total - milestone.closedIssues;
  const isDone = cls === "done";

  const pctClass =
    pct >= 80
      ? "v4-mscv-pct--good"
      : pct >= 40
      ? ""
      : pct >= 1
      ? "v4-mscv-pct--warn"
      : "v4-mscv-pct--bad";

  let dueText: string;
  if (isDone) dueText = "✓ завершён";
  else if (days === null) dueText = "без даты";
  else if (days < 0) dueText = `просрочен ${Math.abs(days)} дн`;
  else if (days === 0) dueText = "сегодня";
  else dueText = `${days} дн · ${formatShortDate(milestone.dueOn!)}`;

  const inferred = inferPriority(milestone);
  const showPTag = !isDone && (inferred === "P1" || inferred === "P2");

  const p1 = countByPriority(milestone, "P1");
  const p2 = countByPriority(milestone, "P2");
  const blocked = countBlocked(milestone);

  const chips: { k: string; l: string; cls: string }[] = [];
  if (!isDone) {
    if (p1 > 0)
      chips.push({ k: "p1", l: `P1 · ${p1}`, cls: "v4-mscv-chip--p1" });
    else if (p2 > 0 && pct < 80)
      chips.push({ k: "p2", l: `P2 · ${p2}`, cls: "v4-mscv-chip--p2" });
    if (blocked > 0)
      chips.push({
        k: "blocked",
        l: `Blocked · ${blocked}`,
        cls: "v4-mscv-chip--blocked",
      });
    if (left > 0)
      chips.push({ k: "open", l: `${left} осталось`, cls: "" });
  }

  const desc = milestone.description ?? "";
  const descTrunc =
    desc.length > DESC_LIMIT ? desc.slice(0, DESC_LIMIT).trimEnd() + "…" : desc;

  const sortedIssues = [...(milestone.issues ?? [])].sort((a, b) => {
    if (a.state === b.state) return 0;
    return a.state === "OPEN" ? -1 : 1;
  });

  return (
    <article
      className={`v4-mscv v4-mscv--${cls}${
        density === "compact" ? " v4-mscv--compact" : ""
      }`}
    >
      <header
        className="v4-mscv-head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Milestone ${milestone.title}, ${milestone.closedIssues} из ${total} задач закрыто. ${
          expanded ? "Свернуть" : "Раскрыть"
        } список.`}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          // Skip bubbled events from nested interactive elements (title link, etc.)
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <div className="v4-mscv-meta">
          <div className="v4-mscv-repo">
            <span
              className="v4-mscv-repo-glyph"
              style={{ background: repoGlyphColor(milestone.repo) }}
            />
            {milestone.repo}
            <svg
              className={`v4-mscv-chev${expanded ? " is-open" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
          <div className="v4-mscv-meta-right">
            {showPTag && inferred && (
              <span
                className={`v4-ptag v4-ptag--${inferred.toLowerCase()}`}
              >
                {inferred}
              </span>
            )}
            <span className={`v4-mscv-due v4-mscv-due--${cls}`}>
              {!isDone && cls !== "noeta" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              )}
              {dueText}
            </span>
          </div>
        </div>

        <div className="v4-mscv-title">
          <a
            href={milestone.url}
            target="_blank"
            rel="noopener noreferrer"
            className="v4-mscv-titlelink"
            onClick={(e) => {
              e.stopPropagation();
              if (!onSelect || isModClick(e)) return;
              e.preventDefault();
              onSelect(milestone);
            }}
          >
            {milestone.title}
          </a>
        </div>

        {density !== "compact" && desc && (
          <div className="v4-mscv-desc">{descTrunc}</div>
        )}
      </header>

      <div className="v4-mscv-bar">
        <div className="v4-mscv-bar-meta">
          <div className="v4-mscv-bar-meta-left">
            <span className="v4-mscv-bar-closed num">
              {milestone.closedIssues}
            </span>
            <span className="v4-mscv-bar-total"> / {total} issues</span>
          </div>
          <div className={`v4-mscv-bar-pct num ${pctClass}`}>{pct}%</div>
        </div>
        <div className="v4-mscv-track">
          <div
            className={`v4-mscv-fill ${FILL_BY_CLS[cls] ?? ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {density !== "compact" && chips.length > 0 && (
        <div className="v4-mscv-foot">
          {chips.map((ch) => (
            <span key={ch.k} className={`v4-mscv-chip ${ch.cls}`}>
              {ch.l}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="v4-mscv-issues">
          {sortedIssues.length === 0 ? (
            <div className="v4-mscv-issues-empty">Нет привязанных issues</div>
          ) : (
            <ul className="v4-mspopup-list v4-mspopup-list--card">
              {sortedIssues.map((issue) => (
                <MilestoneIssueRow key={issue.number} issue={issue} dense />
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
