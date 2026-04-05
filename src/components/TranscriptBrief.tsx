import { useCallback, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { TranscriptResult } from "../utils/transcript";

interface Props {
  result: TranscriptResult;
  onNewUpload: () => void;
}

/** Count occurrences of a marker pattern like [неразборчиво: ...] */
function countMarkers(text: string, tag: string): number {
  const re = new RegExp(`\\[${tag}:[^\\]]*\\]`, "gi");
  return (text.match(re) || []).length;
}

/** Highlight markers in HTML after markdown rendering */
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

export function TranscriptBrief({ result, onNewUpload }: Props) {
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const unclearCount = useMemo(() => countMarkers(result.brief, "неразборчиво"), [result.brief]);
  const conflictCount = useMemo(() => countMarkers(result.brief, "противоречие"), [result.brief]);

  const briefHtml = useMemo(() => {
    const raw = marked.parse(result.brief, { async: false }) as string;
    return highlightMarkers(DOMPurify.sanitize(raw));
  }, [result.brief]);

  const transcriptHtml = useMemo(() => {
    if (!result.transcript) return "";
    const raw = marked.parse(result.transcript, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [result.transcript]);

  const onDownload = useCallback(() => {
    const blob = new Blob([result.brief], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BRIEF-${result.task_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = result.brief;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result.brief]);

  return (
    <div className="tpc-brief">
      {/* Header with counters */}
      <div className="tpc-brief-header">
        <div className="tpc-brief-counters">
          {unclearCount > 0 && (
            <span className="tpc-counter tpc-counter--unclear">
              {unclearCount} неразборчив{unclearCount === 1 ? "ое" : "ых"} мест{unclearCount === 1 ? "о" : ""}
            </span>
          )}
          {conflictCount > 0 && (
            <span className="tpc-counter tpc-counter--conflict">
              {conflictCount} противореч{conflictCount === 1 ? "ие" : "ий"}
            </span>
          )}
          {unclearCount === 0 && conflictCount === 0 && (
            <span className="tpc-counter tpc-counter--clean">Маркеры не найдены</span>
          )}
        </div>
        <div className="tpc-brief-actions">
          <button className="btn btn-sm" onClick={onCopy}>
            {copied ? "Скопировано!" : "Копировать"}
          </button>
          <button className="btn btn-sm" onClick={onDownload}>
            Скачать .md
          </button>
          <button className="btn btn-sm btn-primary" onClick={onNewUpload}>
            Новый файл
          </button>
        </div>
      </div>

      {/* BRIEF content */}
      <div
        className="tpc-brief-content"
        dangerouslySetInnerHTML={{ __html: briefHtml }}
      />

      {/* Transcript accordion */}
      {result.transcript && (
        <div className="tpc-accordion">
          <button
            className="tpc-accordion-toggle"
            onClick={() => setAccordionOpen(!accordionOpen)}
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`tpc-accordion-icon${accordionOpen ? " tpc-accordion-icon--open" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Очищенный транскрипт
          </button>
          {accordionOpen && (
            <div
              className="tpc-accordion-body"
              dangerouslySetInnerHTML={{ __html: transcriptHtml }}
            />
          )}
        </div>
      )}
    </div>
  );
}
