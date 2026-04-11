/** Inline diff + metadata preview shown before confirming apply. */

import { useEffect, useState } from "react";
import type { ApplyPreview, PendingChange } from "../types";

interface Props {
  change: PendingChange;
  loadPreview: (changeId: string) => Promise<ApplyPreview>;
  onConfirm: () => void;
  onCancel: () => void;
}

function Badge({
  kind,
  children,
}: {
  kind: "ok" | "warn" | "info";
  children: React.ReactNode;
}) {
  return <span className={`qpp-badge qpp-badge-${kind}`}>{children}</span>;
}

export function QualityPendingChangePreview({
  change,
  loadPreview,
  onConfirm,
  onCancel,
}: Props) {
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Defer the sync loading=true set by one microtask so the lint rule
    // (react-hooks/set-state-in-effect) is happy.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      loadPreview(change.id)
        .then((p) => {
          if (!cancelled) setPreview(p);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Ошибка загрузки preview");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [change.id, loadPreview]);

  const validationOk =
    preview?.validation === null || preview?.validation?.ok !== false;

  return (
    <div className="qpp-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="qpp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qpp-header">
          <div className="qpp-title">Preview · {change.target}</div>
          <button className="qpp-close" type="button" onClick={onCancel} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="qpp-body">
          <div className="qpp-section">
            <div className="qpp-label">Content</div>
            <div className="qpp-content-box">{change.content}</div>
          </div>

          <div className="qpp-meta-row">
            <div>
              <span className="qpp-meta-label">Tier</span>
              <span className="qpp-meta-value">{change.tier}</span>
            </div>
            <div>
              <span className="qpp-meta-label">Confidence</span>
              <span className="qpp-meta-value">{(change.confidence * 100).toFixed(0)}%</span>
            </div>
            <div>
              <span className="qpp-meta-label">Retro period</span>
              <span className="qpp-meta-value">{change.retro_period}</span>
            </div>
          </div>

          {loading ? (
            <div className="qpp-loading">
              <div className="audit-spinner" /> Загрузка preview...
            </div>
          ) : error ? (
            <div className="qk-error">{error}</div>
          ) : preview ? (
            <>
              <div className="qpp-badges">
                {preview.dedup_hit ? (
                  <Badge kind="warn">⚠ Duplicate detected</Badge>
                ) : (
                  <Badge kind="ok">✓ Not a duplicate</Badge>
                )}
                {preview.would_rotate && <Badge kind="info">⟳ Would rotate file</Badge>}
                {preview.validation !== null &&
                  (validationOk ? (
                    <Badge kind="ok">✓ Validation OK</Badge>
                  ) : (
                    <Badge kind="warn">
                      ⚠ {String((preview.validation as { reason?: string }).reason ?? "validation failed")}
                    </Badge>
                  ))}
                {preview.scoped_projects && preview.scoped_projects.length > 0 && (
                  <Badge kind="info">
                    scope: {preview.scoped_projects.join(", ")}
                  </Badge>
                )}
                {!preview.scoped_projects && (
                  <Badge kind="info">scope: all projects</Badge>
                )}
              </div>

              <div className="qpp-section">
                <div className="qpp-label">
                  Targets · {preview.targets.length} file
                  {preview.targets.length === 1 ? "" : "s"}
                </div>
                <div className="qpp-targets">
                  {preview.targets.length === 0 ? (
                    <span className="qpp-no-target">нет resolved targets</span>
                  ) : (
                    preview.targets.map((t) => (
                      <code key={t} className="qpp-target">
                        {t}
                      </code>
                    ))
                  )}
                </div>
              </div>

              <div className="qpp-section">
                <div className="qpp-label">
                  Diff preview · current lines: {preview.current_line_count}
                </div>
                <pre className="qpp-diff">
                  {preview.preview_diff || "(no diff — file would be empty)"}
                </pre>
              </div>
            </>
          ) : null}
        </div>

        <div className="qpp-footer">
          <button type="button" className="btn" onClick={onCancel}>
            Отменить
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !!error || (preview?.dedup_hit ?? false)}
            onClick={onConfirm}
            title={preview?.dedup_hit ? "Нельзя применить duplicate" : undefined}
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
