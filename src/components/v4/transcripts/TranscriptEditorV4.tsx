import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { saveTranscriptBrief } from "../../../utils/transcript";
import { renderBriefHtml } from "../../../utils/transcript-markdown";

interface Props {
  taskId: string;
  initialBrief: string;
  onSave: (updatedBrief: string) => void;
  onCancel: () => void;
}

const draftKey = (taskId: string) => `tpc:draft:${taskId}`;

type ViewMode = "split" | "edit" | "preview";

export function TranscriptEditorV4({ taskId, initialBrief, onSave, onCancel }: Props) {
  const [text, setText] = useState<string>(initialBrief);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  // Draft restore: confirm and apply in an effect (NOT in useState initialiser).
  // React Strict Mode double-invokes initialisers in dev — calling
  // window.confirm there fires the dialog twice and violates React's purity
  // rules for state initialisers. Effects run once per mount even in Strict
  // Mode (the cleanup-then-rerun pattern doesn't apply here because of the
  // restoredRef guard).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const stored = localStorage.getItem(draftKey(taskId));
      if (stored && stored !== initialBrief) {
        if (window.confirm("Найден несохранённый черновик. Восстановить?")) {
          setText(stored);
        } else {
          localStorage.removeItem(draftKey(taskId));
        }
      }
    } catch {
      /* localStorage unavailable */
    }
    // Only run once per mount for a given taskId — initialBrief is stable
    // for the lifetime of this editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const deferredText = useDeferredValue(text);
  const previewHtml = useMemo(() => renderBriefHtml(deferredText), [deferredText]);

  const hasChanges = text !== initialBrief;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  // Autosave draft
  useEffect(() => {
    if (!hasChanges) {
      try {
        localStorage.removeItem(draftKey(taskId));
      } catch {
        /* ignore */
      }
      return;
    }
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(taskId), text);
      } catch {
        /* ignore quota */
      }
    }, 1000);
    return () => clearTimeout(handle);
  }, [text, hasChanges, taskId]);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasChangesRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveTranscriptBrief(taskId, text);
      try {
        localStorage.removeItem(draftKey(taskId));
      } catch {
        /* ignore */
      }
      onSave(text);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [taskId, text, onSave]);

  // Cmd/Ctrl-S to save (when dirty + not saving)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (hasChangesRef.current && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, saving]);

  return (
    <div className="v4-panel v4-tpc-editor-panel">
      <div className="v4-panel-h v4-tpc-editor-h">
        <div className="v4-pillgrp">
          <button
            type="button"
            className={viewMode === "edit" ? "is-active" : ""}
            onClick={() => setViewMode("edit")}
          >
            Редактор
          </button>
          <button
            type="button"
            className={viewMode === "split" ? "is-active" : ""}
            onClick={() => setViewMode("split")}
          >
            Разделённый
          </button>
          <button
            type="button"
            className={viewMode === "preview" ? "is-active" : ""}
            onClick={() => setViewMode("preview")}
          >
            Просмотр
          </button>
        </div>
        <div className="v4-tpc-editor-actions">
          {hasChanges && (
            <span className="v4-pl-mono v4-tpc-text-muted v4-tpc-editor-dirty">
              ● несохранённые
            </span>
          )}
          <button type="button" className="v4-btn" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="v4-btn v4-btn--pri"
            disabled={!hasChanges || saving}
            onClick={handleSave}
            title="Cmd+S / Ctrl+S"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>

      <div className={`v4-tpc-editor-panes v4-tpc-editor-panes--${viewMode}`}>
        {viewMode !== "preview" && (
          <textarea
            className="v4-tpc-editor-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label="Markdown редактор"
          />
        )}
        {viewMode !== "edit" && (
          <div
            className="v4-tpc-editor-preview tpc-brief-content"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      {error && (
        <div className="v4-error" style={{ margin: "0 18px 14px" }}>
          {error}
        </div>
      )}
    </div>
  );
}
