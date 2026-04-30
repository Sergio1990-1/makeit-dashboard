import { useCallback, useMemo, useState } from "react";
import { renderBriefHtml, renderMarkdownHtml } from "../../../utils/transcript-markdown";
import type { QualityCheck, TranscriptQuality, TranscriptResult } from "../../../utils/transcript";

interface Props {
  result: TranscriptResult;
  onNewUpload: () => void;
  onEdit: () => void;
}

const QUALITY_LABEL: Record<TranscriptQuality, string> = {
  pass: "✓ Качество ОК",
  warning: "⚠ Замечания",
  needs_review: "✗ Требуется проверка",
};

const QUALITY_CLASS: Record<TranscriptQuality, string> = {
  pass: "v4-tpc-quality--pass",
  warning: "v4-tpc-quality--warn",
  needs_review: "v4-tpc-quality--review",
};

const CHECK_ICON: Record<QualityCheck["status"], string> = {
  pass: "✓",
  warning: "⚠",
  fail: "✗",
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function countMarkers(text: string, tag: string): number {
  const re = new RegExp(`\\[${tag}:[^\\]]*\\]`, "gi");
  return (text.match(re) || []).length;
}

export function TranscriptBriefV4({ result, onNewUpload, onEdit }: Props) {
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const unclearCount = useMemo(() => countMarkers(result.brief, "неразборчиво"), [result.brief]);
  const conflictCount = useMemo(() => countMarkers(result.brief, "противоречие"), [result.brief]);

  const briefHtml = useMemo(() => renderBriefHtml(result.brief), [result.brief]);
  const transcriptHtml = useMemo(
    () => (result.transcript ? renderMarkdownHtml(result.transcript) : ""),
    [result.transcript]
  );

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
    <div className="v4-panel v4-tpc-brief-panel">
      <div className="v4-panel-h v4-tpc-brief-h">
        <div className="v4-tpc-brief-counters">
          {result.quality && (
            result.quality_report ? (
              <button
                type="button"
                className={`v4-tpc-quality-chip ${QUALITY_CLASS[result.quality]}`}
                aria-expanded={qualityOpen}
                aria-controls="v4-tpc-quality-report"
                onClick={() => setQualityOpen((v) => !v)}
              >
                {QUALITY_LABEL[result.quality]}
              </button>
            ) : (
              <span className={`v4-tpc-quality-chip ${QUALITY_CLASS[result.quality]} v4-tpc-quality-chip--static`}>
                {QUALITY_LABEL[result.quality]}
              </span>
            )
          )}
          {unclearCount > 0 && (
            <span className="v4-tpc-counter v4-tpc-counter--warn">
              {unclearCount} {plural(unclearCount, "неразборчивое место", "неразборчивых места", "неразборчивых мест")}
            </span>
          )}
          {conflictCount > 0 && (
            <span className="v4-tpc-counter v4-tpc-counter--danger">
              {conflictCount} {plural(conflictCount, "противоречие", "противоречия", "противоречий")}
            </span>
          )}
          {unclearCount === 0 && conflictCount === 0 && (
            <span className="v4-tpc-counter v4-tpc-counter--ok">Маркеры не найдены</span>
          )}
        </div>
        <div className="v4-tpc-brief-actions">
          <button type="button" className="v4-btn" onClick={onEdit}>
            Редактировать
          </button>
          <button type="button" className="v4-btn" onClick={onCopy}>
            {copied ? "Скопировано!" : "Копировать"}
          </button>
          <button type="button" className="v4-btn" onClick={onDownload}>
            Скачать .md
          </button>
          <button type="button" className="v4-btn v4-btn--pri" onClick={onNewUpload}>
            Новый файл
          </button>
        </div>
      </div>

      {result.quality && result.quality_report && (
        <div
          id="v4-tpc-quality-report"
          className="v4-tpc-quality-report"
          hidden={!qualityOpen}
        >
          <div className="v4-tpc-quality-report-h">
            <span className="v4-tpc-quality-report-t">Отчёт о качестве</span>
            <span className="v4-pl-mono v4-tpc-quality-report-score">
              Score: {result.quality_report.score}
            </span>
          </div>
          <ul className="v4-tpc-quality-checks">
            {result.quality_report.checks.map((check) => (
              <li
                key={check.name}
                className={`v4-tpc-quality-check v4-tpc-quality-check--${check.status}`}
              >
                <span className="v4-tpc-quality-check-icon" aria-hidden="true">
                  {CHECK_ICON[check.status]}
                </span>
                <span className="v4-tpc-quality-check-name">{check.name}</span>
                <span className="v4-tpc-quality-check-msg">{check.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="v4-tpc-brief-content tpc-brief-content"
        dangerouslySetInnerHTML={{ __html: briefHtml }}
      />

      {result.transcript && (
        <div className="v4-tpc-accordion">
          <button
            type="button"
            className="v4-tpc-accordion-toggle"
            aria-expanded={accordionOpen}
            onClick={() => setAccordionOpen((v) => !v)}
          >
            <span className={`v4-tpc-accordion-arrow ${accordionOpen ? "is-open" : ""}`}>▸</span>
            Очищенный транскрипт
          </button>
          {accordionOpen && (
            <div
              className="v4-tpc-accordion-body tpc-brief-content"
              dangerouslySetInnerHTML={{ __html: transcriptHtml }}
            />
          )}
        </div>
      )}
    </div>
  );
}
