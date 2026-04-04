import type { AuditProjectStatus, AuditRunStatus } from "../types";

interface Props {
  project: AuditProjectStatus;
  status: AuditRunStatus | undefined;
  auditIssueProgress?: { total: number; closed: number };
  onRun?: () => void;
  onCancel?: () => void;
  onVerify?: () => void;
  onCreateIssues?: () => void;
}

export function AuditProjectCard({ project, status, auditIssueProgress, onRun, onCancel, onVerify, onCreateIssues }: Props) {
  const isRunning = status?.state === "running";
  const isFailed = status?.state === "failed";
  const hasRun = Boolean(project.last_run);
  const verification = project.last_run?.verification ?? null;
  const isVerified = verification !== null;
  const repoName = project.repo.split('/')[1] || project.name;
  const repoOwner = project.repo.split('/')[0] || "Unknown";

  return (
    <div className={`pc ${isRunning ? 'pc--running' : ''}`}>
      {/* Row 1: Header */}
      <div className="pc-header">
        <div className="pc-name-row">
          <h3 className="pc-name">{repoName}</h3>
          <span className="pc-phase apc-owner">
            {repoOwner}
          </span>
        </div>
        {isRunning && (
          <span className="pc-monitor pc-monitor--pending apc-monitor-sm">
            <span className="pc-monitor-dot pc-monitor-dot--pending apc-monitor-dot--pulse" />
            running
          </span>
        )}
        {isFailed && (
          <span className="pc-monitor pc-monitor--down apc-monitor-sm">
            <span className="pc-monitor-dot pc-monitor-dot--down" />
            error
          </span>
        )}
      </div>

      {isRunning ? (
        <div className="pc-slot pc-slot--issues apc-progress-slot">
          <div className="apc-progress-header">
            <span className="apc-progress-stage">{status?.stage || 'Initializing'}</span>
            <span className="apc-progress-pct">{status?.progress}%</span>
          </div>
          <div className="pc-bar apc-progress-bar--lg">
            <div className="pc-bar-fill" style={{ width: `${status?.progress}%`, transition: 'width 0.5s ease-out' }} />
          </div>
          <div className="apc-progress-message">{status?.message}</div>
        </div>
      ) : isFailed ? (
        <div className="pc-slot apc-error-slot">
          <div className="apc-error-title">Ошибка аудита:</div>
          <div className="apc-error-body">{status?.error || 'Unknown error'}</div>
        </div>
      ) : !hasRun ? (
        <div className="pc-slot apc-empty-slot">
          Прогонов не было
        </div>
      ) : (
        <>
          {/* Row 2: Issues / Severity Bar */}
          <div className="pc-slot pc-slot--issues">
            <div className="pc-priorities">
              <span className="pc-total">{project.last_run!.total_findings} <span className="pc-total-label">находок</span></span>
              <div className="pc-pri-group">
                {project.last_run!.severity_counts.critical > 0 && (
                  <span className="pc-pri">
                    <span className="pc-pri-dot" style={{ background: "var(--color-danger)" }} />
                    {project.last_run!.severity_counts.critical}
                  </span>
                )}
                {project.last_run!.severity_counts.high > 0 && (
                  <span className="pc-pri">
                    <span className="pc-pri-dot" style={{ background: "var(--color-warning)" }} />
                    {project.last_run!.severity_counts.high}
                  </span>
                )}
                {project.last_run!.severity_counts.medium > 0 && (
                  <span className="pc-pri">
                    <span className="pc-pri-dot" style={{ background: "var(--color-primary)" }} />
                    {project.last_run!.severity_counts.medium}
                  </span>
                )}
                {project.last_run!.severity_counts.low > 0 && (
                  <span className="pc-pri">
                    <span className="pc-pri-dot" style={{ background: "var(--color-text-muted)" }} />
                    {project.last_run!.severity_counts.low}
                  </span>
                )}
              </div>
            </div>
            <div className="pc-progress">
              <div className="pc-bar apc-severity-bar">
                {project.last_run!.severity_counts.critical > 0 && (
                  <div className="pc-bar-fill apc-severity-seg" style={{ flex: project.last_run!.severity_counts.critical, background: "var(--color-danger)" }} />
                )}
                {project.last_run!.severity_counts.high > 0 && (
                  <div className="pc-bar-fill apc-severity-seg" style={{ flex: project.last_run!.severity_counts.high, background: "var(--color-warning)" }} />
                )}
                {project.last_run!.severity_counts.medium > 0 && (
                  <div className="pc-bar-fill apc-severity-seg" style={{ flex: project.last_run!.severity_counts.medium, background: "var(--color-primary)" }} />
                )}
                {project.last_run!.severity_counts.low > 0 && (
                  <div className="pc-bar-fill apc-severity-seg" style={{ flex: project.last_run!.severity_counts.low, background: "var(--color-text-muted)" }} />
                )}
              </div>
            </div>
          </div>

          {/* Issues Fixed counter */}
          {auditIssueProgress && (
            <div className="pc-slot apc-fixed-section">
              <div className="apc-fixed-header">
                <span className="apc-fixed-label">Исправлено</span>
                <span className={`apc-fixed-count ${auditIssueProgress.closed === auditIssueProgress.total ? 'apc-fixed-count--done' : ''}`}>
                  {auditIssueProgress.closed} / {auditIssueProgress.total}
                </span>
              </div>
              <div className="apc-fixed-bar-track">
                <div
                  className="apc-fixed-bar-fill"
                  style={{ width: auditIssueProgress.total > 0 ? `${(auditIssueProgress.closed / auditIssueProgress.total) * 100}%` : "0%" }}
                />
              </div>
            </div>
          )}

          {/* Row 3: Details (Time & Cost) */}
          <div className="pc-slot pc-slot--finance-group apc-meta-section">
            <div className="pc-finance-row" style={{ marginBottom: 0 }}>
              <span className="pc-finance-group">
                <span className="pc-finance-label">GPU Стоимость</span>
                <span className="pc-finance-remaining">${project.last_run!.cost_usd ? project.last_run!.cost_usd.toFixed(2) : "0.00"}</span>
              </span>
              <span className="pc-finance-group">
                <span className="pc-finance-label">Время</span>
                <span className="pc-finance-total">{Math.round(project.last_run!.duration_seconds / 60)} мин</span>
              </span>
            </div>
            <div className="apc-meta-timestamp">
              Срез: {new Date(project.last_run!.timestamp).toLocaleString("ru-RU", {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </div>
          </div>
        </>
      )}

      {/* Verification summary strip (only when verified) */}
      {!isRunning && hasRun && isVerified && verification && (
        <div className="pc-slot apc-verify-summary">
          <span className="apc-verify-label">Верифицировано:</span>
          <span className="apc-verify-stat" style={{ color: "var(--color-danger)" }}>
            ✓ {verification.confirmed}
          </span>
          <span className="apc-verify-stat" style={{ color: "var(--color-success)" }}>
            ✗ {verification.false_positive}
          </span>
          <span className="apc-verify-stat" style={{ color: "var(--color-warning)" }}>
            ? {verification.uncertain}
          </span>
        </div>
      )}

      {/* Row 4: Actions */}
      <div className="apc-actions">
        {isRunning ? (
          <button className="btn btn-sm btn-danger apc-btn-full" onClick={onCancel}>
            ■ Отменить
          </button>
        ) : (
          <button className="btn btn-sm apc-btn-full" onClick={onRun}>
            ▶ {hasRun || isFailed ? 'Перезапуск' : 'Аудит'}
          </button>
        )}
        {!isRunning && hasRun && (
          <button
            className={`btn btn-sm apc-btn-full ${isVerified ? "btn-success" : ""}`}
            onClick={onVerify}
            title={isVerified
              ? "Результаты верификации сохранены. Нажмите для повторной верификации."
              : "Верифицировать findings перед созданием issues"}
          >
            {isVerified ? "✓ Верифицировано" : "◈ Верифицировать"}
          </button>
        )}
        {!isRunning && hasRun && (
          <button
            className="btn btn-primary btn-sm apc-btn-full"
            onClick={onCreateIssues}
            disabled={!isVerified}
            title={!isVerified
              ? "Сначала выполните верификацию"
              : "Создать GitHub Issues из результатов аудита"}
          >
            ✦ Issues
          </button>
        )}
      </div>
    </div>
  );
}
