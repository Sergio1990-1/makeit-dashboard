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
  const modalRef = useRef<HTMLDivElement | null>(null);

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

  // Initial focus on mount only — separate from the keydown effect so an
  // unstable `onCancel` reference (the parent passes an inline arrow) can't
  // cause the close button to repeatedly steal focus on every parent
  // re-render (e.g. when actionLoading flips during an approve action).
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Focus trap: Escape closes; Tab/Shift+Tab wrap focus inside the modal
  // so keyboard users can't fall back into the obscured page content. The
  // aria-modal="true" attribute promises this to assistive tech, so it
  // must actually be enforced.
  useEffect(() => {
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !modalRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const validationOk = preview?.validation === null || preview?.validation?.ok !== false;
  const validationFailed = preview?.validation != null && validationOk === false;

  return (
    <div className="v4-qa-modal-backdrop" onClick={onCancel}>
      <div
        ref={modalRef}
        className="v4-qa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="v4-qa-modal-h">
          <div id={TITLE_ID} className="v4-qa-modal-t">Просмотр · {change.target}</div>
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
            <div className="v4-qa-modal-label">Содержимое</div>
            <div className="v4-qa-modal-content">{change.content}</div>
          </div>

          <div className="v4-qa-modal-meta">
            <div><span className="v4-qa-modal-meta-l">Уровень</span><span>{change.tier}</span></div>
            <div><span className="v4-qa-modal-meta-l">Уверенность</span><span>{(change.confidence * 100).toFixed(0)}%</span></div>
            <div><span className="v4-qa-modal-meta-l">Ретроспектива</span><span>{change.retro_period}</span></div>
          </div>

          {loading ? (
            <div className="v4-empty">Загрузка предпросмотра…</div>
          ) : error ? (
            <div className="v4-error">{error}</div>
          ) : preview ? (
            <>
              <div className="v4-qa-modal-badges">
                {preview.dedup_hit ? (
                  <span className="v4-tag v4-tag--warn">⚠ Дубликат</span>
                ) : (
                  <span className="v4-tag v4-tag--ok">✓ Не дубликат</span>
                )}
                {preview.would_rotate && <span className="v4-tag">⟳ Файл будет ротирован</span>}
                {preview.validation !== null && (
                  validationOk ? (
                    <span className="v4-tag v4-tag--ok">✓ Проверка пройдена</span>
                  ) : (
                    <span className="v4-tag v4-tag--danger">
                      ⚠ {String((preview.validation as { reason?: string }).reason ?? "проверка не пройдена")}
                    </span>
                  )
                )}
                {preview.scoped_projects && preview.scoped_projects.length > 0 ? (
                  <span className="v4-tag">проекты: {preview.scoped_projects.join(", ")}</span>
                ) : (
                  <span className="v4-tag">все проекты</span>
                )}
              </div>

              <div className="v4-qa-modal-section">
                <div className="v4-qa-modal-label">
                  Целевые файлы · {preview.targets.length} {preview.targets.length === 1 ? "файл" : "файлов"}
                </div>
                <div className="v4-qa-modal-targets">
                  {preview.targets.length === 0 ? (
                    <span className="v4-qa-text-muted">не найдены</span>
                  ) : (
                    preview.targets.map((t) => (
                      <code key={t} className="v4-qa-modal-target">{t}</code>
                    ))
                  )}
                </div>
              </div>

              <div className="v4-qa-modal-section">
                <div className="v4-qa-modal-label">
                  Diff · текущих строк: {preview.current_line_count}
                </div>
                <pre className="v4-qa-modal-diff">
                  {preview.preview_diff || "(diff пустой — файл будет создан)"}
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
                ? "Нельзя применить дубликат"
                : validationFailed
                  ? "Проверка не пройдена — сверьте цифры в уроке с metrics.jsonl"
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
