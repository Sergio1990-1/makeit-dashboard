import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { saveTranscriptBrief } from "../utils/transcript";
import { renderBriefHtml } from "../utils/transcript-markdown";

interface Props {
  taskId: string;
  initialBrief: string;
  onSave: (updatedBrief: string) => void;
  onCancel: () => void;
}

const draftKey = (taskId: string) => `tpc:draft:${taskId}`;

export function TranscriptEditor({ taskId, initialBrief, onSave, onCancel }: Props) {
  // Restore an autosaved draft if it differs from the server-side brief.
  // The user is asked once on mount whether to use it.
  const [text, setText] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(draftKey(taskId));
      if (stored && stored !== initialBrief) {
        if (window.confirm("Найден несохранённый черновик. Восстановить?")) {
          return stored;
        }
        localStorage.removeItem(draftKey(taskId));
      }
    } catch { /* localStorage unavailable */ }
    return initialBrief;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"split" | "edit" | "preview">("split");

  // Defer markdown re-render so fast typing doesn't block the textarea.
  // marked + DOMPurify on a 1k-line BRIEF is heavy; useDeferredValue lets
  // React keep the input snappy and re-render preview at lower priority.
  const deferredText = useDeferredValue(text);
  const previewHtml = useMemo(() => renderBriefHtml(deferredText), [deferredText]);

  const hasChanges = text !== initialBrief;
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  // Autosave draft to localStorage with a 1s debounce. Cleared on
  // successful save or explicit cancel without changes.
  useEffect(() => {
    if (!hasChanges) {
      try { localStorage.removeItem(draftKey(taskId)); } catch { /* ignore */ }
      return;
    }
    const handle = setTimeout(() => {
      try { localStorage.setItem(draftKey(taskId), text); } catch { /* ignore quota */ }
    }, 1000);
    return () => clearTimeout(handle);
  }, [text, hasChanges, taskId]);

  // Warn before page unload if the user has unsaved edits.
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
      try { localStorage.removeItem(draftKey(taskId)); } catch { /* ignore */ }
      onSave(text);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [taskId, text, onSave]);

  return (
    <div className="tpc-editor">
      {/* Toolbar */}
      <div className="tpc-editor-toolbar">
        <div className="tpc-editor-modes">
          <button
            className={`btn btn-sm${previewMode === "edit" ? " btn-primary" : ""}`}
            onClick={() => setPreviewMode("edit")}
          >
            Редактор
          </button>
          <button
            className={`btn btn-sm${previewMode === "split" ? " btn-primary" : ""}`}
            onClick={() => setPreviewMode("split")}
          >
            Разделённый
          </button>
          <button
            className={`btn btn-sm${previewMode === "preview" ? " btn-primary" : ""}`}
            onClick={() => setPreviewMode("preview")}
          >
            Просмотр
          </button>
        </div>
        <div className="tpc-editor-actions">
          <button className="btn btn-sm" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className={`tpc-editor-panes tpc-editor-panes--${previewMode}`}>
        {previewMode !== "preview" && (
          <textarea
            className="tpc-editor-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
        )}
        {previewMode !== "edit" && (
          <div
            className="tpc-editor-preview tpc-brief-content"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="tpc-result tpc-result--err">{error}</div>
      )}
    </div>
  );
}
