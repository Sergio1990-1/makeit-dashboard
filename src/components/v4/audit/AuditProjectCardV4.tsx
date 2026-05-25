import type { AuditProjectStatus, AuditRunStatus } from "../../../types";
import {
  fmtAge,
  fmtCost,
  fmtDuration,
  isAuditStale,
  projectHealth,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  STALE_DAYS,
  type Severity,
} from "./utils";

interface Props {
  project: AuditProjectStatus;
  status: AuditRunStatus | undefined;
  /** GitHub issue progress for issues created in the current audit run. */
  auditIssueProgress?: { total: number; closed: number };
  nowMs: number;
  onRun: () => void;
  onCancel: () => void;
  onVerify: () => void;
  onCreateIssues: () => void;
}

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function AuditProjectCardV4({
  project,
  status,
  auditIssueProgress,
  nowMs,
  onRun,
  onCancel,
  onVerify,
  onCreateIssues,
}: Props) {
  const isRunning = status?.state === "running";
  const isFailed = status?.state === "failed";
  const lr = project.last_run;
  const hasRun = !!lr;
  const isVerified = !!lr?.verification;
  const repoName = project.repo.split("/")[1] || project.name;
  const repoOwner = project.repo.split("/")[0] || "";
  const health = projectHealth(project);
  const stale = lr ? isAuditStale(lr.timestamp, nowMs) : false;

  const totalSeg = lr
    ? SEV_ORDER.reduce((s, k) => s + lr.severity_counts[k], 0)
    : 0;

  return (
    <div className={`v4-au-card v4-au-card--${health}${isRunning ? " is-running" : ""}`}>
      {/* Header */}
      <div className="v4-au-card-h">
        <div className="v4-au-card-name">
          <span className="v4-au-card-title" title={repoName}>{repoName}</span>
          {repoOwner && <span className="v4-tag v4-au-card-owner">{repoOwner}</span>}
        </div>
        <div className="v4-au-card-badges">
          {isRunning && (
            <span className="v4-tag v4-tag--warn v4-au-status v4-au-status--running">
              <span className="v4-au-running-dot" aria-hidden="true" /> running
            </span>
          )}
          {isFailed && !isRunning && (
            <span className="v4-tag v4-tag--danger v4-au-status">error</span>
          )}
          {!isRunning && !isFailed && hasRun && isVerified && (
            <span className="v4-tag v4-tag--ok v4-au-status">верифицировано</span>
          )}
          {!isRunning && !isFailed && hasRun && !isVerified && (
            <span className="v4-tag v4-tag--warn v4-au-status">ждёт верификации</span>
          )}
          {!isRunning && !hasRun && (
            <span className="v4-tag v4-au-status">не аудирован</span>
          )}
        </div>
      </div>

      {/* Body */}
      {isRunning && status ? (
        <div className="v4-au-card-progress">
          <div className="v4-au-progress-h">
            <span className="v4-au-progress-stage">{status.stage || "Запуск…"}</span>
            <span className="v4-pl-mono v4-au-progress-pct">{status.progress}%</span>
          </div>
          <div className="v4-au-progress-track">
            <div
              className="v4-au-progress-fill"
              style={{ width: `${Math.max(2, status.progress)}%` }}
            />
          </div>
          {status.message && (
            <div className="v4-au-progress-msg">{status.message}</div>
          )}
        </div>
      ) : isFailed && status ? (
        <div className="v4-au-card-error">
          <div className="v4-au-card-error-t">Ошибка аудита</div>
          <div className="v4-au-card-error-b">{status.error || "Unknown error"}</div>
        </div>
      ) : !hasRun ? (
        <div className="v4-au-card-empty">Прогонов аудита не было</div>
      ) : (
        <>
          {/* Findings + severity bar */}
          <div className="v4-au-card-findings">
            <div className="v4-au-findings-h">
              <span className="v4-pl-mono v4-au-findings-total">{lr.total_findings}</span>
              <span className="v4-au-text-muted">находок</span>
              <div className="v4-au-findings-pris">
                {SEV_ORDER.map((sev) => {
                  const n = lr.severity_counts[sev];
                  if (n === 0) return null;
                  return (
                    <span key={sev} className="v4-au-pri" title={SEVERITY_LABEL[sev]}>
                      <span className="v4-au-pri-dot" style={{ background: SEVERITY_COLOR[sev] }} />
                      <span className="v4-pl-mono">{n}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            {totalSeg > 0 && (
              <div className="v4-au-sev-bar">
                {SEV_ORDER.map((sev) => {
                  const n = lr.severity_counts[sev];
                  if (n === 0) return null;
                  return (
                    <div
                      key={sev}
                      className="v4-au-sev-seg"
                      style={{ flex: n, background: SEVERITY_COLOR[sev] }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Issue progress (when issues were created from this run) */}
          {auditIssueProgress && (
            <div className="v4-au-card-fixed">
              <div className="v4-au-fixed-h">
                <span className="v4-au-text-muted">Закрыто</span>
                <span
                  className={`v4-pl-mono v4-au-fixed-cnt${auditIssueProgress.closed === auditIssueProgress.total ? " is-done" : ""}`}
                >
                  {auditIssueProgress.closed} / {auditIssueProgress.total}
                </span>
              </div>
              <div className="v4-au-fixed-track">
                <div
                  className="v4-au-fixed-fill"
                  style={{
                    width: auditIssueProgress.total > 0
                      ? `${(auditIssueProgress.closed / auditIssueProgress.total) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Verification stats (only when verified) */}
          {isVerified && lr.verification && (
            <div className="v4-au-card-verify">
              <span className="v4-au-text-muted">Верификация</span>
              <span className="v4-pl-mono" style={{ color: "var(--mk-danger-strong)" }} title="Подтверждено">
                ✓ {lr.verification.confirmed}
              </span>
              <span className="v4-pl-mono" style={{ color: "var(--mk-success-strong)" }} title="Ложное срабатывание">
                ✗ {lr.verification.false_positive}
              </span>
              <span className="v4-pl-mono" style={{ color: "var(--mk-warn-strong)" }} title="Неуверенно">
                ? {lr.verification.uncertain}
              </span>
            </div>
          )}

          {/* Meta footer */}
          <div className="v4-au-card-meta">
            <div className="v4-au-meta-cell">
              <span className="v4-au-text-muted">GPU</span>
              <span className="v4-pl-mono v4-au-meta-val">
                {fmtCost(lr.cost_usd ?? 0)}
              </span>
            </div>
            <div className="v4-au-meta-cell">
              <span className="v4-au-text-muted">Время</span>
              <span className="v4-pl-mono v4-au-meta-val">
                {fmtDuration(lr.duration_seconds)}
              </span>
            </div>
            <div className="v4-au-meta-cell v4-au-meta-cell--age">
              <span className={`v4-pl-mono${stale ? " v4-au-text-warn" : " v4-au-text-muted"}`}
                title={stale ? `Аудит старше ${STALE_DAYS} дней` : lr.timestamp}
              >
                {stale && (
                  <>
                    <span className="v4-sr-only">Устаревшие данные: </span>
                    <span aria-hidden="true">⚠ </span>
                  </>
                )}
                {fmtAge(lr.timestamp, nowMs)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="v4-au-card-actions">
        {isRunning ? (
          <button type="button" className="v4-btn v4-au-btn-cancel" onClick={onCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Отменить
          </button>
        ) : (
          <button type="button" className="v4-btn" onClick={onRun}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {hasRun || isFailed ? "Перезапуск" : "Аудит"}
          </button>
        )}
        {!isRunning && hasRun && (
          <button
            type="button"
            className={`v4-btn${isVerified ? " v4-au-btn-ok" : ""}`}
            onClick={onVerify}
            title={isVerified ? "Повторить верификацию" : "Верифицировать findings"}
          >
            {isVerified ? "✓ Верифицировано" : "Верифицировать"}
          </button>
        )}
        {!isRunning && hasRun && (
          <button
            type="button"
            className="v4-btn v4-btn--pri"
            onClick={onCreateIssues}
            disabled={!isVerified}
            title={!isVerified ? "Сначала выполните верификацию" : "Создать GitHub Issues"}
          >
            Создать Issues
          </button>
        )}
      </div>
    </div>
  );
}
