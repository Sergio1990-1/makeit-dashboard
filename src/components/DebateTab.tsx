import { useState, useEffect } from "react";
import { useDebate } from "../hooks/useDebate";
import { StartDebateModal } from "./StartDebateModal";
import { DebateChat } from "./DebateChat";
import type { DebateListItem } from "../types/debate";

function statusBadge(status: DebateListItem["status"]) {
  const map: Record<string, { label: string; cls: string; ariaLabel: string }> = {
    queued: { label: "Queued", cls: "badge-queued", ariaLabel: "Status: queued" },
    running: { label: "Running", cls: "badge-running", ariaLabel: "Status: running" },
    done: { label: "Done", cls: "badge-done", ariaLabel: "Status: done" },
    error: { label: "Error", cls: "badge-error", ariaLabel: "Status: error" },
  };
  const b = map[status] ?? { label: status, cls: "", ariaLabel: `Status: ${status}` };
  return <span className={`debate-badge ${b.cls}`} aria-label={b.ariaLabel}>{b.label}</span>;
}

function consensusBadge(level: DebateListItem["consensus_level"]) {
  const map: Record<string, { label: string; cls: string; ariaLabel: string }> = {
    unanimous: { label: "Unanimous", cls: "badge-unanimous", ariaLabel: "Consensus: unanimous" },
    majority: { label: "Majority", cls: "badge-majority", ariaLabel: "Consensus: majority" },
    contested: { label: "Contested", cls: "badge-contested", ariaLabel: "Consensus: contested" },
  };
  const b = map[level] ?? { label: level, cls: "", ariaLabel: `Consensus: ${level}` };
  return <span className={`debate-badge ${b.cls}`} aria-label={b.ariaLabel}>{b.label}</span>;
}

function DebateListSkeleton() {
  return (
    <div className="debate-skeleton" aria-busy="true" aria-label="Loading debates">
      {[1, 2, 3].map((i) => (
        <div key={i} className="debate-skeleton-row">
          <div className="debate-skeleton-bar debate-skeleton-topic" />
          <div className="debate-skeleton-bar debate-skeleton-short" />
          <div className="debate-skeleton-bar debate-skeleton-badge" />
          <div className="debate-skeleton-bar debate-skeleton-badge" />
          <div className="debate-skeleton-bar debate-skeleton-short" />
          <div className="debate-skeleton-bar debate-skeleton-short" />
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes}м назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  return `${days}д назад`;
}

export function DebateTab() {
  const { debates, loading, error, refresh } = useDebate();
  const [showModal, setShowModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualBack, setManualBack] = useState(false);

  // Auto-resume: if no debate explicitly selected, pick the running one
  const effectiveId = selectedId
    ?? (manualBack ? null : debates.find((d) => d.status === "running")?.id ?? null);

  const sorted = [...debates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const handleStarted = (id: string) => {
    setShowModal(false);
    setManualBack(false);
    refresh();
    setSelectedId(id);
  };

  /* ── Chat view ── */
  if (effectiveId) {
    return (
      <div className="bento-panel span-12" style={{ padding: 0, overflow: "hidden" }}>
        <DebateChat debateId={effectiveId} onBack={() => { setManualBack(true); setSelectedId(null); }} />
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="bento-panel span-12" role="region" aria-label="Debate Engine">
      <div className="bento-panel-title">
        <div>
          Debate Engine
          <span className="audit-header-sub">Multi-Agent Technical Consilium</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="btn btn-sm"
            onClick={refresh}
            disabled={loading}
            aria-label={loading ? "Loading debates" : "Refresh debate list"}
          >
            {loading ? "Загрузка..." : "Обновить"}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowModal(true)}
            aria-label="Start new debate"
          >
            Start Debate
          </button>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {loading && debates.length === 0 && !error && <DebateListSkeleton />}

      {!loading && debates.length === 0 && !error && (
        <div className="debate-empty">
          <div className="debate-empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 9h8" />
              <path d="M8 13h6" />
            </svg>
          </div>
          <h3>Debate Engine</h3>
          <p>
            Мультиагентная дискуссия для принятия архитектурных решений.
            Несколько AI-экспертов обсуждают тему с разных позиций
            и формируют ADR (Architecture Decision Record).
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: "var(--sp-4)" }}
            onClick={() => setShowModal(true)}
          >
            Запустить первый дебат
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="debate-list">
          {/* Desktop table view */}
          <table className="debate-table debate-table--desktop" aria-label="Debate history">
            <thead>
              <tr>
                <th scope="col">Тема</th>
                <th scope="col">Проект</th>
                <th scope="col">Статус</th>
                <th scope="col">Консенсус</th>
                <th scope="col">Стоимость</th>
                <th scope="col">Дата</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr
                  key={d.id}
                  className="debate-row debate-row--clickable"
                  onClick={() => { setManualBack(false); setSelectedId(d.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(d.id); } }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open debate: ${d.topic}`}
                >
                  <td className="debate-topic">{d.topic}</td>
                  <td className="debate-project">
                    {d.project ? d.project.split("/").pop() : "—"}
                  </td>
                  <td>{statusBadge(d.status)}</td>
                  <td>{d.status === "done" ? consensusBadge(d.consensus_level) : "—"}</td>
                  <td className="debate-cost">
                    ${(d.total_cost ?? 0).toFixed(2)}
                  </td>
                  <td className="debate-date">{relativeTime(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card view */}
          <div className="debate-cards" role="list" aria-label="Debate history">
            {sorted.map((d) => (
              <div
                key={d.id}
                className="debate-card"
                onClick={() => { setManualBack(false); setSelectedId(d.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(d.id); } }}
                tabIndex={0}
                role="listitem"
                aria-label={`Open debate: ${d.topic}`}
              >
                <div className="debate-card-header">
                  <span className="debate-card-topic">{d.topic}</span>
                  {statusBadge(d.status)}
                </div>
                <div className="debate-card-meta">
                  {d.project && (
                    <span className="debate-card-project">{d.project.split("/").pop()}</span>
                  )}
                  {d.status === "done" && consensusBadge(d.consensus_level)}
                  <span className="debate-card-cost">${(d.total_cost ?? 0).toFixed(2)}</span>
                  <span className="debate-card-date">{relativeTime(d.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
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
