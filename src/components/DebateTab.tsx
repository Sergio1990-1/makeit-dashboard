import { useState } from "react";
import { useDebate } from "../hooks/useDebate";
import { StartDebateModal } from "./StartDebateModal";
import { DebateChat } from "./DebateChat";
import type { DebateListItem } from "../types/debate";

function statusBadge(status: DebateListItem["status"]) {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "badge-queued" },
    running: { label: "Running", cls: "badge-running" },
    done: { label: "Done", cls: "badge-done" },
    error: { label: "Error", cls: "badge-error" },
  };
  const b = map[status] ?? { label: status, cls: "" };
  return <span className={`debate-badge ${b.cls}`}>{b.label}</span>;
}

function consensusBadge(level: DebateListItem["consensus_level"]) {
  const map: Record<string, { label: string; cls: string }> = {
    unanimous: { label: "Unanimous", cls: "badge-unanimous" },
    majority: { label: "Majority", cls: "badge-majority" },
    contested: { label: "Contested", cls: "badge-contested" },
  };
  const b = map[level] ?? { label: level, cls: "" };
  return <span className={`debate-badge ${b.cls}`}>{b.label}</span>;
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

  const sorted = [...debates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const handleStarted = (id: string) => {
    setShowModal(false);
    refresh();
    setSelectedId(id);
  };

  /* ── Chat view ── */
  if (selectedId) {
    return (
      <div className="bento-panel span-12" style={{ padding: 0, overflow: "hidden" }}>
        <DebateChat debateId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="bento-panel span-12">
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
          >
            {loading ? "Загрузка..." : "Обновить"}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowModal(true)}
          >
            Start Debate
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!loading && debates.length === 0 && !error && (
        <div className="debate-empty">
          <div className="debate-empty-icon">
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
          <table className="debate-table">
            <thead>
              <tr>
                <th>Тема</th>
                <th>Проект</th>
                <th>Статус</th>
                <th>Консенсус</th>
                <th>Стоимость</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr
                  key={d.id}
                  className="debate-row debate-row--clickable"
                  onClick={() => setSelectedId(d.id)}
                >
                  <td className="debate-topic">{d.topic}</td>
                  <td className="debate-project">
                    {d.project ? d.project.split("/").pop() : "—"}
                  </td>
                  <td>{statusBadge(d.status)}</td>
                  <td>{d.status === "done" ? consensusBadge(d.consensus_level) : "—"}</td>
                  <td className="debate-cost">
                    ${d.total_cost.toFixed(2)}
                  </td>
                  <td className="debate-date">{relativeTime(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
