import { useEffect, useMemo, useRef, useState } from "react";
import { useSpecs } from "../../../hooks/useSpecs";
import { SpecsHero } from "./SpecsHero";
import { SpecsKpiStrip } from "./SpecsKpiStrip";
import { SpecCardV4 } from "./SpecCardV4";
import {
  applyFilter,
  applySearch,
  SPEC_FILTERS,
  type SpecFilter,
} from "./utils";

const STORAGE_FILTER = "v4spc:filter";

function readFilter(): SpecFilter {
  try {
    const v = localStorage.getItem(STORAGE_FILTER);
    if (
      v === "all" ||
      v === "in_development" ||
      v === "spec_ready" ||
      v === "draft" ||
      v === "completed"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "all";
}

export function SpecsView() {
  const { projects, loading, error, refresh } = useSpecs();
  const loadedRef = useRef(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SpecFilter>(() => readFilter());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FILTER, filter);
    } catch {
      /* ignore */
    }
  }, [filter]);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      refresh();
    }
  }, [refresh]);

  const visible = useMemo(
    () => applySearch(applyFilter(projects, filter), search),
    [projects, filter, search],
  );

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Specs</h1>
          <div className="v4-sub">
            PRD → Epic → Tasks из <span className="v4-pl-mono">makeit-pipeline</span> ·{" "}
            <span className="v4-pl-mono">{projects.length}</span> PRD
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <SpecsHero
        projects={projects}
        loading={loading}
        error={error}
        onRefresh={refresh}
      />

      <SpecsKpiStrip projects={projects} />

      <div className="v4-au-toolbar">
        <div className="v4-mon-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Поиск по PRD или эпику"
            placeholder="Поиск по PRD или эпику…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v4-pillgrp">
          {SPEC_FILTERS.map(({ key, label }) => (
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
      </div>

      {loading && projects.length === 0 ? (
        <div className="v4-empty" style={{ marginTop: 14 }}>
          Загрузка спецификаций…
        </div>
      ) : visible.length === 0 && projects.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-spc-empty">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h3>Specs Tracking</h3>
            <p>
              Отслеживание спецификаций от PRD до задач. Используйте{" "}
              <span className="v4-pl-mono">makeit-plan</span> в{" "}
              <span className="v4-pl-mono">makeit-pipeline</span>, чтобы сгенерировать PRD,
              Epic и Tasks из описания фичи.
            </p>
            <div className="v4-spc-empty-cmd">
              <code>makeit-plan "описание фичи"</code>
            </div>
            <button type="button" className="v4-btn v4-btn--pri" onClick={refresh} disabled={loading}>
              {loading ? "Загрузка…" : "Загрузить спецификации"}
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
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
        <>
          {loading && projects.length > 0 && (
            <div className="v4-rsh-refresh-hint v4-pl-mono v4-rsh-text-muted" role="status">
              Обновление…
            </div>
          )}
          <div className="v4-spc-list">
            {visible.map((p, i) => (
              <SpecCardV4
                key={p.prd.id}
                project={p}
                initialExpanded={i === 0 && p.computedStatus === "in_development"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
