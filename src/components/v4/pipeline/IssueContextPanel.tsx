// Modal panel showing the full IssueContext for one pipeline task —
// status, retry budget, phase history, artifacts. Triggered from the
// active-tasks list by clicking a row. epic-027 / issue #111.

import { useEffect, useState } from "react";
import {
  fetchIssueContext,
  type IssueContext,
  type IssueContextPhaseEntry,
} from "../../../utils/pipeline";
import { safeHttpUrl } from "../../../utils/url";
import { formatDuration } from "./utils";

interface Props {
  open: boolean;
  /** "owner/name" — passed straight to the pipeline API path. */
  repo: string | null;
  issueNumber: number | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "В очереди",
  in_dev: "В разработке",
  reviewing: "Ревью",
  resolving: "Резолюшн",
  qa_verifying: "QA",
  polishing: "Полировка",
  ready_to_merge: "К мержу",
  ci_verifying: "CI",
  merged: "Замержен",
  needs_human: "Нужен человек",
  failed: "Провален",
};

const PHASE_STATUS_LABEL: Record<string, string> = {
  running: "идёт",
  success: "успех",
  partial: "частично",
  failure: "ошибка",
  terminal_failure: "критично",
};

function formatTimestamp(iso: string): string {
  // Tolerate malformed timestamps — show raw rather than crash.
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PhaseRow({ entry }: { entry: IssueContextPhaseEntry }) {
  const statusLabel = PHASE_STATUS_LABEL[entry.status] ?? entry.status;
  // Treat any non-success phase status as "bad" for the indicator dot. Keeps
  // the UI useful even when the pipeline adds a new status value we haven't
  // labelled yet.
  const isOk = entry.status === "success";
  const dotClass = isOk
    ? "v4-pl-ctx-phase-ok"
    : entry.status === "running"
      ? "v4-pl-ctx-phase-run"
      : "v4-pl-ctx-phase-bad";
  return (
    <li className="v4-pl-ctx-phase">
      <div className="v4-pl-ctx-phase-head">
        <span className={`v4-pl-ctx-phase-dot ${dotClass}`} />
        <span className="v4-pl-ctx-phase-name">{entry.phase}</span>
        <span className="v4-pl-ctx-phase-status">{statusLabel}</span>
        {entry.event && (
          <span className="v4-pl-ctx-phase-event v4-pl-mono">{entry.event}</span>
        )}
        <span className="v4-pl-ctx-phase-meta v4-pl-mono">
          {formatTimestamp(entry.started_at)}
          {entry.duration_seconds > 0 && (
            <> · {formatDuration(Math.round(entry.duration_seconds))}</>
          )}
          {entry.cost_usd > 0 && <> · ${entry.cost_usd.toFixed(2)}</>}
        </span>
      </div>
      {entry.error && (
        <div className="v4-pl-ctx-phase-err">{entry.error}</div>
      )}
    </li>
  );
}

function stringifySafe(value: unknown): string {
  // Pydantic JSON is acyclic so JSON.stringify never realistically throws on
  // pipeline payloads, but defending against a circular ref keeps the modal
  // from crashing on unexpected upstream changes.
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function ArtifactRow({ k, value }: { k: string; value: unknown }) {
  // Prefer rendering URLs as anchors so users can click through. The pipeline
  // store is local and trusted today, but the type allows any string — go
  // through safeHttpUrl so a future http(s)-impostor scheme can't slip in.
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? "—"
        : stringifySafe(value);
  const safeUrl = typeof value === "string" ? safeHttpUrl(value) : null;
  return (
    <div className="v4-pl-ctx-art-row">
      <span className="v4-pl-ctx-art-key v4-pl-mono">{k}</span>
      {safeUrl ? (
        <a
          className="v4-pl-ctx-art-val"
          href={safeUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          {text}
        </a>
      ) : (
        <span className="v4-pl-ctx-art-val v4-pl-mono">{text}</span>
      )}
    </div>
  );
}

export function IssueContextPanel({ open, repo, issueNumber, onClose }: Props) {
  // Single state machine — 'idle' before/while loading, then 'success' or
  // 'error'. Avoids the React 19 set-state-in-effect lint complaint about
  // multiple direct setX calls in the effect body, and means stale data
  // can't render: caller adds `key={issueNumber}` so this state resets on
  // every issue switch.
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "success"; data: IssueContext }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  // Fetch context whenever the modal is open for a valid (repo, issueNumber).
  // Caller's `key` ensures we mount fresh on each open, so this effect runs
  // exactly once per modal lifetime in practice; the abort still guards
  // against unmount-during-flight.
  useEffect(() => {
    if (!open || repo == null || issueNumber == null) return;
    const controller = new AbortController();
    fetchIssueContext(repo, issueNumber, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ kind: "success", data });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Ошибка",
        });
      });
    return () => controller.abort();
  }, [open, repo, issueNumber]);

  // Close on Escape — same UX contract as ClassifyDialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || repo == null || issueNumber == null) return null;

  const ctx = state.kind === "success" ? state.data : null;
  const statusLabel = ctx ? (STATUS_LABEL[ctx.status] ?? ctx.status) : "";

  return (
    <div
      className="v4-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="v4-modal v4-pl-ctx-modal" role="dialog" aria-modal="true">
        <div className="v4-modal-h">
          <h3 className="v4-modal-t">
            Issue Context — <span className="v4-pl-mono">#{issueNumber}</span>
            {ctx && (
              <span className="v4-pl-ctx-status">{statusLabel}</span>
            )}
          </h3>
          <button
            type="button"
            className="v4-modal-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="v4-modal-body v4-pl-ctx-body">
          {state.kind === "loading" && (
            <div className="v4-empty">Загрузка контекста…</div>
          )}
          {state.kind === "error" && (
            <div className="v4-pl-ctx-err">
              <b>Не удалось загрузить:</b> {state.message}
            </div>
          )}
          {ctx && (
            <>
              <section className="v4-pl-ctx-section">
                <div className="v4-pl-ctx-grid">
                  <div>
                    <span className="v4-pl-ctx-lbl">Repo</span>
                    <span className="v4-pl-mono">{ctx.repo}</span>
                  </div>
                  <div>
                    <span className="v4-pl-ctx-lbl">Попытки</span>
                    <span className="v4-pl-mono">
                      {ctx.retry_budget.attempts} / {ctx.retry_budget.max_attempts}
                      {ctx.retry_budget.exhausted && (
                        <> · исчерпаны</>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="v4-pl-ctx-lbl">Бюджет</span>
                    <span className="v4-pl-mono">
                      ${ctx.retry_budget.cost_usd.toFixed(2)} / $
                      {ctx.retry_budget.max_cost_usd.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="v4-pl-ctx-lbl">Обновлён</span>
                    <span className="v4-pl-mono">
                      {formatTimestamp(ctx.updated_at)}
                    </span>
                  </div>
                  {ctx.pr_url && (() => {
                    const safe = safeHttpUrl(ctx.pr_url);
                    // When the URL fails the http(s) scheme check, hide it
                    // entirely instead of rendering raw garbage — keeps the
                    // grid clean and signals "no actionable PR link" rather
                    // than dumping a `javascript:`-style string into the UI.
                    if (!safe) return null;
                    return (
                      <div>
                        <span className="v4-pl-ctx-lbl">PR</span>
                        <a
                          className="v4-pl-ctx-val"
                          href={safe}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {safe}
                        </a>
                      </div>
                    );
                  })()}
                  {ctx.branch && (
                    <div>
                      <span className="v4-pl-ctx-lbl">Ветка</span>
                      <span className="v4-pl-mono">{ctx.branch}</span>
                    </div>
                  )}
                </div>
              </section>

              <section className="v4-pl-ctx-section">
                <h4 className="v4-pl-ctx-h">
                  История фаз ({ctx.phase_history.length})
                </h4>
                {ctx.phase_history.length === 0 ? (
                  <div className="v4-empty">Нет записей</div>
                ) : (
                  <ol className="v4-pl-ctx-phases">
                    {ctx.phase_history.map((entry, i) => (
                      <PhaseRow key={i} entry={entry} />
                    ))}
                  </ol>
                )}
              </section>

              {Object.keys(ctx.artifacts).length > 0 && (
                <section className="v4-pl-ctx-section">
                  <h4 className="v4-pl-ctx-h">Артефакты</h4>
                  <div className="v4-pl-ctx-artifacts">
                    {Object.entries(ctx.artifacts).map(([k, v]) => (
                      <ArtifactRow key={k} k={k} value={v} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
