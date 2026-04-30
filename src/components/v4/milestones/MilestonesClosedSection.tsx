import { useMemo, useState } from "react";
import type { Milestone } from "../../../types";
import { formatShortDate } from "../../../utils/date";
import { repoGlyphColor } from "./utils";

interface Props {
  milestones: Milestone[];
}

const PAGE_SIZE = 12;

export function MilestonesClosedSection({ milestones }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const aD = a.closedAt ?? a.dueOn ?? "";
      const bD = b.closedAt ?? b.dueOn ?? "";
      return bD.localeCompare(aD);
    });
  }, [milestones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (m) =>
        m.title.toLowerCase().includes(q) || m.repo.toLowerCase().includes(q)
    );
  }, [sorted, query]);

  // Derive a safe page from current state — when search trims results below
  // the current page, we just clamp during render rather than setState in
  // an effect (which would cascade re-renders).
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const slice = filtered.slice(
    pageSafe * PAGE_SIZE,
    (pageSafe + 1) * PAGE_SIZE
  );

  const totalIssues = milestones.reduce(
    (s, m) => s + m.openIssues + m.closedIssues,
    0
  );
  const lastClosed = sorted[0]?.closedAt
    ? formatShortDate(sorted[0].closedAt!)
    : "—";

  if (milestones.length === 0) return null;

  return (
    <div className="v4-msclosed">
      <button
        type="button"
        className={`v4-msclosed-h${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="v4-msclosed-t">
          <svg
            className="v4-msclosed-chev"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Завершённые milestones
          <span className="v4-msclosed-count num">{milestones.length}</span>
        </span>
        <span className="v4-msclosed-meta">
          {totalIssues} issues · последнее: {lastClosed}
        </span>
      </button>

      {open && (
        <div className="v4-msclosed-body">
          {milestones.length > 8 && (
            <div className="v4-msclosed-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                placeholder="Поиск по названию или репо…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                aria-label="Поиск завершённых milestones"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="v4-msclosed-empty">Ничего не найдено</div>
          ) : (
            <>
              <div className="v4-msclosed-table">
                <div className="v4-msclosed-table-head">
                  <div />
                  <div>Milestone</div>
                  <div>Репозиторий</div>
                  <div>Закрыт</div>
                  <div>Issues</div>
                  <div className="v4-msclosed-th-pct">%</div>
                </div>
                {slice.map((m) => {
                  const total = m.openIssues + m.closedIssues;
                  // GitHub allows closing a milestone with open issues, so
                  // a CLOSED state doesn't imply 100% completion.
                  const pct = total > 0 ? Math.round((m.closedIssues / total) * 100) : 100;
                  return (
                    <a
                      key={m.url}
                      className="v4-msclosed-row"
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div>
                        <span
                          className="v4-msclosed-row-glyph"
                          style={{ background: repoGlyphColor(m.repo) }}
                        />
                      </div>
                      <div>
                        <span className="v4-msclosed-row-title" title={m.title}>
                          {m.title}
                        </span>
                      </div>
                      <div className="v4-msclosed-row-repo">{m.repo}</div>
                      <div className="v4-msclosed-row-date num">
                        {m.closedAt ? formatShortDate(m.closedAt) : "—"}
                      </div>
                      <div className="v4-msclosed-row-issues num">
                        {m.closedIssues}/{total}
                      </div>
                      <div className="v4-msclosed-row-pct num">{pct}%</div>
                    </a>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="v4-msclosed-pager">
                  <span>
                    {pageSafe * PAGE_SIZE + 1}–
                    {Math.min(
                      (pageSafe + 1) * PAGE_SIZE,
                      filtered.length
                    )}{" "}
                    из {filtered.length}
                  </span>
                  <div className="v4-msclosed-pager-ctrl">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={pageSafe === 0}
                    >
                      ← Назад
                    </button>
                    <span className="v4-msclosed-pager-num">
                      {pageSafe + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={pageSafe >= totalPages - 1}
                    >
                      Вперёд →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
