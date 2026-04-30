import { useState } from "react";
import type { PendingChange, PendingChangeStatus } from "../../../types";
import { fmtDateTime } from "./utils";

interface Props {
  history: PendingChange[];
  actionLoading: string | null;
  onRollback: (id: string) => void;
}

const STATUS_LABEL: Record<PendingChangeStatus, string> = {
  pending: "Ожидает",
  applied: "Применено",
  rejected: "Отклонено",
  rolled_back: "Откат",
};

const STATUS_TAG_CLASS: Record<PendingChangeStatus, string> = {
  pending: "v4-tag",
  applied: "v4-tag v4-tag--ok",
  rejected: "v4-tag v4-tag--warn",
  rolled_back: "v4-tag v4-tag--danger",
};

const INITIAL_SHOW = 10;

export function TuningHistoryPanel({ history, actionLoading, onRollback }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (history.length === 0) return null;

  const visible = showAll ? history : history.slice(0, INITIAL_SHOW);

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">История изменений</div>
        <div className="v4-pl-mono v4-qa-text-muted">{history.length} всего</div>
      </div>

      <div className="v4-qa-history">
        {visible.map((c) => {
          const busy = actionLoading === c.id;
          return (
            <div key={c.id} className="v4-qa-history-row">
              <div className="v4-qa-history-main">
                <span className={STATUS_TAG_CLASS[c.status]}>{STATUS_LABEL[c.status]}</span>
                <span className="v4-qa-history-target" title={c.target}>{c.target}</span>
                <span className="v4-tag v4-pl-mono">{c.change_type}</span>
              </div>
              <div className="v4-qa-history-meta">
                <span className="v4-pl-mono v4-qa-text-muted">{fmtDateTime(c.applied_at)}</span>
                {c.pr_url && (
                  <a
                    className="v4-linkbtn"
                    href={c.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PR
                  </a>
                )}
                {c.status === "applied" && (
                  <button
                    type="button"
                    className="v4-btn v4-qa-btn-reject"
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
        <div className="v4-qa-history-foot">
          <button type="button" className="v4-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Свернуть" : `Показать все (${history.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
