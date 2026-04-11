/** Read-only viewer for per-project .makeit/lessons-*.md files. */

import { useEffect, useState } from "react";
import type { LessonsFileResponse } from "../types";

interface Props {
  projectSlug: string | null;
  cache: Record<string, LessonsFileResponse>;
  loadLessons: (slug: string) => Promise<LessonsFileResponse>;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtAge(mtime: string | null): string {
  if (!mtime) return "—";
  const t = new Date(mtime).getTime();
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "сегодня";
  if (days === 1) return "1 день назад";
  return `${days} дн. назад`;
}

const FILE_LABELS: Record<string, string> = {
  "lessons-retro.md": "Retro lessons (autotuner)",
  "lessons-review.md": "Review lessons (per-PR)",
  "lessons-learned.md": "Legacy (read-only)",
};

export function QualityLessonsViewer({ projectSlug, cache, loadLessons }: Props) {
  const [activeTab, setActiveTab] = useState<string>("lessons-retro.md");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectSlug) return;
    if (cache[projectSlug]) return;
    let cancelled = false;
    // Defer the sync loading=true set by one microtask so the lint rule
    // (react-hooks/set-state-in-effect) is happy — the rule fires on
    // synchronous setState inside useEffect bodies.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      loadLessons(projectSlug)
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Ошибка загрузки");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [projectSlug, cache, loadLessons]);

  if (!projectSlug) {
    return (
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title">Lessons Viewer</div>
        <div className="qk-empty">Выберите проект в фильтре, чтобы просмотреть lessons files.</div>
      </div>
    );
  }

  const data = cache[projectSlug];
  const files = data?.files ?? [];

  // If active tab has no file, fall back to the first available one.
  const availableFilenames = files.map((f) => f.filename);
  const effectiveTab = availableFilenames.includes(activeTab)
    ? activeTab
    : availableFilenames[0] ?? activeTab;
  const activeFile = files.find((f) => f.filename === effectiveTab);

  return (
    <div className="bento-panel span-12 panel-projects">
      <div className="bento-panel-title">
        Lessons Viewer · {projectSlug}
        {loading && <span className="audit-spinner" style={{ marginLeft: 8 }} />}
      </div>
      {error && <div className="qk-error">{error}</div>}

      <div className="qlv-tabs">
        {(["lessons-retro.md", "lessons-review.md", "lessons-learned.md"] as const).map(
          (fname) => {
            const present = availableFilenames.includes(fname);
            return (
              <button
                key={fname}
                type="button"
                className={`qlv-tab ${effectiveTab === fname ? "qlv-tab-active" : ""}`}
                disabled={!present}
                onClick={() => setActiveTab(fname)}
                title={present ? FILE_LABELS[fname] : "Файл отсутствует"}
              >
                {FILE_LABELS[fname]}
                {present && (
                  <span className="qlv-tab-badge">
                    {files.find((f) => f.filename === fname)?.line_count ?? 0}
                  </span>
                )}
              </button>
            );
          },
        )}
      </div>

      {activeFile ? (
        <>
          <div className="qlv-meta">
            <span>{activeFile.filename}</span>
            <span>{fmtBytes(activeFile.size_bytes)}</span>
            <span>{activeFile.line_count} строк</span>
            <span>{fmtAge(activeFile.mtime)}</span>
          </div>
          <pre className="qlv-content">{activeFile.content || "(пустой файл)"}</pre>
        </>
      ) : (
        <div className="qk-empty">В этом проекте пока нет lessons файлов.</div>
      )}
    </div>
  );
}
