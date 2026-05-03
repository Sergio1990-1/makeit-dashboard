import { useMemo, useState } from "react";
import type { Milestone } from "../../types";
import { daysUntil, formatShortDate } from "../../utils/date";

interface Props {
  milestones: Milestone[];
  /** Anchor for "days until" calculations — recomputed on data refresh. */
  lastUpdated: Date | null;
}

interface MilestoneRow {
  m: Milestone;
  days: number | null;
  cls: "done" | "over" | "warn" | "norm";
}

type Sub = "open" | "done";

const PRIORITY_TAG: Record<string, string> = {
  P1: "v4-ptag--p1",
  P2: "v4-ptag--p2",
  P3: "v4-ptag--p3",
  P4: "v4-ptag--p4",
};

function inferPriority(m: Milestone): string | null {
  // milestones don't carry priority directly — use the highest priority of
  // their issues' labels as a heuristic.
  const labelMatch = (m.issues ?? []).flatMap((i) => i.labels);
  for (const p of ["P1", "P2", "P3", "P4"]) {
    if (labelMatch.some((l) => l.startsWith(p))) return p;
  }
  return null;
}

function isDone(m: Milestone): boolean {
  const total = m.openIssues + m.closedIssues;
  return m.state === "CLOSED" || (total > 0 && m.openIssues === 0);
}

function classify(m: Milestone, days: number | null): "done" | "over" | "warn" | "norm" {
  if (isDone(m)) return "done";
  if (days === null) return "norm";
  if (days < 0) return "over";
  if (days <= 1) return "warn";
  return "norm";
}

export function MilestonesStrip({ milestones, lastUpdated }: Props) {
  const [sub, setSub] = useState<Sub>("open");

  // Compute days/cls once per refresh — avoids calling daysUntil() (impure)
  // multiple times per milestone in the sort comparator and render body.
  const rows: MilestoneRow[] = useMemo(() => {
    return milestones.map((m) => {
      const days = m.dueOn ? daysUntil(m.dueOn) : null;
      return { m, days, cls: classify(m, days) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, lastUpdated?.getTime()]);

  const open = useMemo(
    () =>
      rows
        .filter((r) => r.cls !== "done")
        .sort((a, b) => {
          if (a.days !== null && b.days !== null) return a.days - b.days;
          return a.days !== null ? -1 : b.days !== null ? 1 : 0;
        }),
    [rows]
  );

  const done = useMemo(() => rows.filter((r) => r.cls === "done"), [rows]);

  // 4 cards (2×2 grid) — leaves room for the side-by-side
  // "Issues без milestone" panel without overflowing the row.
  const list = (sub === "open" ? open : done).slice(0, 4);

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Ближайшие milestones <span className="v4-tag">≤ 30 дней</span>
        </div>
        <div className="v4-panel-actions">
          <div className="v4-pillgrp">
            <button
              type="button"
              className={sub === "open" ? "is-active" : ""}
              onClick={() => setSub("open")}
            >
              Открытые · {open.length}
            </button>
            <button
              type="button"
              className={sub === "done" ? "is-active" : ""}
              onClick={() => setSub("done")}
            >
              Завершённые · {done.length}
            </button>
          </div>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="v4-empty">
          {sub === "open" ? "Нет открытых milestones" : "Пока нет завершённых milestones"}
        </div>
      ) : (
        <div className="v4-ms-grid">
          {list.map(({ m, days, cls }) => {
            const total = m.openIssues + m.closedIssues;
            const pct = total > 0 ? Math.round((m.closedIssues / total) * 100) : 0;
            const fillColor =
              cls === "done"
                ? "var(--v4-success-500)"
                : cls === "over"
                ? "var(--v4-warn-500)"
                : cls === "warn"
                ? "var(--v4-success-500)"
                : "var(--v4-accent-500)";
            const priority = inferPriority(m);
            const dueLabel = !m.dueOn
              ? "—"
              : cls === "done"
              ? formatShortDate(m.dueOn)
              : days === 0
              ? "сегодня"
              : days !== null && days < 0
              ? `${formatShortDate(m.dueOn)} · ${days}д`
              : `${formatShortDate(m.dueOn)} · +${days}д`;

            return (
              <div key={m.url} className={`v4-mscard v4-mscard--${cls}`}>
                <div className="v4-mscard-h">
                  <div>
                    <div className="v4-mscard-r">{m.repo}</div>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="v4-mscard-t"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {m.title}
                    </a>
                  </div>
                  {cls === "done" ? (
                    <span className="v4-mscard-done-chip">done ✓</span>
                  ) : priority ? (
                    <span className={`v4-ptag ${PRIORITY_TAG[priority] ?? "v4-ptag--p4"}`}>
                      {priority}
                    </span>
                  ) : null}
                </div>
                <div className="v4-mscard-p">
                  <div className="v4-mscard-track">
                    <div
                      className="v4-mscard-fill"
                      style={{ width: `${pct}%`, background: fillColor }}
                    />
                  </div>
                  <span className="v4-mscard-pct num">
                    {m.closedIssues}/{total} ({pct}%)
                  </span>
                </div>
                <div className="v4-mscard-due">
                  <span>{cls === "done" ? "Закрыт" : "Дедлайн"}</span>
                  <b>{dueLabel}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
