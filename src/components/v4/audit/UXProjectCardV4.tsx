import type {
  AuditProjectStatus,
  UXAuditResults,
  UXAuditRunStatus,
  UXFinding,
  UXScreenshot,
} from "../../../types";
import { SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from "./utils";

interface Props {
  project: AuditProjectStatus;
  status: UXAuditRunStatus | undefined;
  result: UXAuditResults | undefined;
  isExpanded: boolean;
  findingFilter: string;
  pageFilter: string;
  onRun: () => void;
  onCancel: () => void;
  onToggleExpand: () => void;
  onSeverityChange: (v: string) => void;
  onPageChange: (v: string) => void;
}

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function UXProjectCardV4({
  project,
  status,
  result,
  isExpanded,
  findingFilter,
  pageFilter,
  onRun,
  onCancel,
  onToggleExpand,
  onSeverityChange,
  onPageChange,
}: Props) {
  const isRunning = status?.state === "running";
  const isCompleted = status?.state === "completed";
  const isFailed = status?.state === "failed";
  const repoName = project.repo.split("/")[1] || project.name;
  const repoOwner = project.repo.split("/")[0] || "";

  const totalSeg = result
    ? SEV_ORDER.reduce((s, k) => s + result.severity_counts[k], 0)
    : 0;

  const health: "ok" | "warn" | "danger" | "unknown" =
    !result ? "unknown"
    : result.severity_counts.critical > 0 ? "danger"
    : result.severity_counts.high > 0 ? "warn"
    : "ok";

  return (
    <div className={`v4-au-card v4-au-card--${health}${isRunning ? " is-running" : ""}`}>
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
          {!isRunning && !isFailed && isCompleted && (
            <span className="v4-tag v4-tag--ok v4-au-status">готово</span>
          )}
          {!isRunning && !isFailed && !isCompleted && (
            <span className="v4-tag v4-au-status">нет результатов</span>
          )}
        </div>
      </div>

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
          <div className="v4-au-card-error-t">Ошибка UX аудита</div>
          <div className="v4-au-card-error-b">{status.error || "Unknown error"}</div>
        </div>
      ) : isCompleted && result ? (
        <>
          <div className="v4-au-card-findings">
            <div className="v4-au-findings-h">
              <span className="v4-pl-mono v4-au-findings-total">{result.total_findings}</span>
              <span className="v4-au-text-muted">находок</span>
              <div className="v4-au-findings-pris">
                {SEV_ORDER.map((sev) => {
                  const n = result.severity_counts[sev];
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
                  const n = result.severity_counts[sev];
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

          {/* Stats: L1 / Vision / Screenshots */}
          <div className="v4-au-card-meta">
            <div className="v4-au-meta-cell">
              <span className="v4-au-text-muted">L1</span>
              <span className="v4-pl-mono v4-au-meta-val">{result.l1_findings}</span>
            </div>
            <div className="v4-au-meta-cell">
              <span className="v4-au-text-muted">Vision</span>
              <span className="v4-pl-mono v4-au-meta-val">{result.vision_findings}</span>
            </div>
            <div className="v4-au-meta-cell">
              <span className="v4-au-text-muted">Скриншоты</span>
              <span className="v4-pl-mono v4-au-meta-val">{result.screenshots.length}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="v4-au-card-empty">Нет результатов UX аудита</div>
      )}

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
            {isCompleted || isFailed ? "Перезапуск" : "UX аудит"}
          </button>
        )}
        {isCompleted && result && (
          <button type="button" className="v4-btn" onClick={onToggleExpand}>
            {isExpanded ? "▴ Свернуть" : "▾ Подробнее"}
          </button>
        )}
      </div>

      {isExpanded && result && (
        <div className="v4-au-ux-expanded">
          <UXScreenshotGallery screenshots={result.screenshots} />
          <UXFindingsList
            findings={result.findings}
            screenshots={result.screenshots}
            severityFilter={findingFilter}
            pageFilter={pageFilter}
            onSeverityChange={onSeverityChange}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}

function UXScreenshotGallery({ screenshots }: { screenshots: UXScreenshot[] }) {
  const byPage: Record<string, UXScreenshot[]> = {};
  for (const s of screenshots) {
    (byPage[s.page_name] ??= []).push(s);
  }

  return (
    <div className="v4-au-ux-shots">
      <h4 className="v4-au-ux-h">Скриншоты</h4>
      {Object.entries(byPage).map(([pageName, shots]) => (
        <div key={pageName} className="v4-au-ux-page">
          <div className="v4-au-ux-page-name">{pageName}</div>
          <div className="v4-au-ux-shots-row">
            {shots.map((s) => (
              <div key={`${s.page_name}-${s.viewport}`} className="v4-au-ux-shot">
                <div className="v4-au-ux-shot-vp">{s.viewport} ({s.width}×{s.height})</div>
                <div className="v4-au-ux-shot-url">{s.url}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface FListProps {
  findings: UXFinding[];
  screenshots: UXScreenshot[];
  severityFilter: string;
  pageFilter: string;
  onSeverityChange: (v: string) => void;
  onPageChange: (v: string) => void;
}

function UXFindingsList({
  findings,
  screenshots,
  severityFilter,
  pageFilter,
  onSeverityChange,
  onPageChange,
}: FListProps) {
  const pages = Array.from(new Set(screenshots.map((s) => s.page_name)));
  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (pageFilter !== "all" && !f.file.includes(pageFilter) && !f.description.includes(pageFilter)) return false;
    return true;
  });

  return (
    <div className="v4-au-ux-findings">
      <h4 className="v4-au-ux-h">Findings ({filtered.length}/{findings.length})</h4>
      <div className="v4-au-ux-filters">
        <select
          aria-label="Фильтр по severity"
          className="v4-pl-input"
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value)}
        >
          <option value="all">Все severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          aria-label="Фильтр по странице"
          className="v4-pl-input"
          value={pageFilter}
          onChange={(e) => onPageChange(e.target.value)}
        >
          <option value="all">Все страницы</option>
          {pages.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="v4-au-ux-findings-list">
        {filtered.length === 0 && (
          <div className="v4-empty">Нет findings по выбранным фильтрам</div>
        )}
        {filtered.map((f) => (
          <div
            key={`${f.file}::${f.tool}::${f.description.slice(0, 80)}`}
            className="v4-au-ux-finding"
          >
            <div className="v4-au-ux-finding-h">
              <span
                className="v4-au-ux-finding-sev"
                style={{ color: SEVERITY_COLOR[f.severity as Severity] ?? "var(--mk-ink-500)" }}
              >
                {f.severity.toUpperCase()}
              </span>
              <span className="v4-pl-mono v4-au-text-muted">[{f.tool}]</span>
              {f.confidence != null && (
                <span className="v4-pl-mono v4-au-text-muted">{Math.round(f.confidence * 100)}%</span>
              )}
            </div>
            <div className="v4-au-ux-finding-desc">{f.description}</div>
            {f.recommendation && (
              <div className="v4-au-ux-finding-rec">{f.recommendation}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
