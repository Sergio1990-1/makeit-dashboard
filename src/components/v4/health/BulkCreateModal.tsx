import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HealthFinding, HealthReport, HealthSeverity } from "../../../types/health";
import { GITHUB_OWNER, GITHUB_PROJECT_NUMBER, getToken } from "../../../utils/config";
import {
  addIssueToProject,
  createIssue,
  findOpenIssueByTitle,
} from "../../../utils/github-actions";
import {
  buildIssueBody,
  buildIssueLabels,
  buildIssueTitle,
} from "../../../utils/health-issue";
import { useToast } from "../toastContext";
import type { FindingActionState } from "./FindingsBoard";
import { Icon } from "./Icon";

// ── Tunables ─────────────────────────────────────────────────────────
// GitHub's secondary rate limit is the practical ceiling for write bursts;
// 1 req/sec sequential is the documented safe rate.
const RATE_LIMIT_DELAY_MS = 1000;
// Above this many selected findings we warn the user about the projected
// wall-clock cost (LIMIT * 1s per request). 30 keeps the hint relevant
// without being noisy for typical fail-counts (most repos have ≤10).
const WARNING_THRESHOLD = 30;
// Hard cap on how many findings we'll create per submit. Prevents the
// modal turning into a multi-minute operation by accident; if a repo
// somehow has more, the user can submit a second batch.
const MAX_BATCH_SIZE = 100;

const SEVERITY_ORDER: readonly HealthSeverity[] = ["critical", "high", "medium", "low"];
// Default include-set — anything `medium` or worse. `low` findings still
// appear in the list but are unchecked by default so the user opts-in.
const DEFAULT_SEVERITY_FILTER: ReadonlySet<HealthSeverity> = new Set(["critical", "high", "medium"]);

interface BulkCreateModalProps {
  report: HealthReport;
  /** Simple repo name (no owner/). The modal pairs it with GITHUB_OWNER. */
  repo: string;
  onClose: () => void;
  /**
   * Optional sync hook — when provided, every per-finding state transition
   * is mirrored to the parent so the per-row «→ issue» buttons in
   * FindingsBoard reflect the bulk-created state immediately on close.
   */
  onActionStateChange?: (ruleId: string, state: FindingActionState) => void;
}

type LogEntry =
  | { ruleId: string; status: "created"; number: number; url: string }
  | { ruleId: string; status: "duplicate"; number: number; url: string }
  | { ruleId: string; status: "error"; detail: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const friendlyError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
};

/**
 * Bulk-create GitHub issues from the failing health-findings of a single
 * repository. Lifecycle:
 *
 *  1. User picks a subset (severity-filter chips + per-row checkboxes).
 *  2. Submit kicks off a *sequential* loop — one issue per second to stay
 *     well under GitHub's secondary rate limit. Each iteration: dedupe by
 *     title → POST /issues → best-effort add-to-project.
 *  3. Closing the modal flips an abort ref the loop checks at the top of
 *     every iteration, so a half-finished batch stops cleanly without
 *     orphaning in-flight requests (the current request still completes).
 *  4. On finish (or abort) we push a sticky toast with the totals and a
 *     deep-link to the repo's tech-debt filter.
 */
export function BulkCreateModal({ report, repo, onClose, onActionStateChange }: BulkCreateModalProps) {
  const toast = useToast();
  const hasToken = !!getToken();

  // Findings that are eligible for bulk-create — only `fail`. unknown / pass /
  // skipped never become tech-debt issues, no matter what the user does.
  const fails = useMemo(
    () => report.findings.filter((f) => f.status === "fail"),
    [report.findings],
  );

  // Severity counts drive the chip badges and the "is the chip fully selected?"
  // logic. Computed once per fails list since findings don't change while the
  // modal is open.
  const severityCounts = useMemo(() => {
    const counts: Record<HealthSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of fails) counts[f.severity]++;
    return counts;
  }, [fails]);

  // ─── Selection state ─────────────────────────────────────────────────
  // Set<rule_id> for O(1) membership checks in the row render loop.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const f of fails) {
      if (DEFAULT_SEVERITY_FILTER.has(f.severity)) init.add(f.rule_id);
    }
    return init;
  });

  // ─── Submission state ────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<LogEntry[]>([]);
  // Ref (not state) so flipping it from the close-handler doesn't cause
  // the in-flight loop to re-render and lose its closure over `current`.
  const abortRef = useRef(false);

  // ─── Esc + scroll lock ───────────────────────────────────────────────
  // Closing while submitting would leave the loop running but unmount the
  // modal — we keep the modal mounted but accept the close intent by
  // setting the abort flag, which the loop then notices.
  const handleClose = useCallback(() => {
    if (submitting) {
      // Mark abort and wait for the loop to drain. The completion handler
      // calls onClose() itself once it has finalised totals.
      abortRef.current = true;
      return;
    }
    onClose();
  }, [submitting, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ─── Selection helpers ───────────────────────────────────────────────
  const toggleRow = useCallback((ruleId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  // Severity chip is "all-or-nothing": clicking it adds every finding of
  // that severity if any is missing from `selected`, otherwise removes them
  // all. Mirrors typical "select-all" UX in tabular UIs.
  const toggleSeverity = useCallback(
    (sev: HealthSeverity) => {
      const ruleIds = fails.filter((f) => f.severity === sev).map((f) => f.rule_id);
      if (ruleIds.length === 0) return;
      setSelected((prev) => {
        const next = new Set(prev);
        const allSelected = ruleIds.every((id) => next.has(id));
        if (allSelected) {
          for (const id of ruleIds) next.delete(id);
        } else {
          for (const id of ruleIds) next.add(id);
        }
        return next;
      });
    },
    [fails],
  );

  const severityChipState = useCallback(
    (sev: HealthSeverity): "all" | "some" | "none" => {
      const ruleIds = fails.filter((f) => f.severity === sev).map((f) => f.rule_id);
      if (ruleIds.length === 0) return "none";
      const inCount = ruleIds.filter((id) => selected.has(id)).length;
      if (inCount === 0) return "none";
      if (inCount === ruleIds.length) return "all";
      return "some";
    },
    [fails, selected],
  );

  // ─── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const token = getToken();
    if (!token) {
      // Defence in depth — submit button is disabled in this case.
      toast.push({
        kind: "error",
        title: "Нет GitHub токена",
        description: "Добавьте токен в настройках, чтобы создавать issues.",
      });
      return;
    }
    if (selected.size === 0 || submitting) return;

    // Build a stable, severity-ordered work list. Sorting by severity means
    // the most painful items get filed first — useful when the user aborts
    // mid-batch. Sort BEFORE slicing so the MAX_BATCH_SIZE cap actually
    // keeps the top-N by severity rather than the first-N by original order
    // (otherwise high/critical findings later in `fails` could be skipped
    // while low-severity ones earlier get created).
    const workList = fails
      .filter((f) => selected.has(f.rule_id))
      .sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
      )
      .slice(0, MAX_BATCH_SIZE);

    abortRef.current = false;
    setSubmitting(true);
    setProgress({ done: 0, total: workList.length });
    setLog([]);

    let created = 0;
    let dups = 0;
    let errors = 0;
    let aborted = false;

    for (let i = 0; i < workList.length; i++) {
      // Abort check at the TOP of the loop, before any network call. If the
      // user clicked × mid-batch we stop immediately rather than burning
      // another request.
      if (abortRef.current) {
        aborted = true;
        break;
      }

      // Polite spacing between requests — but only AFTER the first one,
      // otherwise we add a needless 1s lag to single-issue submits.
      if (i > 0) {
        await sleep(RATE_LIMIT_DELAY_MS);
        if (abortRef.current) {
          aborted = true;
          break;
        }
      }

      const finding = workList[i];
      const title = buildIssueTitle(finding);
      const labels = buildIssueLabels(finding);
      const body = buildIssueBody(
        finding,
        repo,
        report.classification,
        report.generated_at,
      );

      try {
        const existing = await findOpenIssueByTitle(token, GITHUB_OWNER, repo, title);
        if (existing) {
          dups++;
          setLog((prev) => [
            ...prev,
            { ruleId: finding.rule_id, status: "duplicate", number: existing.number, url: existing.url },
          ]);
          onActionStateChange?.(finding.rule_id, {
            kind: "duplicate",
            number: existing.number,
            url: existing.url,
          });
        } else {
          const createdIssue = await createIssue(
            token,
            GITHUB_OWNER,
            repo,
            title,
            body,
            labels,
          );
          // Best-effort project add — don't let a Project v2 hiccup mark the
          // whole row as failed; the issue is already on GitHub.
          try {
            await addIssueToProject(
              token,
              GITHUB_OWNER,
              repo,
              createdIssue.number,
              GITHUB_PROJECT_NUMBER,
            );
          } catch (projErr) {
            if (import.meta.env.DEV) {
              console.warn("[bulk-create] addIssueToProject failed:", projErr);
            }
          }
          created++;
          setLog((prev) => [
            ...prev,
            { ruleId: finding.rule_id, status: "created", number: createdIssue.number, url: createdIssue.url },
          ]);
          onActionStateChange?.(finding.rule_id, {
            kind: "created",
            number: createdIssue.number,
            url: createdIssue.url,
          });
        }
      } catch (err) {
        errors++;
        const detail = friendlyError(err);
        setLog((prev) => [...prev, { ruleId: finding.rule_id, status: "error", detail }]);
        onActionStateChange?.(finding.rule_id, { kind: "error", message: detail });
      }
      setProgress({ done: i + 1, total: workList.length });
    }

    setSubmitting(false);

    // Sticky toast (duration: 0 → user dismisses manually). Link goes to the
    // repo's tech-debt filter so the user lands directly on the freshly
    // filed issues.
    const filterUrl = `https://github.com/${GITHUB_OWNER}/${repo}/issues?q=${encodeURIComponent(
      "is:issue is:open label:tech-debt",
    )}`;
    if (aborted) {
      const remaining = workList.length - (created + dups + errors);
      toast.push({
        kind: "info",
        title: `Создание прервано: ${created} created, ${remaining} skipped (дублей ${dups}, ошибок ${errors})`,
        description: { text: "Открыть в трекере", url: filterUrl },
        duration: 0,
      });
    } else {
      toast.push({
        kind: errors > 0 ? "info" : "success",
        title: `Создано ${created}, дублей ${dups}, ошибок ${errors}`,
        description: { text: "Открыть в трекере", url: filterUrl },
        duration: 0,
      });
    }

    // Auto-close the modal once the batch finished (or fully aborted) so the
    // user sees the outcome via the toast and the underlying findings board
    // (whose action-state map is already in sync).
    onClose();
  }, [
    selected,
    submitting,
    fails,
    repo,
    report.classification,
    report.generated_at,
    toast,
    onActionStateChange,
    onClose,
  ]);

  // ─── Render ──────────────────────────────────────────────────────────
  const selectedCount = selected.size;
  const showWarning = selectedCount > WARNING_THRESHOLD;
  // 1 req/sec ⇒ N findings ≈ N seconds. Cap by MAX_BATCH_SIZE because the
  // submit loop itself caps the slice at MAX_BATCH_SIZE (after severity sort).
  const projectedSeconds = Math.min(selectedCount, MAX_BATCH_SIZE);
  const submitDisabled = submitting || selectedCount === 0 || !hasToken;
  const progressPct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  // Group log entries by rule_id for fast lookup when rendering rows.
  const logByRule = useMemo(() => {
    const m = new Map<string, LogEntry>();
    for (const entry of log) m.set(entry.ruleId, entry);
    return m;
  }, [log]);

  return createPortal(
    <div
      className="v4-mspopup-bd ph-bulk-bd"
      onClick={(e) => {
        // Click outside closes — but during submit we ignore the click on
        // the backdrop entirely (use the × button to abort). Avoids the user
        // accidentally aborting a batch they wanted to finish.
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="v4-mspopup ph-bulk"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ph-bulk-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="v4-mspopup-h ph-bulk-h">
          <div className="v4-mspopup-h-text">
            <div className="v4-mspopup-repo">{repo}</div>
            <h2 id="ph-bulk-title" className="v4-mspopup-title">
              Создать issues для {fails.length} нарушений в {repo}
            </h2>
          </div>
          <button
            type="button"
            className="v4-mspopup-close"
            aria-label={submitting ? "Прервать создание" : "Закрыть"}
            onClick={handleClose}
          >
            ×
          </button>
        </header>

        <div className="ph-bulk-filters">
          {SEVERITY_ORDER.map((sev) => {
            const count = severityCounts[sev];
            const state = severityChipState(sev);
            const dim = count === 0;
            return (
              <button
                key={sev}
                type="button"
                className={`ph-bulk-chip ph-bulk-chip--${sev} is-${state} ${dim ? "is-dim" : ""}`}
                onClick={() => toggleSeverity(sev)}
                disabled={submitting || count === 0}
                aria-pressed={state !== "none"}
              >
                <span className="ph-bulk-chip-dot" />
                {sev}
                <span className="ph-bulk-chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="ph-bulk-body">
          {fails.length === 0 ? (
            <div className="v4-mspopup-empty">Нарушений нет — всё зелёное.</div>
          ) : (
            <ul className="ph-bulk-list">
              {fails.map((f) => {
                const isSelected = selected.has(f.rule_id);
                const entry = logByRule.get(f.rule_id);
                return (
                  <BulkRow
                    key={f.rule_id}
                    finding={f}
                    selected={isSelected}
                    onToggle={() => toggleRow(f.rule_id)}
                    disabled={submitting}
                    repo={repo}
                    report={report}
                    logEntry={entry}
                  />
                );
              })}
            </ul>
          )}
        </div>

        {submitting && (
          <div className="ph-bulk-progress">
            <div className="ph-bulk-progress-bar">
              <div className="ph-bulk-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="num">
              {progress.done}/{progress.total}
            </span>
          </div>
        )}

        {showWarning && !submitting && (
          <div className="ph-bulk-warning">
            <Icon name="alert" />
            <span>
              Это много issues, создание займёт ~{projectedSeconds} сек
              {selectedCount > MAX_BATCH_SIZE && (
                <> (будут обработаны первые {MAX_BATCH_SIZE})</>
              )}
              .
            </span>
          </div>
        )}

        {!hasToken && (
          <div className="ph-bulk-warning ph-bulk-warning--err">
            <Icon name="alert" />
            <span>Нет GitHub токена — добавьте его в настройках, чтобы создавать issues.</span>
          </div>
        )}

        <footer className="ph-bulk-footer">
          <span className="ph-bulk-count">
            Выбрано <b>{selectedCount}</b> из {fails.length}
          </span>
          <div className="ph-bulk-footer-btns">
            <button
              type="button"
              className="v4-btn"
              onClick={handleClose}
            >
              {submitting ? "Прервать" : "Отмена"}
            </button>
            <button
              type="button"
              className="v4-btn v4-btn--pri"
              onClick={handleSubmit}
              disabled={submitDisabled}
              title={!hasToken ? "Нужен GitHub токен" : undefined}
            >
              <Icon name="git-branch" />
              {submitting ? "Создаю…" : `Создать ${selectedCount} issues`}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

interface BulkRowProps {
  finding: HealthFinding;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  repo: string;
  report: HealthReport;
  logEntry: LogEntry | undefined;
}

// One row in the findings list — checkbox + severity badge + identifying text,
// with an expandable preview of the GitHub issue body that *would* be sent.
// Preview body is built lazily on expand to avoid running buildIssueBody for
// every row on first render.
function BulkRow({ finding, selected, onToggle, disabled, repo, report, logEntry }: BulkRowProps) {
  const [open, setOpen] = useState(false);
  const detail = finding.detail ?? "";
  const truncated = detail.length > 90 ? `${detail.slice(0, 90).trimEnd()}…` : detail;

  const previewBody = useMemo(() => {
    if (!open) return "";
    return buildIssueBody(finding, repo, report.classification, report.generated_at);
  }, [open, finding, repo, report.classification, report.generated_at]);

  return (
    <li className={`ph-bulk-row ph-bulk-row--sev-${finding.severity} ${selected ? "is-selected" : ""}`}>
      <label className="ph-bulk-row-main">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          className="ph-bulk-row-cb"
        />
        <span className={`ph-sev ph-sev--${finding.severity}`}>
          <span className="ph-sev-dot" />
          {finding.severity}
        </span>
        <span className="ph-bulk-row-text">
          <span className="ph-bulk-row-title">
            <span className="v4-mono ph-bulk-row-rule">{finding.rule_id}</span>
            <span>{finding.title}</span>
          </span>
          {detail && <span className="ph-bulk-row-detail">{truncated}</span>}
        </span>
        {logEntry && (
          <span className={`ph-bulk-row-status ph-bulk-row-status--${logEntry.status}`}>
            {logEntry.status === "created" && (
              <a href={logEntry.url} target="_blank" rel="noreferrer noopener">
                <Icon name="check" /> #{logEntry.number} created
              </a>
            )}
            {logEntry.status === "duplicate" && (
              <a href={logEntry.url} target="_blank" rel="noreferrer noopener">
                <Icon name="check" /> #{logEntry.number} exists
              </a>
            )}
            {logEntry.status === "error" && (
              <span title={logEntry.detail}>
                <Icon name="alert" /> error
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          className="ph-bulk-row-toggle"
          onClick={(e) => {
            e.preventDefault();
            setOpen(!open);
          }}
          aria-label={open ? "Скрыть превью" : "Показать превью"}
          disabled={disabled}
        >
          <Icon name={open ? "chev-up" : "chev"} />
        </button>
      </label>
      {open && (
        <div className="ph-bulk-row-preview">
          <div className="ph-bulk-row-preview-h">
            <Icon name="lightbulb" /> Превью body
          </div>
          <pre>{previewBody}</pre>
        </div>
      )}
    </li>
  );
}
