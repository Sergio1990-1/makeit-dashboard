import { useState } from "react";
import { useUXAudit } from "../hooks/useUXAudit";
import type { AuditProjectStatus, UXAuditResults, UXFinding, UXScreenshot } from "../types";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-danger)",
  high: "var(--color-warning)",
  medium: "var(--color-primary)",
  low: "var(--color-text-muted)",
};

export function UXAuditTab() {
  const { projects, statuses, results, auditorAvailable, loading, error, refresh, startRun, cancelRun } = useUXAudit();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [findingFilter, setFindingFilter] = useState<string>("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [runError, setRunError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bento-panel span-12 panel-projects audit-loading">
        <div className="audit-spinner" />
        Загрузка конфигурации...
      </div>
    );
  }

  if (auditorAvailable === false) {
    return (
      <div className="bento-panel span-12 panel-projects audit-offline">
        <div className="audit-offline-card">
          <h2 className="audit-offline-title">UX Audit — сервер недоступен</h2>
          <p className="audit-offline-desc">
            Не удалось подключиться к makeit-auditor API. Убедитесь, что сервис запущен.
          </p>
          <button className="btn btn-primary audit-offline-btn" onClick={refresh}>
            Обновить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bento-panel span-12 panel-projects">
      <div className="bento-panel-title">
        <div>
          UX Аудит
          <span className="audit-header-sub">Lighthouse + axe-core + Vision LLM</span>
        </div>
        <button className="btn btn-sm audit-refresh-btn" onClick={refresh}>
          ↻ Обновить
        </button>
      </div>

      {(error || runError) && (
        <div className="pc-slot apc-error-slot" style={{ marginBottom: "var(--sp-3)" }}>
          <div className="apc-error-title">Ошибка:</div>
          <div className="apc-error-body">{runError || error}</div>
        </div>
      )}

      <section className="projects-grid">
        {projects.map((p) => (
          <UXProjectCard
            key={p.name}
            project={p}
            status={statuses[p.name]}
            result={results[p.name]}
            isExpanded={expandedProject === p.name}
            findingFilter={findingFilter}
            pageFilter={pageFilter}
            onRun={async () => {
              setRunError(null);
              try { await startRun(p.name); } catch (e) {
                setRunError(e instanceof Error ? e.message : String(e));
              }
            }}
            onCancel={() => cancelRun(p.name)}
            onToggleExpand={() => {
              const willExpand = expandedProject !== p.name;
              setExpandedProject(willExpand ? p.name : null);
              if (willExpand) { setFindingFilter("all"); setPageFilter("all"); }
            }}
            onSeverityChange={setFindingFilter}
            onPageChange={setPageFilter}
          />
        ))}
      </section>
    </div>
  );
}

/* ── Project Card (uses existing pc-* classes) ────────── */

interface CardProps {
  project: AuditProjectStatus;
  status: { state: string; stage?: string; progress: number; message: string; error: string | null } | undefined;
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

function UXProjectCard({ project, status, result, isExpanded, findingFilter, pageFilter, onRun, onCancel, onToggleExpand, onSeverityChange, onPageChange }: CardProps) {
  const isRunning = status?.state === "running";
  const isCompleted = status?.state === "completed";
  const isFailed = status?.state === "failed";
  const repoName = project.repo.split("/")[1] || project.name;
  const repoOwner = project.repo.split("/")[0] || "";

  return (
    <div className={`pc ${isRunning ? "pc--running" : ""}`}>
      {/* Header */}
      <div className="pc-header">
        <div className="pc-name-row">
          <h3 className="pc-name">{repoName}</h3>
          {repoOwner && <span className="pc-phase apc-owner">{repoOwner}</span>}
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

      {/* Running */}
      {isRunning && status ? (
        <div className="pc-slot pc-slot--issues apc-progress-slot">
          <div className="apc-progress-header">
            <span className="apc-progress-stage">{status.stage || "Initializing"}</span>
            <span className="apc-progress-pct">{status.progress}%</span>
          </div>
          <div className="pc-bar apc-progress-bar--lg">
            <div className="pc-bar-fill" style={{ width: `${status.progress}%`, transition: "width 0.5s ease-out" }} />
          </div>
          <div className="apc-progress-message">{status.message}</div>
        </div>
      ) : isFailed && status ? (
        <div className="pc-slot apc-error-slot">
          <div className="apc-error-title">Ошибка UX аудита:</div>
          <div className="apc-error-body">{status.error || "Unknown error"}</div>
        </div>
      ) : isCompleted && result ? (
        <>
          {/* Severity bar */}
          <div className="pc-slot pc-slot--issues">
            <div className="pc-priorities">
              <span className="pc-total">{result.total_findings} <span className="pc-total-label">находок</span></span>
              <div className="pc-pri-group">
                {result.severity_counts.critical > 0 && (
                  <span className="pc-pri"><span className="pc-pri-dot" style={{ background: "var(--color-danger)" }} />{result.severity_counts.critical}</span>
                )}
                {result.severity_counts.high > 0 && (
                  <span className="pc-pri"><span className="pc-pri-dot" style={{ background: "var(--color-warning)" }} />{result.severity_counts.high}</span>
                )}
                {result.severity_counts.medium > 0 && (
                  <span className="pc-pri"><span className="pc-pri-dot" style={{ background: "var(--color-primary)" }} />{result.severity_counts.medium}</span>
                )}
                {result.severity_counts.low > 0 && (
                  <span className="pc-pri"><span className="pc-pri-dot" style={{ background: "var(--color-text-muted)" }} />{result.severity_counts.low}</span>
                )}
              </div>
            </div>
            <div className="pc-progress">
              <div className="pc-bar apc-severity-bar">
                {result.severity_counts.critical > 0 && <div className="pc-bar-fill apc-severity-seg" style={{ flex: result.severity_counts.critical, background: "var(--color-danger)" }} />}
                {result.severity_counts.high > 0 && <div className="pc-bar-fill apc-severity-seg" style={{ flex: result.severity_counts.high, background: "var(--color-warning)" }} />}
                {result.severity_counts.medium > 0 && <div className="pc-bar-fill apc-severity-seg" style={{ flex: result.severity_counts.medium, background: "var(--color-primary)" }} />}
                {result.severity_counts.low > 0 && <div className="pc-bar-fill apc-severity-seg" style={{ flex: result.severity_counts.low, background: "var(--color-text-muted)" }} />}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="pc-slot pc-slot--finance-group apc-meta-section">
            <div className="pc-finance-row" style={{ marginBottom: 0 }}>
              <span className="pc-finance-group">
                <span className="pc-finance-label">L1</span>
                <span className="pc-finance-remaining">{result.l1_findings}</span>
              </span>
              <span className="pc-finance-group">
                <span className="pc-finance-label">Vision</span>
                <span className="pc-finance-remaining">{result.vision_findings}</span>
              </span>
              <span className="pc-finance-group">
                <span className="pc-finance-label">Screenshots</span>
                <span className="pc-finance-total">{result.screenshots.length}</span>
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="pc-slot apc-empty-slot">Нет результатов UX аудита</div>
      )}

      {/* Actions */}
      <div className="apc-actions">
        {isRunning ? (
          <button className="btn btn-sm btn-danger apc-btn-full" onClick={onCancel}>
            ■ Отменить
          </button>
        ) : (
          <button className="btn btn-sm apc-btn-full" onClick={onRun}>
            ▶ {isCompleted || isFailed ? "Перезапуск" : "UX Аудит"}
          </button>
        )}
        {isCompleted && result && (
          <button className="btn btn-sm apc-btn-full" onClick={onToggleExpand}>
            {isExpanded ? "▲ Свернуть" : "▼ Подробнее"}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && result && (
        <div className="ux-expanded">
          <ScreenshotGallery screenshots={result.screenshots} />
          <FindingsList
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

/* ── Screenshots Gallery ────────────────────────────────── */

function ScreenshotGallery({ screenshots }: { screenshots: UXScreenshot[] }) {
  const byPage: Record<string, UXScreenshot[]> = {};
  for (const s of screenshots) {
    (byPage[s.page_name] ??= []).push(s);
  }

  return (
    <div className="ux-screenshots">
      <h3 className="ux-section-title">Скриншоты</h3>
      {Object.entries(byPage).map(([pageName, shots]) => (
        <div key={pageName} className="ux-page-group">
          <div className="ux-page-name">{pageName}</div>
          <div className="ux-viewport-row">
            {shots.map((s) => (
              <div key={`${s.page_name}-${s.viewport}`} className="ux-viewport-card">
                <div className="ux-viewport-label">{s.viewport} ({s.width}×{s.height})</div>
                <div className="ux-viewport-url">{s.url}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Findings List ───────────────────────────────────────── */

function FindingsList({
  findings, screenshots, severityFilter, pageFilter, onSeverityChange, onPageChange,
}: {
  findings: UXFinding[]; screenshots: UXScreenshot[];
  severityFilter: string; pageFilter: string;
  onSeverityChange: (v: string) => void; onPageChange: (v: string) => void;
}) {
  const pages = Array.from(new Set(screenshots.map((s) => s.page_name)));
  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (pageFilter !== "all" && !f.file.includes(pageFilter) && !f.description.includes(pageFilter)) return false;
    return true;
  });

  return (
    <div className="ux-findings">
      <h3 className="ux-section-title">Findings ({filtered.length}/{findings.length})</h3>
      <div className="ux-filters">
        <select value={severityFilter} onChange={(e) => onSeverityChange(e.target.value)} className="ux-filter-select">
          <option value="all">Все severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={pageFilter} onChange={(e) => onPageChange(e.target.value)} className="ux-filter-select">
          <option value="all">Все страницы</option>
          {pages.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="ux-findings-list">
        {filtered.length === 0 && <div className="ux-empty">Нет findings по выбранным фильтрам</div>}
        {filtered.map((f, i) => (
          <div key={i} className="ux-finding-item">
            <div className="ux-finding-header">
              <span className="ux-finding-severity" style={{ color: SEVERITY_COLOR[f.severity] }}>{f.severity.toUpperCase()}</span>
              <span className="ux-finding-tool">[{f.tool}]</span>
              {f.confidence != null && <span className="ux-finding-conf">{Math.round(f.confidence * 100)}%</span>}
            </div>
            <div className="ux-finding-desc">{f.description}</div>
            {f.recommendation && <div className="ux-finding-rec">{f.recommendation}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
