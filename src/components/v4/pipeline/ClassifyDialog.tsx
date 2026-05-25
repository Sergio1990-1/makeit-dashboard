import { useEffect } from "react";
import type { ClassifyProgress, ClassifyResponse } from "../../../utils/pipeline";

interface Props {
  open: boolean;
  classifying: boolean;
  progress: ClassifyProgress | null;
  result: ClassifyResponse | null;
  error: string | null;
  onClose: () => void;
}

export function ClassifyDialog({
  open,
  classifying,
  progress,
  result,
  error,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !classifying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, classifying, onClose]);

  if (!open) return null;

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="v4-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !classifying) onClose();
      }}
    >
      <div className="v4-modal" role="dialog" aria-modal="true">
        <div className="v4-modal-h">
          <h3 className="v4-modal-t">
            {classifying && "Классификация issues…"}
            {!classifying && result && "Классификация завершена"}
            {!classifying && error && "Ошибка классификации"}
          </h3>
          {!classifying && (
            <button
              type="button"
              className="v4-modal-close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
          )}
        </div>

        <div className="v4-modal-body">
          {classifying && (
            <div className="v4-pl-classify-progress">
              {progress ? (
                <>
                  <div className="v4-pl-classify-current">{progress.current}</div>
                  <div className="v4-ptrack" style={{ height: 8 }}>
                    <div
                      className="v4-pfill"
                      style={{ width: `${pct}%`, background: "var(--mk-brand-500)" }}
                    />
                  </div>
                  <div className="v4-pl-classify-meta v4-pl-mono">
                    {done} / {total} ({pct}%)
                  </div>
                  <div className="v4-pl-classify-breakdown">
                    <span style={{ color: "var(--mk-success-strong)" }}>
                      auto: {progress.breakdown.auto}
                    </span>
                    <span className="v4-pl-sep">·</span>
                    <span style={{ color: "var(--mk-warn-strong)" }}>
                      assisted: {progress.breakdown.assisted}
                    </span>
                    <span className="v4-pl-sep">·</span>
                    <span style={{ color: "var(--mk-danger-strong)" }}>
                      manual: {progress.breakdown.manual}
                    </span>
                    {progress.breakdown.errors > 0 && (
                      <>
                        <span className="v4-pl-sep">·</span>
                        <span className="v4-pl-text-muted">
                          errors: {progress.breakdown.errors}
                        </span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="v4-pl-classify-current">Загрузка issues…</div>
              )}
            </div>
          )}

          {!classifying && result && progress && (
            <div className="v4-pl-classify-done">
              <div className="v4-pl-classify-grid">
                <div>
                  <div className="num" style={{ fontSize: 28, fontWeight: 700, color: "var(--mk-success-strong)" }}>
                    {progress.breakdown.auto}
                  </div>
                  <div className="v4-pl-classify-cell-l">Auto</div>
                </div>
                <div>
                  <div className="num" style={{ fontSize: 28, fontWeight: 700, color: "var(--mk-warn-strong)" }}>
                    {progress.breakdown.assisted}
                  </div>
                  <div className="v4-pl-classify-cell-l">Assisted</div>
                </div>
                <div>
                  <div className="num" style={{ fontSize: 28, fontWeight: 700, color: "var(--mk-danger-strong)" }}>
                    {progress.breakdown.manual}
                  </div>
                  <div className="v4-pl-classify-cell-l">Manual</div>
                </div>
              </div>
              <p className="v4-pl-classify-summary">
                Классифицировано {result.classified} issues
              </p>
            </div>
          )}

          {!classifying && error && (
            <div className="v4-error" style={{ margin: 0 }}>{error}</div>
          )}
        </div>

        <div className="v4-modal-footer">
          {!classifying && (
            <button type="button" className="v4-btn v4-btn--pri" onClick={onClose}>
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
