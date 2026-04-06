import { useCallback, useMemo, useState } from "react";
import { renderBriefHtml, renderMarkdownHtml } from "../utils/transcript-markdown";
import type { TranscriptResult } from "../utils/transcript";

interface Props {
  result: TranscriptResult;
  onNewUpload: () => void;
  onEdit: () => void;
}

/** Russian plural forms: 1, 2-4, 5+ */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Count occurrences of a marker pattern like [неразборчиво: ...] */
function countMarkers(text: string, tag: string): number {
  const re = new RegExp(`\\[${tag}:[^\\]]*\\]`, "gi");
  return (text.match(re) || []).length;
}

export function TranscriptBrief({ result, onNewUpload, onEdit }: Props) {
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const unclearCount = useMemo(() => countMarkers(result.brief, "неразборчиво"), [result.brief]);
  const conflictCount = useMemo(() => countMarkers(result.brief, "противоречие"), [result.brief]);

  const briefHtml = useMemo(() => renderBriefHtml(result.brief), [result.brief]);

  const transcriptHtml = useMemo(() => {
    if (!result.transcript) return "";
    return renderMarkdownHtml(result.transcript);
  }, [result.transcript]);

  const onDownload = useCallback(() => {
    const blob = new Blob([result.brief], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BRIEF-${result.task_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result.brief, result.task_id]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
              {unclearCount} {plural(unclearCount, "неразборчивое место", "неразборчивых места", "неразборчивых мест")}
            </span>
          )}
          {conflictCount > 0 && (
            <span className="tpc-counter tpc-counter--conflict">
              {conflictCount} {plural(conflictCount, "противоречие", "противоречия", "противоречий")}
            </span>
          )}
          {unclearCount === 0 && conflictCount === 0 && (
            <span className="tpc-counter tpc-counter--clean">Маркеры не найдены</span>
          )}
        </div>
        <div className="tpc-brief-actions">
          <button className="btn btn-sm" onClick={onEdit}>
            Редактировать
          </button>
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
            aria-expanded={accordionOpen}
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
