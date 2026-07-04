import { useCallback, useMemo, useState } from "react";
import { renderBriefHtml, renderMarkdownHtml } from "../../../utils/transcript-markdown";
import type { QualityCheck, TranscriptQuality, TranscriptResult } from "../../../utils/transcript";

interface Props {
  result: TranscriptResult;
  onNewUpload: () => void;
  onEdit: () => void;
  /** Continue a normalized_transcript-mode job to full BRIEF generation
   *  (POST /transcript/continue/{job_id}) — only offered while
   *  `result.output_mode === "normalized_transcript"`. Errors propagate to
   *  this component's own handler, which shows them inline; on success
   *  the caller switches the view to polling (see TranscriptsView). */
  onContinueToBrief: () => Promise<void>;
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

const PROFILE_LABEL: Record<TranscriptResult["processing_profile"], string> = {
  standard_brief: "Обычный BRIEF",
  dev_handoff: "Dev handoff",
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

export function TranscriptBriefV4({ result, onNewUpload, onEdit, onContinueToBrief }: Props) {
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [normalizedAccordionOpen, setNormalizedAccordionOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  // primary_artifact decides what the MAIN content area shows — a
  // normalized_transcript-only job never generated brief_content, so
  // showing it here would just be an empty box, not an error (#1299 UX
  // requirement).
  const isNormalizedPrimary = result.primary_artifact === "normalized_transcript";
  const primaryText = isNormalizedPrimary ? result.normalized_transcript : result.brief;
  const primaryLabel = isNormalizedPrimary ? "транскрипт" : "BRIEF";

  const unclearCount = useMemo(() => countMarkers(primaryText, "неразборчиво"), [primaryText]);
  const conflictCount = useMemo(() => countMarkers(primaryText, "противоречие"), [primaryText]);

  const primaryHtml = useMemo(() => renderBriefHtml(primaryText), [primaryText]);
  const transcriptHtml = useMemo(
    () => (result.transcript ? renderMarkdownHtml(result.transcript) : ""),
    [result.transcript]
  );
  // Secondary tab only makes sense when BRIEF is the main content — when
  // normalized_transcript IS the main content, showing it again here
  // would be redundant.
  const normalizedHtml = useMemo(
    () => (!isNormalizedPrimary && result.normalized_transcript ? renderBriefHtml(result.normalized_transcript) : ""),
    [isNormalizedPrimary, result.normalized_transcript]
  );

  const onDownload = useCallback(() => {
    const blob = new Blob([primaryText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${isNormalizedPrimary ? "transcript" : "BRIEF"}-${result.task_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [primaryText, isNormalizedPrimary, result.task_id]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(primaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = primaryText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [primaryText]);

  const handleContinue = useCallback(async () => {
    setContinuing(true);
    setContinueError(null);
    try {
      await onContinueToBrief();
    } catch (err) {
      setContinueError(err instanceof Error ? err.message : String(err));
    } finally {
      setContinuing(false);
    }
  }, [onContinueToBrief]);

  return (
    <div className="v4-panel v4-tpc-brief-panel">
      <div className="v4-panel-h v4-tpc-brief-h">
        <div className="v4-tpc-brief-counters">
          <span className="v4-tag" title="Формат BRIEF, выбранный при загрузке">
            {PROFILE_LABEL[result.processing_profile]}
          </span>
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
          {!isNormalizedPrimary && (
            <button type="button" className="v4-btn" onClick={onEdit}>
              Редактировать
            </button>
          )}
          <button type="button" className="v4-btn" onClick={onCopy}>
            {copied ? "Скопировано!" : `Копировать ${primaryLabel}`}
          </button>
          <button type="button" className="v4-btn" onClick={onDownload}>
            Скачать .md
          </button>
          {result.output_mode === "normalized_transcript" && (
            <button
              type="button"
              className="v4-btn v4-btn--pri"
              disabled={continuing}
              onClick={handleContinue}
            >
              {continuing ? "Генерация…" : "Сгенерировать BRIEF"}
            </button>
          )}
          <button type="button" className="v4-btn v4-btn--pri" onClick={onNewUpload}>
            Новый файл
          </button>
        </div>
      </div>

      {continueError && <div className="v4-error">{continueError}</div>}

      {result.quality && result.quality_report && (
        <div
          id="v4-tpc-quality-report"
          className="v4-tpc-quality-report"
          hidden={!qualityOpen}
        >
          <div className="v4-tpc-quality-report-h">
            <span className="v4-tpc-quality-report-t">Отчёт о качестве</span>
            <span className="v4-pl-mono v4-tpc-quality-report-score">
              Оценка: {result.quality_report.score}
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
                <span className="v4-tpc-quality-check-name">{check.label}</span>
                <span className="v4-tpc-quality-check-msg">{check.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="v4-tpc-brief-content tpc-brief-content"
        dangerouslySetInnerHTML={{ __html: primaryHtml }}
      />

      {normalizedHtml && (
        <div className="v4-tpc-accordion">
          <button
            type="button"
            className="v4-tpc-accordion-toggle"
            aria-expanded={normalizedAccordionOpen}
            onClick={() => setNormalizedAccordionOpen((v) => !v)}
          >
            <span className={`v4-tpc-accordion-arrow ${normalizedAccordionOpen ? "is-open" : ""}`}>▸</span>
            Нормализованный транскрипт
          </button>
          {normalizedAccordionOpen && (
            <div
              className="v4-tpc-accordion-body tpc-brief-content"
              dangerouslySetInnerHTML={{ __html: normalizedHtml }}
            />
          )}
        </div>
      )}

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
