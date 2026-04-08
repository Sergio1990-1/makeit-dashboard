import { useState } from "react";
import type { PendingChange, PendingChangeStatus } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PendingChangeStatus, string> = {
  pending: "Ожидает",
  applied: "Применено",
  rejected: "Отклонено",
  rolled_back: "Откат",
};

function statusClass(s: PendingChangeStatus): string {
  return `qp-status--${s}`;
}

function confidencePct(c: number): string {
  return `${(c * 100).toFixed(0)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── PendingChangesList ──────────────────────────────────────────────

interface PendingChangesListProps {
  changes: PendingChange[];
  actionLoading: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function PendingChangesList({
  changes,
  actionLoading,
  onApprove,
  onReject,
}: PendingChangesListProps) {
  if (changes.length === 0) {
    return (
      <div className="qp-empty">
        Нет ожидающих изменений. AutoTuner предложит оптимизации после ретроспективы.
      </div>
    );
  }

  return (
    <div className="qp-cards">
      {changes.map((c) => {
        const busy = actionLoading === c.id;
        return (
          <div key={c.id} className="qp-card">
            <div className="qp-card-header">
              <div className="qp-card-meta">
                <span className="qp-target">{c.target}</span>
                <span className="qp-change-type">{c.change_type}</span>
                <span className="qp-tier">T{c.tier}</span>
              </div>
              <div className="qp-confidence" title={`Уверенность: ${confidencePct(c.confidence)}`}>
                <div className="qp-confidence-bar">
                  <div
                    className="qp-confidence-fill"
                    style={{ width: confidencePct(c.confidence) }}
                  />
                </div>
                <span className="qp-confidence-label">{confidencePct(c.confidence)}</span>
              </div>
            </div>

            <div className="qp-card-content">{c.content}</div>
            <div className="qp-card-rationale">{c.rationale}</div>

            <div className="qp-card-footer">
              <span className="qp-card-date">{c.retro_period}</span>
              <div className="qp-actions">
                <button
                  className="btn btn-sm qp-btn-approve"
                  disabled={busy}
                  onClick={() => onApprove(c.id)}
                >
                  {busy ? "…" : "Применить"}
                </button>
                <button
                  className="btn btn-sm qp-btn-reject"
                  disabled={busy}
                  onClick={() => onReject(c.id)}
                >
                  {busy ? "…" : "Отклонить"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── TuningHistory ───────────────────────────────────────────────────

interface TuningHistoryProps {
  history: PendingChange[];
  actionLoading: string | null;
  onRollback: (id: string) => void;
}

const INITIAL_SHOW = 10;

export function TuningHistory({
  history,
  actionLoading,
  onRollback,
}: TuningHistoryProps) {
  const [showAll, setShowAll] = useState(false);

  if (history.length === 0) {
    return (
      <div className="qp-empty">
        История изменений пуста.
      </div>
    );
  }

  const visible = showAll ? history : history.slice(0, INITIAL_SHOW);

  return (
    <div className="qp-history">
      <div className="qp-history-items">
        {visible.map((c) => {
          const busy = actionLoading === c.id;
          return (
            <div key={c.id} className="qp-history-item">
              <div className="qp-history-main">
                <span className={`qp-status ${statusClass(c.status)}`}>
                  {STATUS_LABELS[c.status]}
                </span>
                <span className="qp-history-target">{c.target}</span>
                <span className="qp-history-type">{c.change_type}</span>
              </div>
              <div className="qp-history-details">
                <span className="qp-history-date">{fmtDate(c.applied_at)}</span>
                {c.pr_url && (
                  <a
                    className="qp-history-pr"
                    href={c.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PR
                  </a>
                )}
                {c.status === "applied" && (
                  <button
                    className="btn btn-sm qp-btn-rollback"
                    disabled={busy}
                    onClick={() => onRollback(c.id)}
                  >
                    {busy ? "…" : "Откатить"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {history.length > INITIAL_SHOW && (
        <button
          className="btn btn-sm qp-show-more"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Свернуть" : `Показать все (${history.length})`}
        </button>
      )}
    </div>
  );
}
