import { useCallback, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { saveTranscriptBrief } from "../utils/transcript";

const SANITIZE_OPTS = { ADD_TAGS: ["mark" as const], ADD_ATTR: ["class"] };

/** Highlight markers in raw HTML */
function highlightMarkers(html: string): string {
  return html
    .replace(
      /\[неразборчиво:[^\]]*\]/gi,
      (m) => `<mark class="tpc-marker tpc-marker--unclear">${m}</mark>`,
    )
    .replace(
      /\[противоречие:[^\]]*\]/gi,
      (m) => `<mark class="tpc-marker tpc-marker--conflict">${m}</mark>`,
    );
}

interface Props {
  taskId: string;
  initialBrief: string;
  onSave: (updatedBrief: string) => void;
  onCancel: () => void;
}

export function TranscriptEditor({ taskId, initialBrief, onSave, onCancel }: Props) {
  const [text, setText] = useState(initialBrief);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"split" | "edit" | "preview">("split");

  const previewHtml = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(highlightMarkers(raw), SANITIZE_OPTS);
  }, [text]);

  const hasChanges = text !== initialBrief;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveTranscriptBrief(taskId, text);
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
