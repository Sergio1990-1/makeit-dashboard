import { useMemo, useState } from "react";
import type { PipelineResult } from "../../../utils/pipeline";
import {
  ComplexityBadge,
  OutcomeBadge,
  CategoryBadge,
  RiskBadge,
  VerdictBadge,
} from "./badges";
import { compactUSD, formatDuration } from "./utils";

interface Props {
  results: PipelineResult[];
  /** When set, results before this timestamp are grouped as "previous", at or after as "current" */
  currentRunStartedAt: number | null;
  /** Click on issue # opens timeline modal */
  onTimelineClick: (issueNumber: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "В очереди",
  in_progress: "В работе",
  pr_open: "PR открыт",
  in_review: "На ревью",
  retry: "Повтор",
  done: "Готово",
  needs_human: "Нужен человек",
  rolled_back: "Откат",
};

type StatusFilter = "all" | "done" | "needs_human" | "failed";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "Все",
  done: "Done",
  needs_human: "Needs human",
  failed: "Failed",
};

function matchesFilter(r: PipelineResult, f: StatusFilter): boolean {
  if (f === "all") return true;
  if (f === "done") return r.status === "done";
  if (f === "needs_human") return r.status === "needs_human";
  if (f === "failed") return r.status !== "done" && r.status !== "needs_human" && r.status !== "queued" && r.status !== "in_progress";
  return true;
}

function ResultRow({
  r,
  onTimelineClick,
}: {
  r: PipelineResult;
  onTimelineClick: (n: number) => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const isDone = r.status === "done";
  const isNeedsHuman = r.status === "needs_human";
  const rowCls = isDone
    ? "v4-pl-result--ok"
    : isNeedsHuman
    ? "v4-pl-result--warn"
    : "v4-pl-result--err";

  const hasWhy = !!(r.human_summary || r.error || r.escalation_reason);
  const isFail = r.status !== "done" && r.status !== "queued" && r.status !== "in_progress";
  const showWhyToggle = isFail && hasWhy;

  // Attempts warning
  const attemptsLow = r.attempt_number != null && r.max_attempts != null
    && r.attempt_number >= r.max_attempts - 1;
  const budgetLow = r.budget_remaining_usd != null && r.budget_remaining_usd < 0.30;
  const attemptsWarn = attemptsLow || budgetLow;

  return (
    <div className={`v4-pl-result-row ${rowCls}`}>
      <div className="v4-pl-result-main">
        <button
          type="button"
          className="v4-pl-result-num"
          onClick={() => onTimelineClick(r.issue_number)}
          title="Показать таймлайн"
        >
          #{r.issue_number}
        </button>
        <span
          className={`v4-pl-badge ${
            isDone ? "v4-pl-status--done" : isNeedsHuman ? "v4-pl-status--needs" : "v4-pl-status--inprog"
          }`}
        >
          {STATUS_LABEL[r.status] ?? r.status}
        </span>
        <ComplexityBadge complexity={r.complexity} model={r.model_used} />
        {r.cost_usd != null && r.cost_usd > 0 && (
          <span className="v4-pl-mono v4-pl-result-cost">{compactUSD(r.cost_usd)}</span>
        )}
        {r.attempt_number != null && r.max_attempts != null && (
          <span
            className={`v4-pl-mono ${attemptsWarn ? "v4-pl-text-warn" : "v4-pl-text-muted"}`}
            title={[
              r.budget_remaining_usd != null
                ? `Остаток бюджета: ${compactUSD(r.budget_remaining_usd)}`
                : null,
              attemptsLow ? `Попытка ${r.attempt_number} из ${r.max_attempts}` : null,
            ]
              .filter(Boolean)
              .join(" | ") || undefined}
          >
            {r.attempt_number}/{r.max_attempts}
            {attemptsWarn && " ⚠"}
          </span>
        )}
        <RiskBadge riskLevel={r.risk_level} executionPolicy={r.execution_policy} />
        {r.outcome && <OutcomeBadge outcome={r.outcome} />}
        {r.escalation_reason && <CategoryBadge category={r.escalation_reason.category} />}
        {r.review_verdict && <VerdictBadge verdict={r.review_verdict} />}
        {r.total_duration_seconds != null && r.total_duration_seconds > 0 && (
          <span className="v4-pl-mono v4-pl-text-muted v4-pl-result-duration">
            {formatDuration(r.total_duration_seconds)}
          </span>
        )}
        {r.qa_passed === false && r.qa_findings_count != null && r.qa_findings_count > 0 && (
          <span className="v4-pl-text-warn" title={`QA нашёл ${r.qa_findings_count} проблем`}>
            QA: {r.qa_findings_count}
          </span>
        )}

        <div className="v4-pl-result-spacer" />

        {r.retries > 0 && <span className="v4-pl-text-warn">{r.retries} retry</span>}
        {r.pr_url && (
          <a
            href={r.pr_url}
            target="_blank"
            rel="noreferrer"
            className="v4-pl-result-pr"
            title="Открыть PR в GitHub"
          >
            PR ↗
          </a>
        )}
        {showWhyToggle && (
          <button
            type="button"
            className="v4-linkbtn v4-pl-why-btn"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
          >
            {whyOpen ? "Скрыть" : "Why?"}
          </button>
        )}
      </div>
      {(whyOpen || (isFail && r.human_summary && !showWhyToggle)) && (
        <div className="v4-pl-why">
          {r.human_summary && <div className="v4-pl-why-summary">{r.human_summary}</div>}
          {r.error && (
            <div className="v4-pl-why-error">
              <span className="v4-pl-why-key">Error:</span> {r.error}
            </div>
          )}
          {r.escalation_reason && (
            <div className="v4-pl-why-meta">
              {r.escalation_reason.phase} · {r.escalation_reason.event}
              {r.escalation_reason.error && ` · ${r.escalation_reason.error}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PipelineResults({
  results,
  currentRunStartedAt,
  onTimelineClick,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c = { all: results.length, done: 0, needs_human: 0, failed: 0 };
    for (const r of results) {
      if (r.status === "done") c.done++;
      else if (r.status === "needs_human") c.needs_human++;
      else if (r.status !== "queued" && r.status !== "in_progress") c.failed++;
    }
    return c;
  }, [results]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (q) {
        const hay = `${r.issue_number} ${r.pr_url ?? ""} ${r.error ?? ""} ${r.human_summary ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [results, filter, query]);

  // The pipeline API does not currently expose per-result timestamps, so we
  // can't reliably partition "current run" vs "previous". We show a "current
  // run" separator only when `currentRunStartedAt` is set AND there are any
  // filtered results — purely a visual cue that what follows belongs to the
  // active run. When idle, results are shown without the separator.
  const showRunSeparator = currentRunStartedAt !== null && filtered.length > 0;

  if (results.length === 0) {
    return (
      <div className="v4-panel" style={{ marginBottom: 14 }}>
        <div className="v4-panel-h">
          <div className="v4-panel-t">Результаты</div>
        </div>
        <div className="v4-empty">Нет результатов в текущей сессии</div>
      </div>
    );
  }

  return (
    <div className="v4-panel" style={{ marginBottom: 14 }}>
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Результаты <span className="v4-tag">{results.length} задач</span>
        </div>
        <div className="v4-panel-actions v4-pl-results-tools">
          <div className="v4-pillgrp">
            {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((k) => (
              <button
                key={k}
                type="button"
                className={filter === k ? "is-active" : ""}
                onClick={() => setFilter(k)}
              >
                {FILTER_LABELS[k]} {counts[k] > 0 && <>· {counts[k]}</>}
              </button>
            ))}
          </div>
          <div className="v4-search v4-pl-results-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск #, PR, ошибки…"
              aria-label="Поиск результатов"
            />
          </div>
        </div>
      </div>

      <div className="v4-pl-results">
        {filtered.length === 0 ? (
          <div className="v4-empty">Нет результатов под фильтр</div>
        ) : (
          <>
            {showRunSeparator && (
              <div className="v4-pl-run-sep">
                <span className="v4-pl-run-sep-line" />
                <span className="v4-pl-run-sep-label">
                  Текущий запуск · {filtered.length} задач
                </span>
                <span className="v4-pl-run-sep-line" />
              </div>
            )}
            {filtered.map((r) => (
              <ResultRow key={r.issue_number} r={r} onTimelineClick={onTimelineClick} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
