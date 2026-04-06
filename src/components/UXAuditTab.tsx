import { useState } from "react";
import { useUXAudit } from "../hooks/useUXAudit";
import type { UXFinding, UXScreenshot } from "../types";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-red)",
  high: "var(--color-orange)",
  medium: "var(--color-blue)",
  low: "var(--color-gray-400)",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

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
        <div className="ux-card-error" style={{ marginBottom: "var(--sp-3)" }}>
          <span className="ux-error-badge">Ошибка</span>
          <span className="ux-error-msg">{runError || error}</span>
        </div>
      )}

      <section className="projects-grid">
        {projects.map((p) => {
          const status = statuses[p.name];
          const result = results[p.name];
          const isRunning = status?.state === "running";
          const isCompleted = status?.state === "completed";
          const isFailed = status?.state === "failed";
          const isExpanded = expandedProject === p.name;

          return (
            <div key={p.name} className="ux-project-card">
              <div className="ux-card-header">
                <div className="ux-card-name">
                  {p.repo ? p.repo.split("/")[1] || p.repo : p.name}
                </div>
                <div className="ux-card-actions">
                  {isRunning ? (
                    <button className="btn btn-sm ux-btn-cancel" onClick={() => cancelRun(p.name)}>
                      Отменить
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={async () => {
                      setRunError(null);
                      try { await startRun(p.name); } catch (e) {
                        setRunError(e instanceof Error ? e.message : String(e));
                      }
                    }}>
                      Запустить UX
                    </button>
                  )}
                </div>
              </div>

              {/* Running state */}
              {isRunning && status && (
                <div className="ux-card-running">
                  <div className="ux-stage">{status.stage}</div>
                  <div className="pc-bar">
                    <div
                      className="pc-bar-fill"
                      style={{ width: `${status.progress}%`, background: "var(--color-blue)" }}
                    />
                  </div>
                  <div className="ux-progress-label">{status.progress}% — {status.message}</div>
                </div>
              )}

              {/* Failed state */}
              {isFailed && status && (
                <div className="ux-card-error">
                  <span className="ux-error-badge">Ошибка</span>
                  <span className="ux-error-msg">{status.error || status.message}</span>
                </div>
              )}

              {/* Completed state — summary */}
              {isCompleted && result && (
                <div className="ux-card-results">
                  <div className="ux-severity-row">
                    {SEVERITY_ORDER.map((sev) => {
                      const count = result.severity_counts[sev as keyof typeof result.severity_counts] ?? 0;
                      return (
                        <span key={sev} className="ux-severity-badge" style={{ color: SEVERITY_COLOR[sev] }}>
                          {count} {sev}
                        </span>
                      );
                    })}
                  </div>
                  <div className="ux-stats-row">
                    <span>L1: {result.l1_findings}</span>
                    <span>Vision: {result.vision_findings}</span>
                    <span>Screenshots: {result.screenshots.length}</span>
                  </div>
                  <button
                    className="btn btn-sm ux-btn-expand"
                    onClick={() => {
                      setExpandedProject(isExpanded ? null : p.name);
                      if (!isExpanded) { setFindingFilter("all"); setPageFilter("all"); }
                    }}
                  >
                    {isExpanded ? "Свернуть" : "Подробнее"}
                  </button>
                </div>
              )}

              {/* Idle state — no results yet */}
              {!isRunning && !isCompleted && !isFailed && (
                <div className="ux-card-idle">Нет результатов UX аудита</div>
              )}

              {/* Expanded results */}
              {isExpanded && result && (
                <div className="ux-expanded">
                  {/* Screenshots */}
                  <ScreenshotGallery screenshots={result.screenshots} />

                  {/* Findings */}
                  <FindingsList
                    findings={result.findings}
                    screenshots={result.screenshots}
                    severityFilter={findingFilter}
                    pageFilter={pageFilter}
                    onSeverityChange={setFindingFilter}
                    onPageChange={setPageFilter}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ── Screenshots Gallery ────────────────────────────────── */

function ScreenshotGallery({ screenshots }: { screenshots: UXScreenshot[] }) {
  // Group by page
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
                <div className="ux-viewport-label">
                  {s.viewport} ({s.width}×{s.height})
                </div>
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

interface FindingsListProps {
  findings: UXFinding[];
  screenshots: UXScreenshot[];
  severityFilter: string;
  pageFilter: string;
  onSeverityChange: (value: string) => void;
  onPageChange: (value: string) => void;
}

function FindingsList({
  findings,
  screenshots,
  severityFilter,
  pageFilter,
  onSeverityChange,
  onPageChange,
}: FindingsListProps) {
  const pages = Array.from(new Set(screenshots.map((s) => s.page_name)));

  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (pageFilter !== "all" && !f.file.includes(pageFilter) && !f.description.includes(pageFilter)) return false;
    return true;
  });

  return (
    <div className="ux-findings">
      <h3 className="ux-section-title">
        Findings ({filtered.length}/{findings.length})
      </h3>

      <div className="ux-filters">
        <select
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value)}
          className="ux-filter-select"
        >
          <option value="all">Все severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={pageFilter}
          onChange={(e) => onPageChange(e.target.value)}
          className="ux-filter-select"
        >
          <option value="all">Все страницы</option>
          {pages.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="ux-findings-list">
        {filtered.length === 0 && (
          <div className="ux-empty">Нет findings по выбранным фильтрам</div>
        )}
        {filtered.map((f, i) => (
          <div key={i} className="ux-finding-item">
            <div className="ux-finding-header">
              <span className="ux-finding-severity" style={{ color: SEVERITY_COLOR[f.severity] }}>
                {f.severity.toUpperCase()}
              </span>
              <span className="ux-finding-tool">[{f.tool}]</span>
              {f.confidence != null && (
                <span className="ux-finding-conf">{Math.round(f.confidence * 100)}%</span>
              )}
            </div>
            <div className="ux-finding-desc">{f.description}</div>
            {f.recommendation && (
              <div className="ux-finding-rec">{f.recommendation}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
