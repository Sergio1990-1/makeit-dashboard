import { useState } from "react";
import type { ApplyPreview, PendingChange, PendingChangeStatus } from "../types";
import { QualityPendingChangePreview } from "./QualityPendingChangePreview";

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
  /** Phase F2: optional diff-preview dry-run before apply. */
  loadPreview?: (changeId: string) => Promise<ApplyPreview>;
  /** Phase F2: bulk reject with checkbox selection. */
  onBulkReject?: (ids: string[]) => Promise<unknown>;
  /** Phase F2: tier filter UI. */
  tierFilter?: number | null;
  onTierFilterChange?: (tier: number | null) => void;
}

export function PendingChangesList({
  changes,
  actionLoading,
  onApprove,
  onReject,
  loadPreview,
  onBulkReject,
  tierFilter,
  onTierFilterChange,
}: PendingChangesListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewChange, setPreviewChange] = useState<PendingChange | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkReject() {
    if (!onBulkReject || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await onBulkReject(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleApplyClick(change: PendingChange) {
    if (loadPreview) {
      setPreviewChange(change);
    } else {
      onApprove(change.id);
    }
  }

  if (changes.length === 0) {
    return (
      <>
        {onTierFilterChange && (
          <TierFilterBar tierFilter={tierFilter ?? null} onChange={onTierFilterChange} />
        )}
        <div className="qp-empty">
          Нет ожидающих изменений. AutoTuner предложит оптимизации после ретроспективы.
        </div>
      </>
    );
  }

  return (
    <>
      {onTierFilterChange && (
        <TierFilterBar tierFilter={tierFilter ?? null} onChange={onTierFilterChange} />
      )}

      {onBulkReject && selectedIds.size > 0 && (
        <div className="qp-bulk-toolbar">
          <span>Выбрано: {selectedIds.size}</span>
          <button
            type="button"
            className="btn btn-sm qp-btn-reject"
            disabled={bulkLoading}
            onClick={handleBulkReject}
          >
            {bulkLoading ? "…" : `Отклонить ${selectedIds.size}`}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Снять выбор
          </button>
        </div>
      )}

      <div className="qp-cards">
        {changes.map((c) => {
          const busy = actionLoading === c.id;
          const isExpanded = expanded.has(c.id);
          const isSelected = selectedIds.has(c.id);
          return (
            <div key={c.id} className={`qp-card ${isSelected ? "qp-card-selected" : ""}`}>
              <div className="qp-card-header">
                <div className="qp-card-meta">
                  {onBulkReject && (
                    <input
                      type="checkbox"
                      className="qp-checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(c.id)}
                      aria-label="Выбрать"
                    />
                  )}
                  <span className="qp-target">{c.target}</span>
                  <span className="qp-change-type">{c.change_type}</span>
                  <span className="qp-tier">T{c.tier}</span>
                  {c.scoped_projects && c.scoped_projects.length > 0 && (
                    <span className="qp-scope-badge">
                      scope: {c.scoped_projects.join(", ")}
                    </span>
                  )}
                  {c.validation && (c.validation as { ok?: boolean }).ok === false && (
                    <span className="qp-validation-warn">⚠ validation</span>
                  )}
                </div>
                <div
                  className="qp-confidence"
                  title={`Уверенность: ${confidencePct(c.confidence)}`}
                >
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

              {isExpanded && (
                <div className="qp-card-details">
                  <div>
                    <span className="qp-detail-label">Staged</span>
                    <span>{fmtDate(c.created_at)}</span>
                  </div>
                  {c.validation && (
                    <div>
                      <span className="qp-detail-label">Validation</span>
                      <pre className="qp-validation-json">
                        {JSON.stringify(c.validation, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <div className="qp-card-footer">
                <button
                  type="button"
                  className="qp-card-expand"
                  onClick={() => toggleExpand(c.id)}
                >
                  {isExpanded ? "▲ Свернуть" : "▼ Детали"}
                </button>
                <span className="qp-card-date">{c.retro_period}</span>
                <div className="qp-actions">
                  <button
                    className="btn btn-sm qp-btn-approve"
                    disabled={busy}
                    onClick={() => handleApplyClick(c)}
                  >
                    {busy ? "…" : loadPreview ? "Preview + Apply" : "Применить"}
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

      {previewChange && loadPreview && (
        <QualityPendingChangePreview
          change={previewChange}
          loadPreview={loadPreview}
          onCancel={() => setPreviewChange(null)}
          onConfirm={() => {
            const id = previewChange.id;
            setPreviewChange(null);
            onApprove(id);
          }}
        />
      )}
    </>
  );
}

function TierFilterBar({
  tierFilter,
  onChange,
}: {
  tierFilter: number | null;
  onChange: (tier: number | null) => void;
}) {
  const options: Array<[number | null, string]> = [
    [null, "Все тиры"],
    [1, "Tier 1 (lessons)"],
    [2, "Tier 2 (rules)"],
    [3, "Tier 3 (config)"],
  ];
  return (
    <div className="qp-tier-filter">
      {options.map(([value, label]) => (
        <button
          key={label}
          type="button"
          className={`qp-tier-btn ${tierFilter === value ? "qp-tier-btn-active" : ""}`}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
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
