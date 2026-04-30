import { useEffect, useMemo, useState } from "react";
import type { ApplyPreview, PendingChange } from "../../../types";
import { fmtDateTime } from "./utils";
import { PendingChangePreviewV4 } from "./PendingChangePreview";

interface Props {
  changes: PendingChange[];
  actionLoading: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  loadPreview?: (changeId: string) => Promise<ApplyPreview>;
  onBulkReject?: (ids: string[]) => Promise<unknown>;
  tierFilter: number | null;
  onTierFilterChange: (tier: number | null) => void;
}

const TIER_OPTS: Array<[number | null, string]> = [
  [null, "Все тиры"],
  [1, "T1 lessons"],
  [2, "T2 rules"],
  [3, "T3 config"],
];

function ageHours(iso: string): number {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60));
}

function fmtAgeShort(iso: string): string {
  const h = ageHours(iso);
  if (h < 1) return `${Math.round(h * 60)} мин`;
  if (h < 24) return `${h.toFixed(0)} ч`;
  const d = h / 24;
  if (d < 7) return `${d.toFixed(0)} дн`;
  return `${Math.round(d / 7)} нед`;
}

export function PendingChangesPanel({
  changes,
  actionLoading,
  onApprove,
  onReject,
  loadPreview,
  onBulkReject,
  tierFilter,
  onTierFilterChange,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewChange, setPreviewChange] = useState<PendingChange | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Sort: invalid first, then by confidence × age (urgency).
  // Memoized: prop array reference is stable across renders only when it
  // really hasn't changed (parent uses identity), so this is safe.
  const sortedChanges = useMemo(() => {
    const arr = [...changes];
    arr.sort((a, b) => {
      const aBad = (a.validation as { ok?: boolean } | null)?.ok === false ? 1 : 0;
      const bBad = (b.validation as { ok?: boolean } | null)?.ok === false ? 1 : 0;
      if (aBad !== bBad) return bBad - aBad;
      const scoreA = a.confidence * Math.log(1 + ageHours(a.created_at));
      const scoreB = b.confidence * Math.log(1 + ageHours(b.created_at));
      return scoreB - scoreA;
    });
    return arr;
  }, [changes]);

  // Reconcile per-row state when filters drop rows from view.
  useEffect(() => {
    const visibleIds = new Set(sortedChanges.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    setPreviewChange((prev) => (prev && visibleIds.has(prev.id) ? prev : null));
  }, [sortedChanges]);

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

  function handleApplyClick(c: PendingChange) {
    if (loadPreview) setPreviewChange(c);
    else onApprove(c.id);
  }

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          AutoTuner pending
          {sortedChanges.length > 0 && (
            <span className="v4-tag v4-tag--warn" style={{ marginLeft: 8 }}>
              {sortedChanges.length}
            </span>
          )}
        </div>
        <div className="v4-pillgrp">
          {TIER_OPTS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              className={tierFilter === value ? "is-active" : ""}
              onClick={() => onTierFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {onBulkReject && selectedIds.size > 0 && (
        <div className="v4-qa-bulk">
          <span className="v4-pl-mono">Выбрано: {selectedIds.size}</span>
          <button
            type="button"
            className="v4-btn v4-qa-btn-reject"
            disabled={bulkLoading}
            onClick={handleBulkReject}
          >
            {bulkLoading ? "…" : `Отклонить ${selectedIds.size}`}
          </button>
          <button type="button" className="v4-btn" onClick={() => setSelectedIds(new Set())}>
            Снять выбор
          </button>
        </div>
      )}

      {sortedChanges.length === 0 ? (
        <div className="v4-empty">
          Нет ожидающих изменений. AutoTuner предложит оптимизации после ретроспективы.
        </div>
      ) : (
        <div className="v4-qa-pending-list">
          {sortedChanges.map((c) => {
            const busy = actionLoading === c.id;
            const isExpanded = expanded.has(c.id);
            const isSelected = selectedIds.has(c.id);
            const validationFailed = (c.validation as { ok?: boolean } | null)?.ok === false;
            const confPct = Math.round(c.confidence * 100);
            return (
              <div key={c.id} className={`v4-qa-pending ${isSelected ? "is-selected" : ""}`}>
                <div className="v4-qa-pending-h">
                  <div className="v4-qa-pending-meta">
                    {onBulkReject && (
                      <input
                        type="checkbox"
                        className="v4-qa-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        aria-label="Выбрать"
                      />
                    )}
                    <span className="v4-qa-pending-target" title={c.target}>{c.target}</span>
                    <span className="v4-tag v4-pl-mono">{c.change_type}</span>
                    <span className="v4-tag">T{c.tier}</span>
                    {c.scoped_projects && c.scoped_projects.length > 0 && (
                      <span className="v4-tag">scope: {c.scoped_projects.join(", ")}</span>
                    )}
                    {validationFailed && (
                      <span className="v4-tag v4-tag--danger">⚠ validation</span>
                    )}
                    <span className="v4-qa-pending-age v4-pl-mono">{fmtAgeShort(c.created_at)}</span>
                  </div>
                  <div className="v4-qa-pending-conf" title={`Уверенность: ${confPct}%`}>
                    <div className="v4-qa-pending-conf-bar">
                      <div
                        className="v4-qa-pending-conf-fill"
                        style={{ width: `${confPct}%`, background: confColor(c.confidence) }}
                      />
                    </div>
                    <span className="v4-pl-mono v4-qa-pending-conf-l" style={{ color: confColor(c.confidence) }}>
                      {confPct}%
                    </span>
                  </div>
                </div>

                <div className="v4-qa-pending-content">{c.content}</div>
                <div className="v4-qa-pending-rationale">{c.rationale}</div>

                {isExpanded && (
                  <div className="v4-qa-pending-details">
                    <div>
                      <span className="v4-qa-text-muted">Staged:</span> {fmtDateTime(c.created_at)}
                    </div>
                    {c.validation && (
                      <pre className="v4-qa-pending-json">
                        {JSON.stringify(c.validation, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                <div className="v4-qa-pending-foot">
                  <button
                    type="button"
                    className="v4-linkbtn"
                    onClick={() => toggleExpand(c.id)}
                  >
                    {isExpanded ? "▴ Свернуть" : "▾ Детали"}
                  </button>
                  <span className="v4-qa-text-muted v4-pl-mono">{c.retro_period}</span>
                  <div className="v4-qa-pending-actions">
                    <button
                      type="button"
                      className="v4-btn v4-btn--pri"
                      disabled={busy}
                      onClick={() => handleApplyClick(c)}
                    >
                      {busy ? "…" : loadPreview ? "Preview + Apply" : "Применить"}
                    </button>
                    <button
                      type="button"
                      className="v4-btn v4-qa-btn-reject"
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
      )}

      {previewChange && loadPreview && (
        <PendingChangePreviewV4
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
    </div>
  );
}

function confColor(c: number): string {
  if (c >= 0.85) return "var(--v4-success-700)";
  if (c >= 0.7) return "var(--v4-warn-700)";
  return "var(--v4-danger-700)";
}
