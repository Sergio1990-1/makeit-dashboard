import { useEffect, useMemo, useState } from "react";
import { useDebate } from "../../../hooks/useDebate";
import { DebateChat } from "../../DebateChat";
import { StartDebateModal } from "../../StartDebateModal";
import { DebateCard } from "./DebateCard";
import { DebateHero } from "./DebateHero";
import { DebateKpiStrip } from "./DebateKpiStrip";
import {
  applyFilter,
  applySearch,
  applySort,
  DEBATE_FILTERS,
  type DebateFilter,
  type DebateSort,
} from "./utils";

const STORAGE_FILTER = "v4db:filter";
const STORAGE_SORT = "v4db:sort";

function readFilter(): DebateFilter {
  try {
    const v = localStorage.getItem(STORAGE_FILTER);
    if (v === "all" || v === "running" || v === "done" || v === "error") return v;
  } catch { /* ignore */ }
  return "all";
}

function readSort(): DebateSort {
  try {
    const v = localStorage.getItem(STORAGE_SORT);
    if (v === "date" || v === "cost") return v;
  } catch { /* ignore */ }
  return "date";
}

export function DebateView() {
  const { debates, loading, error, refresh } = useDebate();
  const [showModal, setShowModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualBack, setManualBack] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DebateFilter>(() => readFilter());
  const [sort, setSort] = useState<DebateSort>(() => readSort());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_FILTER, filter); } catch { /* ignore */ }
  }, [filter]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_SORT, sort); } catch { /* ignore */ }
  }, [sort]);

  // Frozen "now" — refreshed every 30s and on data change.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setNowMs(Date.now());
    });
    return () => { cancelled = true; };
  }, [debates]);

  // Auto-resume: if no debate explicitly selected, pick the running one
  // unless the user explicitly clicked "back" out of it.
  const effectiveId = selectedId
    ?? (manualBack ? null : debates.find((d) => d.status === "running")?.id ?? null);

  const visible = useMemo(() => {
    return applySort(applySearch(applyFilter(debates, filter), search), sort);
  }, [debates, filter, search, sort]);

  const handleStarted = (id: string) => {
    setShowModal(false);
    setManualBack(false);
    refresh();
    setSelectedId(id);
  };

  /* ── Chat view ── */
  if (effectiveId) {
    return (
      <div className="v4-content">
        <DebateChat
          debateId={effectiveId}
          onBack={() => { setManualBack(true); setSelectedId(null); }}
        />
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Debate</h1>
          <div className="v4-sub">
            Multi-agent technical consilium ·{" "}
            <span className="v4-pl-mono">{debates.length}</span> {debates.length === 1 ? "дебат" : "дебатов"}
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <DebateHero
        debates={debates}
        loading={loading}
        onRefresh={refresh}
        onStart={() => setShowModal(true)}
        onOpenActive={(id) => { setManualBack(false); setSelectedId(id); }}
      />

      {error && debates.length > 0 && <div className="v4-error" style={{ marginTop: 14 }}>{error}</div>}

      <DebateKpiStrip debates={debates} />

      <div className="v4-au-toolbar">
        <div className="v4-mon-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Поиск по теме или проекту"
            placeholder="Поиск по теме, проекту…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v4-pillgrp">
          {DEBATE_FILTERS.map(({ key, label }) => (
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
        <div className="v4-pillgrp">
          <button
            type="button"
            className={sort === "date" ? "is-active" : ""}
            onClick={() => setSort("date")}
          >
            По дате
          </button>
          <button
            type="button"
            className={sort === "cost" ? "is-active" : ""}
            onClick={() => setSort("cost")}
          >
            По стоимости
          </button>
        </div>
      </div>

      {loading && debates.length === 0 ? (
        <div className="v4-empty" style={{ marginTop: 14 }}>Загрузка…</div>
      ) : error && debates.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-db-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <h3>Не удалось загрузить дебаты</h3>
            <p>{error || "Проверьте соединение и попробуйте снова."}</p>
            <button type="button" className="v4-btn v4-btn--pri" onClick={refresh}>
              Повторить
            </button>
          </div>
        </div>
      ) : visible.length === 0 && debates.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-db-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 9h8" />
              <path d="M8 13h6" />
            </svg>
            <h3>Дебатов ещё не было</h3>
            <p>
              Мультиагентная дискуссия для архитектурных решений: несколько AI-экспертов
              обсуждают тему с разных позиций и формируют ADR (Architecture Decision Record).
            </p>
            <button type="button" className="v4-btn v4-btn--pri" onClick={() => setShowModal(true)}>
              Запустить первый дебат
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
        <div className="v4-db-grid">
          {visible.map((d) => (
            <DebateCard
              key={d.id}
              debate={d}
              nowMs={nowMs}
              onOpen={() => { setManualBack(false); setSelectedId(d.id); }}
            />
          ))}
        </div>
      )}

      {showModal && (
        <StartDebateModal
          onClose={() => setShowModal(false)}
          onStarted={handleStarted}
        />
      )}
    </div>
  );
}
