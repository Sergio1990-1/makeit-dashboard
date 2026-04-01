import type { AuditProjectStatus, AuditRunStatus } from "../types";

interface Props {
  project: AuditProjectStatus;
  status: AuditRunStatus | undefined;
  auditIssueProgress?: { total: number; closed: number };
  onRun?: () => void;
  onCancel?: () => void;
  onCreateIssues?: () => void;
}

export function AuditProjectCard({ project, status, auditIssueProgress, onRun, onCancel, onCreateIssues }: Props) {
  const isRunning = status?.state === "running";
  const isFailed = status?.state === "failed";
  const hasRun = Boolean(project.last_run);
  const repoName = project.repo.split('/')[1] || project.name;
  const repoOwner = project.repo.split('/')[0] || "Unknown";

  return (
    <div className={`pc ${isRunning ? 'pc--running' : ''}`}>
      {/* Row 1: Header */}
      <div className="pc-header">
        <div className="pc-name-row">
          <h3 className="pc-name">{repoName}</h3>
          <span className="pc-phase" style={{ background: "transparent", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", border: "none", padding: 0 }}>
            {repoOwner}
          </span>
        </div>
        {isRunning && (
            <span className="pc-monitor pc-monitor--pending" style={{ fontSize: '10px' }}>
                <span className="pc-monitor-dot pc-monitor-dot--pending" style={{ animation: 'pulse 1.5s infinite' }} />
                running
            </span>
        )}
        {isFailed && (
            <span className="pc-monitor pc-monitor--down" style={{ fontSize: '10px' }}>
                <span className="pc-monitor-dot pc-monitor-dot--down" />
                error
            </span>
        )}
      </div>

      {isRunning ? (
        <div className="pc-slot pc-slot--issues" style={{ minHeight: '100px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{status?.stage || 'Initializing'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{status?.progress}%</span>
            </div>
            <div className="pc-bar" style={{ height: '8px', background: 'var(--color-border)' }}>
                <div className="pc-bar-fill" style={{ width: `${status?.progress}%`, transition: 'width 0.5s ease-out' }} />
            </div>
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {status?.message}
            </div>
        </div>
      ) : isFailed ? (
        <div className="pc-slot" style={{ minHeight: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'var(--color-danger)', fontSize: '12px' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Ошибка аудита:</div>
            <div style={{ opacity: 0.8, fontSize: '11px', lineHeight: 1.4 }}>{status?.error || 'Unknown error'}</div>
        </div>
      ) : !hasRun ? (
        <div className="pc-slot" style={{ display: "flex", alignItems: "center", justifyItems: "center", minHeight: "100px", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
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
              <div className="pc-bar" style={{ display: "flex", gap: "2px", background: "transparent" }}>
                 {project.last_run!.severity_counts.critical > 0 && <div className="pc-bar-fill" style={{ flex: project.last_run!.severity_counts.critical, background: "var(--color-danger)", borderRadius: "var(--radius-full)" }} />}
                 {project.last_run!.severity_counts.high > 0 && <div className="pc-bar-fill" style={{ flex: project.last_run!.severity_counts.high, background: "var(--color-warning)", borderRadius: "var(--radius-full)" }} />}
                 {project.last_run!.severity_counts.medium > 0 && <div className="pc-bar-fill" style={{ flex: project.last_run!.severity_counts.medium, background: "var(--color-primary)", borderRadius: "var(--radius-full)" }} />}
                 {project.last_run!.severity_counts.low > 0 && <div className="pc-bar-fill" style={{ flex: project.last_run!.severity_counts.low, background: "var(--color-text-muted)", borderRadius: "var(--radius-full)" }} />}
              </div>
            </div>
          </div>

          {/* State D: Issues Fixed counter (shown when audit-labeled issues exist in dashboard) */}
          {auditIssueProgress && (
            <div className="pc-slot" style={{ marginTop: "8px", paddingTop: "10px", borderTop: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Исправлено</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: auditIssueProgress.closed === auditIssueProgress.total ? "var(--color-success, #22c55e)" : "var(--color-text)" }}>
                  {auditIssueProgress.closed} / {auditIssueProgress.total}
                </span>
              </div>
              <div style={{ height: "4px", background: "var(--color-border)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: auditIssueProgress.total > 0 ? `${(auditIssueProgress.closed / auditIssueProgress.total) * 100}%` : "0%",
                  background: "var(--color-success, #22c55e)",
                  borderRadius: "var(--radius-full)",
                  transition: "width 0.3s ease-out",
                }} />
              </div>
            </div>
          )}

          {/* Row 3: Details (Time & Cost) */}
          <div className="pc-slot pc-slot--finance-group" style={{ marginTop: "4px", borderTop: "1px solid var(--color-border)", paddingTop: "12px" }}>
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
            <div style={{ fontSize: "11px", color: "var(--color-text-faint)", marginTop: "6px", fontFamily: "var(--font-mono)" }}>
              Срез: {new Date(project.last_run!.timestamp).toLocaleString("ru-RU", { 
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
              })}
            </div>
          </div>
        </>
      )}

      {/* Row 4: Actions */}
      <div className="pc-slot" style={{ marginTop: "auto", paddingTop: "16px", display: "flex", gap: "8px" }}>
        {isRunning ? (
            <button 
                className="btn btn-sm btn-danger" 
                onClick={onCancel}
                style={{ flex: 1, justifyContent: "center" }}
            >
                ■ Отменить
            </button>
        ) : (
            <button 
                className="btn btn-sm" 
                onClick={onRun}
                style={{ flex: 1, justifyContent: "center" }}
            >
                ▶ {hasRun || isFailed ? 'Перезапуск' : 'Аудит'}
            </button>
        )}
        
        {!isRunning && hasRun && (
          <button
            className="btn btn-primary btn-sm"
            onClick={onCreateIssues}
            style={{ flex: 1, justifyContent: "center" }}
            title="Создать GitHub Issues из результатов аудита"
          >
            ✦ Issues
          </button>
        )}
      </div>
      
      <style>{`
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
