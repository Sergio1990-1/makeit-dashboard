import { useEffect, useMemo, useState } from "react";
import { useUXAudit } from "../../../hooks/useUXAudit";
import type { AuditProjectStatus } from "../../../types";
import { AuditOfflinePanel } from "./AuditOfflinePanel";
import { UXProjectCardV4 } from "./UXProjectCardV4";

const STORAGE_FILTER = "v4ux:filter";

type UXFilter = "all" | "completed" | "running" | "notRun";

const FILTERS: Array<{ key: UXFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "completed", label: "Завершены" },
  { key: "running", label: "Запущены" },
  { key: "notRun", label: "Не запускались" },
];

function readFilter(): UXFilter {
  try {
    const v = localStorage.getItem(STORAGE_FILTER);
    if (v === "all" || v === "completed" || v === "running" || v === "notRun") return v;
  } catch { /* ignore */ }
  return "all";
}

export function UXAuditView() {
  const { projects, statuses, results, auditorAvailable, loading, error, refresh, startRun, cancelRun } = useUXAudit();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [findingFilter, setFindingFilter] = useState<string>("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [runError, setRunError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UXFilter>(() => readFilter());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_FILTER, filter); } catch { /* ignore */ }
  }, [filter]);

  const filtered = useMemo<AuditProjectStatus[]>(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.repo.toLowerCase().includes(q)) return false;
      const s = statuses[p.name]?.state;
      if (filter === "completed" && s !== "completed") return false;
      if (filter === "running" && s !== "running") return false;
      if (filter === "notRun" && (s === "completed" || s === "running" || s === "failed")) return false;
      return true;
    });
  }, [projects, statuses, filter, search]);

  if (loading && projects.length === 0) {
    return (
      <div className="v4-empty" style={{ marginTop: 14 }}>Загрузка UX-конфигурации…</div>
    );
  }

  if (auditorAvailable === false) {
    return (
      <div style={{ marginTop: 14 }}>
        <AuditOfflinePanel onRetry={refresh} />
      </div>
    );
  }

  return (
    <>
      {(error || runError) && (
        <div className="v4-error" style={{ marginTop: 14 }}>{runError || error}</div>
      )}

      <div className="v4-au-toolbar">
        <div className="v4-mon-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Поиск по проектам"
            placeholder="Поиск по имени проекта…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v4-pillgrp">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "is-active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="v4-btn" onClick={refresh} disabled={loading}>
          {loading ? "Загрузка…" : "↻ Обновить"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-empty">
            По текущим фильтрам ничего не найдено
            {search && (
              <>
                {" "}для запроса <span className="v4-pl-mono">«{search}»</span>
              </>
            )}
            .
          </div>
        </div>
      ) : (
        <div className="v4-au-grid">
          {filtered.map((p) => (
            <UXProjectCardV4
              key={p.name}
              project={p}
              status={statuses[p.name]}
              result={results[p.name]}
              isExpanded={expandedProject === p.name}
              findingFilter={findingFilter}
              pageFilter={pageFilter}
              onRun={async () => {
                setRunError(null);
                try { await startRun(p.name); } catch (e) {
                  setRunError(e instanceof Error ? e.message : String(e));
                }
              }}
              onCancel={() => cancelRun(p.name)}
              onToggleExpand={() => {
                const willExpand = expandedProject !== p.name;
                setExpandedProject(willExpand ? p.name : null);
                // Reset filters on every toggle (expand AND collapse) so the
                // next card opens with a clean slate, regardless of what the
                // previously expanded card's filters were.
                setFindingFilter("all");
                setPageFilter("all");
              }}
              onSeverityChange={setFindingFilter}
              onPageChange={setPageFilter}
            />
          ))}
        </div>
      )}
    </>
  );
}
