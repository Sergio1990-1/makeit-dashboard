import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Milestone } from "../../../types";
import { formatShortDate } from "../../../utils/date";
import { MilestoneIssueRow } from "./MilestoneIssueRow";
import { repoGlyphColor, stripEpicPrefix } from "./utils";

interface Props {
  milestone: Milestone;
  onClose: () => void;
}

type Tab = "all" | "open" | "closed";

export function MilestoneIssuesPopup({ milestone, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("all");

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock background scroll while popup is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const issues = useMemo(() => milestone.issues ?? [], [milestone.issues]);
  const openIssues = useMemo(
    () => issues.filter((i) => i.state === "OPEN"),
    [issues],
  );
  const closedIssues = useMemo(
    () => issues.filter((i) => i.state === "CLOSED"),
    [issues],
  );

  const visible = useMemo(() => {
    if (tab === "open") return openIssues;
    if (tab === "closed") return closedIssues;
    // "all": open first (sorted by number desc), then closed (sorted by closedAt desc)
    const openSorted = [...openIssues].sort((a, b) => b.number - a.number);
    const closedSorted = [...closedIssues].sort((a, b) => {
      if (!a.closedAt && !b.closedAt) return b.number - a.number;
      if (!a.closedAt) return 1;
      if (!b.closedAt) return -1;
      return new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime();
    });
    return [...openSorted, ...closedSorted];
  }, [tab, openIssues, closedIssues]);

  const total = openIssues.length + closedIssues.length;
  const declaredTotal = milestone.openIssues + milestone.closedIssues;
  const pct = declaredTotal > 0 ? Math.round((milestone.closedIssues / declaredTotal) * 100) : 0;
  const truncated = total < declaredTotal;

  return createPortal(
    <div className="v4-mspopup-bd" onClick={onClose}>
      <div
        className="v4-mspopup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v4-mspopup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="v4-mspopup-h">
          <span
            className="v4-mspopup-glyph"
            style={{ background: repoGlyphColor(milestone.repo) }}
            aria-hidden="true"
          />
          <div className="v4-mspopup-h-text">
            <div className="v4-mspopup-repo">{milestone.repo}</div>
            <h2 id="v4-mspopup-title" className="v4-mspopup-title">
              {stripEpicPrefix(milestone.title) || milestone.title}
            </h2>
          </div>
          <button
            type="button"
            className="v4-mspopup-close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="v4-mspopup-meta">
          <div className="v4-mspopup-progress">
            <div className="v4-mspopup-progress-bar">
              <div
                className="v4-mspopup-progress-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="num">
              {milestone.closedIssues}/{declaredTotal} · {pct}%
            </span>
          </div>
          <div className="v4-mspopup-meta-row">
            {milestone.dueOn && (
              <span>
                Дедлайн: <b>{formatShortDate(milestone.dueOn)}</b>
              </span>
            )}
            {milestone.state === "CLOSED" && milestone.closedAt && (
              <span>
                Закрыт: <b>{formatShortDate(milestone.closedAt)}</b>
              </span>
            )}
            <a
              href={milestone.url}
              target="_blank"
              rel="noopener noreferrer"
              className="v4-mspopup-ghlink"
            >
              Открыть на GitHub →
            </a>
          </div>
        </div>

        <div className="v4-mspopup-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            className={tab === "all" ? "is-active" : ""}
            onClick={() => setTab("all")}
          >
            Все <span className="num">{total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "open"}
            className={tab === "open" ? "is-active" : ""}
            onClick={() => setTab("open")}
          >
            Открытые <span className="num">{openIssues.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "closed"}
            className={tab === "closed" ? "is-active" : ""}
            onClick={() => setTab("closed")}
          >
            Закрытые <span className="num">{closedIssues.length}</span>
          </button>
        </div>

        <div className="v4-mspopup-body">
          {visible.length === 0 ? (
            <div className="v4-mspopup-empty">
              {tab === "open"
                ? "Открытых issues нет"
                : tab === "closed"
                  ? "Закрытых issues нет"
                  : "Issues отсутствуют"}
            </div>
          ) : (
            <ul className="v4-mspopup-list">
              {visible.map((issue) => (
                <MilestoneIssueRow key={issue.url} issue={issue} />
              ))}
            </ul>
          )}
          {truncated && tab === "all" && (
            <div className="v4-mspopup-trunc">
              Показано {total} из {declaredTotal} issues. Полный список —{" "}
              <a href={milestone.url} target="_blank" rel="noopener noreferrer">
                на GitHub
              </a>
              .
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

