import { useCallback, useMemo, useState } from "react";
import { renderBriefHtml, renderMarkdownHtml } from "../utils/transcript-markdown";
import type { QualityCheck, TranscriptQuality, TranscriptResult } from "../utils/transcript";

interface Props {
  result: TranscriptResult;
  onNewUpload: () => void;
  onEdit: () => void;
}

const QUALITY_LABEL: Record<TranscriptQuality, string> = {
  pass: "✓ Качество ОК",
  warning: "⚠ Есть замечания",
  needs_review: "✗ Требуется проверка",
};

const QUALITY_CLASS: Record<TranscriptQuality, string> = {
  pass: "pass",
  warning: "warning",
  needs_review: "needs-review",
};

const CHECK_ICON: Record<QualityCheck["status"], string> = {
  pass: "✓",
  warning: "⚠",
  fail: "✗",
};

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
  const [qualityOpen, setQualityOpen] = useState(false);
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
          {result.quality && (
            result.quality_report ? (
              <button
                type="button"
                className={`tpc-quality-badge tpc-quality-badge--${QUALITY_CLASS[result.quality]}`}
                aria-expanded={qualityOpen}
                aria-controls="tpc-quality-report"
                onClick={() => setQualityOpen((v) => !v)}
              >
                {QUALITY_LABEL[result.quality]}
              </button>
            ) : (
              <span className={`tpc-quality-badge tpc-quality-badge--${QUALITY_CLASS[result.quality]} tpc-quality-badge--static`}>
                {QUALITY_LABEL[result.quality]}
              </span>
            )
          )}
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

      {/* Quality report (expandable) — always mounted so aria-controls reference is valid */}
      {result.quality && result.quality_report && (
        <div id="tpc-quality-report" className="tpc-quality-report" hidden={!qualityOpen}>
          <div className="tpc-quality-report-header">
            <span className="tpc-quality-report-title">Отчёт о качестве</span>
            <span className="tpc-quality-report-score">
              Score: {result.quality_report.score}
            </span>
          </div>
          <ul className="tpc-quality-report-checks">
            {result.quality_report.checks.map((check) => (
              <li key={check.name} className={`tpc-quality-check tpc-quality-check--${check.status}`}>
                <span className="tpc-quality-check-icon" aria-hidden="true">
                  {CHECK_ICON[check.status]}
                </span>
                <span className="tpc-quality-check-name">{check.name}</span>
                <span className="tpc-quality-check-message">{check.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
