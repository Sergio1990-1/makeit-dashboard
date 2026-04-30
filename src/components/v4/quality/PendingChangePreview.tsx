import { useEffect, useRef, useState } from "react";
import type { ApplyPreview, PendingChange } from "../../../types";

interface Props {
  change: PendingChange;
  loadPreview: (changeId: string) => Promise<ApplyPreview>;
  onConfirm: () => void;
  onCancel: () => void;
}

const TITLE_ID = "v4-qa-pp-title";

export function PendingChangePreviewV4({ change, loadPreview, onConfirm, onCancel }: Props) {
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      loadPreview(change.id)
        .then((p) => { if (!cancelled) setPreview(p); })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки preview");
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [change.id, loadPreview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const validationOk = preview?.validation === null || preview?.validation?.ok !== false;
  const validationFailed = preview?.validation != null && validationOk === false;

  return (
    <div className="v4-qa-modal-backdrop" onClick={onCancel}>
      <div
        className="v4-qa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="v4-qa-modal-h">
          <div id={TITLE_ID} className="v4-qa-modal-t">Preview · {change.target}</div>
          <button
            type="button"
            ref={closeButtonRef}
            className="v4-qa-modal-x"
            aria-label="Закрыть"
            onClick={onCancel}
          >×</button>
        </div>

        <div className="v4-qa-modal-body">
          <div className="v4-qa-modal-section">
            <div className="v4-qa-modal-label">Content</div>
            <div className="v4-qa-modal-content">{change.content}</div>
          </div>

          <div className="v4-qa-modal-meta">
            <div><span className="v4-qa-modal-meta-l">Tier</span><span>{change.tier}</span></div>
            <div><span className="v4-qa-modal-meta-l">Confidence</span><span>{(change.confidence * 100).toFixed(0)}%</span></div>
            <div><span className="v4-qa-modal-meta-l">Retro</span><span>{change.retro_period}</span></div>
          </div>

          {loading ? (
            <div className="v4-empty">Загрузка preview…</div>
          ) : error ? (
            <div className="v4-error">{error}</div>
          ) : preview ? (
            <>
              <div className="v4-qa-modal-badges">
                {preview.dedup_hit ? (
                  <span className="v4-tag v4-tag--warn">⚠ Duplicate</span>
                ) : (
                  <span className="v4-tag v4-tag--ok">✓ Not a duplicate</span>
                )}
                {preview.would_rotate && <span className="v4-tag">⟳ Would rotate file</span>}
                {preview.validation !== null && (
                  validationOk ? (
                    <span className="v4-tag v4-tag--ok">✓ Validation OK</span>
                  ) : (
                    <span className="v4-tag v4-tag--danger">
                      ⚠ {String((preview.validation as { reason?: string }).reason ?? "validation failed")}
                    </span>
                  )
                )}
                {preview.scoped_projects && preview.scoped_projects.length > 0 ? (
                  <span className="v4-tag">scope: {preview.scoped_projects.join(", ")}</span>
                ) : (
                  <span className="v4-tag">scope: all projects</span>
                )}
              </div>

              <div className="v4-qa-modal-section">
                <div className="v4-qa-modal-label">
                  Targets · {preview.targets.length} {preview.targets.length === 1 ? "файл" : "файлов"}
                </div>
                <div className="v4-qa-modal-targets">
                  {preview.targets.length === 0 ? (
                    <span className="v4-qa-text-muted">нет resolved targets</span>
                  ) : (
                    preview.targets.map((t) => (
                      <code key={t} className="v4-qa-modal-target">{t}</code>
                    ))
                  )}
                </div>
              </div>

              <div className="v4-qa-modal-section">
                <div className="v4-qa-modal-label">
                  Diff · current lines: {preview.current_line_count}
                </div>
                <pre className="v4-qa-modal-diff">
                  {preview.preview_diff || "(no diff — file would be empty)"}
                </pre>
              </div>
            </>
          ) : null}
        </div>

        <div className="v4-qa-modal-foot">
          <button type="button" className="v4-btn" onClick={onCancel}>Отменить</button>
          <button
            type="button"
            className="v4-btn v4-btn--pri"
            disabled={loading || !!error || (preview?.dedup_hit ?? false) || validationFailed}
            onClick={onConfirm}
            title={
              preview?.dedup_hit
                ? "Нельзя применить duplicate"
                : validationFailed
                  ? "Validation failed — сверьте цифры в lesson с metrics.jsonl"
                  : undefined
            }
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
