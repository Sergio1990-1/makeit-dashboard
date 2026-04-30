import { useEffect, useRef, useState } from "react";
import type { LessonsFileResponse } from "../../../types";
import { fmtAge } from "./utils";

interface Props {
  projectSlug: string | null;
  cache: Record<string, LessonsFileResponse>;
  loadLessons: (slug: string) => Promise<LessonsFileResponse>;
}

const FILE_LABELS: Record<string, string> = {
  "lessons-retro.md": "Retro lessons (autotuner)",
  "lessons-review.md": "Review lessons (per-PR)",
  "lessons-learned.md": "Legacy",
};

const FILE_ORDER = ["lessons-retro.md", "lessons-review.md", "lessons-learned.md"] as const;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LessonsViewer({ projectSlug, cache, loadLessons }: Props) {
  const [activeTab, setActiveTab] = useState<string>("lessons-retro.md");
  const [error, setError] = useState<string | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Derive loading state from cache + error so we never paint the
  // "no files" empty state on the first frame before the fetch starts.
  // The previous Promise.resolve().then(setLoading(true)) microtask
  // guarded the `react-hooks/set-state-in-effect` rule but caused a
  // visible flash where loading=false rendered before flipping to true.
  const cached = projectSlug ? cache[projectSlug] : undefined;
  const loading = projectSlug !== null && cached === undefined && error === null;

  const files = cached?.files ?? [];
  const availableNames = files.map((f) => f.filename);
  const effectiveTab = availableNames.includes(activeTab)
    ? activeTab
    : (availableNames[0] ?? activeTab);

  // ARIA tablist arrow-key navigation per WAI-ARIA APG. Inlined
  // (no useCallback) because availableNames/effectiveTab are derived
  // each render and React Compiler handles memoization where needed.
  const onTabsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (availableNames.length === 0) return;
    const key = e.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    e.preventDefault();
    const idx = availableNames.indexOf(effectiveTab);
    let next: string;
    if (key === "Home") {
      next = availableNames[0];
    } else if (key === "End") {
      next = availableNames[availableNames.length - 1];
    } else if (key === "ArrowRight") {
      next = availableNames[(idx + 1) % availableNames.length];
    } else {
      next = availableNames[(idx - 1 + availableNames.length) % availableNames.length];
    }
    setActiveTab(next);
    // Defer focus to next paint so the new tab's tabIndex=0 is in the DOM.
    requestAnimationFrame(() => {
      tabRefs.current.get(next)?.focus();
    });
  };

  useEffect(() => {
    if (!projectSlug) return;
    if (cache[projectSlug]) return;
    let cancelled = false;
    // Microtask defers setError(null) past the effect body so the
    // react-hooks/set-state-in-effect lint rule (which fires on sync
    // setState during useEffect) is satisfied. Unlike the previous
    // setLoading deferral, this no longer causes a visible flash —
    // `loading` is now derived from cache + error rather than stored.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setError(null);
      loadLessons(projectSlug).catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      });
    });
    return () => { cancelled = true; };
  }, [projectSlug, cache, loadLessons]);

  if (!projectSlug) {
    return (
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">Lessons Viewer</div>
        </div>
        <div className="v4-empty">
          Выберите проект в фильтре «Все проекты», чтобы просмотреть lessons-файлы.
        </div>
      </div>
    );
  }

  const activeFile = files.find((f) => f.filename === effectiveTab);
  const tabPanelId = `v4-qa-lessons-panel-${projectSlug}`;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Lessons · <span className="v4-pl-mono">{projectSlug}</span>
          {loading && <span className="v4-pl-mono v4-qa-text-muted" style={{ marginLeft: 8 }}>загрузка…</span>}
        </div>
      </div>

      {error && <div className="v4-error">{error}</div>}

      <div
        className="v4-qa-lessons-tabs"
        role="tablist"
        aria-label="Lessons файлы"
        onKeyDown={onTabsKeyDown}
      >
        {FILE_ORDER.map((fname) => {
          const present = availableNames.includes(fname);
          const f = files.find((x) => x.filename === fname);
          const selected = effectiveTab === fname;
          return (
            <button
              key={fname}
              ref={(el) => {
                tabRefs.current.set(fname, el);
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tabPanelId}
              tabIndex={selected ? 0 : -1}
              className={`v4-qa-lessons-tab ${selected ? "is-active" : ""}`}
              disabled={!present}
              onClick={() => setActiveTab(fname)}
              title={present ? FILE_LABELS[fname] : "Файл отсутствует"}
            >
              {FILE_LABELS[fname]}
              {present && <span className="v4-pl-mono v4-qa-lessons-count">{f?.line_count ?? 0}</span>}
            </button>
          );
        })}
      </div>

      <div id={tabPanelId} role="tabpanel">
        {activeFile ? (
          <>
            <div className="v4-qa-lessons-meta">
              <span className="v4-pl-mono">{activeFile.filename}</span>
              <span className="v4-pl-mono v4-qa-text-muted">{fmtBytes(activeFile.size_bytes)}</span>
              <span className="v4-pl-mono v4-qa-text-muted">{activeFile.line_count} строк</span>
              <span className="v4-pl-mono v4-qa-text-muted">{fmtAge(activeFile.mtime)}</span>
            </div>
            <pre className="v4-qa-lessons-pre">{activeFile.content || "(пустой файл)"}</pre>
          </>
        ) : loading ? (
          <div className="v4-empty">Загрузка lessons-файлов…</div>
        ) : (
          <div className="v4-empty">В этом проекте пока нет lessons файлов.</div>
        )}
      </div>
    </div>
  );
}
