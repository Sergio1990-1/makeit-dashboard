import { useState, useEffect } from "react";
import { usePipeline } from "../hooks/usePipeline";
import { GITHUB_OWNER, PROJECTS } from "../utils/config";
import type { PipelineStageEntry } from "../utils/pipeline";

const LABEL_OPTIONS = ["P1-critical", "P2-high", "P3-medium"] as const;
type LabelOption = (typeof LABEL_OPTIONS)[number];

const STAGE_ORDER = ["dev", "review", "merge"] as const;

const STAGE_LABEL: Record<string, string> = {
  dev: "Dev",
  review: "Review",
  merge: "Merge",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "В очереди",
  in_progress: "В работе",
  pr_open: "PR открыт",
  in_review: "На ревью",
  retry: "Повтор",
  done: "Готово",
  needs_human: "Ручное",
};

const VERDICT_STYLE: Record<string, { color: string; bg: string }> = {
  APPROVED: { color: "var(--green-500)", bg: "rgba(16, 185, 129, 0.12)" },
  CHANGES_REQUESTED: { color: "var(--orange-500)", bg: "rgba(245, 158, 11, 0.12)" },
  PARTIAL: { color: "var(--blue-500)", bg: "rgba(76, 141, 255, 0.12)" },
};

/* ── Duration helpers ── */

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}с`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}м ${s}с`;
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м`;
}

function getElapsedSeconds(stages: PipelineStageEntry[] | undefined): number | null {
  if (!stages?.length) return null;
  const first = stages[0];
  const last = stages[stages.length - 1];
  // If task is done/failed, use recorded elapsed
  if (last.status === "completed" || last.status === "failed") {
    return last.elapsed ?? (last.ts - first.ts);
  }
  // Active task — compute from first timestamp
  return (Date.now() / 1000) - first.ts;
}

function LiveTimer({ stages }: { stages?: PipelineStageEntry[] }) {
  const [, setTick] = useState(0);
  const elapsed = getElapsedSeconds(stages);
  const isActive = stages?.length
    ? !["completed", "failed"].includes(stages[stages.length - 1].status)
    : false;

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  if (elapsed === null) return null;

  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-xs)",
      color: isActive ? "var(--blue-500)" : "var(--color-text-muted)",
      minWidth: 42,
      textAlign: "right",
    }}>
      {formatDuration(elapsed)}
    </span>
  );
}

/* ── Stage progress helpers ── */

function getStageStatus(
  stages: PipelineStageEntry[] | undefined,
  stageName: string,
): "pending" | "started" | "completed" | "failed" {
  if (!stages?.length) return "pending";
  const matching = stages.filter((s) => s.stage === stageName);
  if (!matching.length) return "pending";
  const last = matching[matching.length - 1];
  if (last.status === "completed") return "completed";
  if (last.status === "failed") return "failed";
  return "started";
}

function getStageDetail(
  stages: PipelineStageEntry[] | undefined,
  stageName: string,
): string | undefined {
  if (!stages?.length) return undefined;
  const matching = stages.filter((s) => s.stage === stageName);
  const last = matching[matching.length - 1];
  return last?.detail;
}

function StageProgress({
  stages,
  compact = false,
}: {
  stages?: PipelineStageEntry[];
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6 }}>
      {STAGE_ORDER.map((name, i) => {
        const s = getStageStatus(stages, name);
        const detail = getStageDetail(stages, name);
        const dotSize = compact ? 8 : 10;
        const dotColor =
          s === "completed"
            ? "var(--green-500)"
            : s === "failed"
              ? "var(--red-500)"
              : s === "started"
                ? "var(--blue-500)"
                : "var(--gray-400)";
        return (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: compact ? 3 : 5 }}>
            {i > 0 && (
              <div
                style={{
                  width: compact ? 10 : 16,
                  height: 1,
                  background:
                    s === "pending" ? "var(--gray-300)" : dotColor,
                  opacity: s === "pending" ? 0.5 : 0.6,
                }}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: "50%",
                  background: dotColor,
                  boxShadow: s === "started" ? `0 0 6px ${dotColor}` : undefined,
                  animation: s === "started" ? "pulse 1.5s ease-in-out infinite" : undefined,
                }}
              />
              {!compact && (
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color:
                      s === "pending"
                        ? "var(--color-text-faint)"
                        : "var(--color-text-secondary)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {STAGE_LABEL[name] ?? name}
                  {detail && s === "completed" && name === "review" && (
                    <span
                      style={{
                        marginLeft: 3,
                        fontSize: "var(--text-xs)",
                        color: VERDICT_STYLE[detail]?.color ?? "var(--color-text-muted)",
                      }}
                    >
                      ({detail})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ── */

export function PipelineControlPanel() {
  const {
    available,
    status,
    stats,
    statsProject,
    error,
    starting,
    stopping,
    start,
    stop,
    refresh,
    loadStats,
  } = usePipeline();

  const [selectedProject, setSelectedProject] = useState<string>(() => {
    return localStorage.getItem("pipeline_project") || `${GITHUB_OWNER}/moliyakg`;
  });
  const [selectedLabels, setSelectedLabels] = useState<LabelOption[]>(() => {
    try {
      const saved = localStorage.getItem("pipeline_labels");
      if (saved) return JSON.parse(saved) as LabelOption[];
    } catch { /* ignore */ }
    return ["P1-critical", "P2-high"];
  });
  const [limit, setLimit] = useState(() => {
    return Number(localStorage.getItem("pipeline_limit")) || 4;
  });

  useEffect(() => {
    localStorage.setItem("pipeline_project", selectedProject);
  }, [selectedProject]);

  useEffect(() => {
    localStorage.setItem("pipeline_labels", JSON.stringify(selectedLabels));
  }, [selectedLabels]);

  useEffect(() => {
    localStorage.setItem("pipeline_limit", String(limit));
  }, [limit]);

  useEffect(() => {
    if (available && selectedProject) void loadStats(selectedProject);
  }, [available, selectedProject, loadStats]);

  function toggleLabel(label: LabelOption) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  function handleStart() {
    void start({
      project: selectedProject || undefined,
      labels: selectedLabels.length > 0 ? selectedLabels : undefined,
      limit,
    });
  }

  /* ── Loading ── */
  if (available === null) {
    return (
      <div className="bento-panel span-12" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          Подключение к pipeline...
        </span>
      </div>
    );
  }

  /* ── Offline ── */
  if (available === false) {
    return (
      <div className="bento-panel span-12" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 32 }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-text)" }}>
          Pipeline недоступен
        </div>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", margin: 0, textAlign: "center", maxWidth: 480 }}>
          Pipeline API сервер не отвечает. Убедитесь, что Mac включён и API запущен.
        </p>
        <pre style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 16px",
          fontSize: "var(--text-xs)",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-secondary)",
          margin: 0,
          whiteSpace: "pre-wrap",
          maxWidth: 520,
          width: "100%",
        }}>
          {`# На Mac:\ncd ~/Desktop/makeit-pipeline\nsource .venv/bin/activate\nuvicorn makeit_pipeline.api:create_app --factory --port 8766`}
        </pre>
        <button className="btn btn-primary" onClick={() => void refresh()}>
          Обновить
        </button>
      </div>
    );
  }

  const isRunning = status?.running ?? false;
  const isStopping = status?.stopping ?? false;
  const issueStages = status?.issue_stages ?? {};

  return (
    <>
      {/* ── Controls ── */}
      <div className="bento-panel span-12" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Status dot */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginRight: 4,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isRunning ? "var(--green-500)" : "var(--gray-500)",
              boxShadow: isRunning ? "0 0 8px var(--color-glow-success)" : undefined,
            }} />
            <span style={{
              fontSize: "var(--text-xs)", fontWeight: 700,
              color: "var(--color-text-muted)", textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Pipeline
            </span>
          </div>

          {/* Project selector */}
          <select
            className="input"
            style={{ fontSize: "var(--text-sm)", padding: "4px 8px", minWidth: 160 }}
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            disabled={isRunning}
          >
            <option value="">Все проекты</option>
            {PROJECTS.map((p) => (
              <option key={p.repo} value={`${p.owner}/${p.repo}`}>
                {p.repo}
              </option>
            ))}
          </select>

          {/* Label chips */}
          <div style={{ display: "flex", gap: 4 }}>
            {LABEL_OPTIONS.map((label) => {
              const active = selectedLabels.includes(label);
              const colorMap: Record<string, string> = {
                "P1-critical": "var(--red-500)",
                "P2-high": "var(--orange-500)",
                "P3-medium": "var(--gray-600)",
              };
              return (
                <button
                  key={label}
                  onClick={() => toggleLabel(label)}
                  disabled={isRunning}
                  style={{
                    padding: "2px 8px",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    borderRadius: 12,
                    border: `1px solid ${active ? colorMap[label] : "var(--color-border)"}`,
                    background: active ? `color-mix(in srgb, ${colorMap[label]} 15%, transparent)` : "transparent",
                    color: active ? colorMap[label] : "var(--color-text-muted)",
                    cursor: isRunning ? "not-allowed" : "pointer",
                    opacity: isRunning ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Limit */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Лимит</span>
            <input
              type="number"
              className="input"
              style={{ width: 48, padding: "4px 6px", fontSize: "var(--text-sm)", textAlign: "center" }}
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value))))}
              disabled={isRunning}
            />
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Actions */}
          {!isRunning && (
            <button className="btn btn-primary" style={{ padding: "6px 16px" }} onClick={handleStart} disabled={starting}>
              {starting ? "Запуск..." : "Запустить"}
            </button>
          )}
          {isRunning && !isStopping && (
            <button
              className="btn"
              style={{ padding: "6px 16px", borderColor: "var(--red-500)", color: "var(--red-500)" }}
              onClick={() => void stop()}
              disabled={stopping}
            >
              Остановить
            </button>
          )}
          {isStopping && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              Завершаем...
            </span>
          )}

          {error && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--red-500)" }}>{error}</span>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      {stats && (
        <div className="bento-panel span-6">
          <div className="bento-panel-title">
            Статистика
            <span style={{ textTransform: "none", fontWeight: 400 }}>
              {statsProject?.split("/")[1]}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              { value: stats.total_issues, label: "Всего", color: "var(--color-text)" },
              { value: stats.agent_completed, label: "Pipeline", color: "var(--green-500)" },
              { value: stats.manual_completed, label: "Вручную", color: "var(--color-text-secondary)" },
              { value: stats.total_issues - stats.closed_issues, label: "Открыто", color: "var(--blue-500)" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--text-data)", fontWeight: 700, color: s.color, lineHeight: 1.2 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live tasks ── */}
      {isRunning && status && (
        <div className="bento-panel span-6">
          <div className="bento-panel-title">
            Активные задачи
            <span style={{
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 10,
              textTransform: "none",
            }}>
              {status.active_tasks}
            </span>
          </div>
          {(() => {
            // Merge queue items with live stage data; prefer issue_stages as source of truth
            const stageIssueNums = Object.keys(issueStages).map(Number);
            const queueNums = new Set(status.queue.map((q) => q.number));
            // Issues that have stages but aren't in queue (already running)
            const extraNums = stageIssueNums.filter((n) => !queueNums.has(n));
            const allItems = [
              ...extraNums.map((n) => ({ number: n, title: `Issue #${n}`, status: "in_progress", priority: 0 })),
              ...status.queue,
            ];
            if (allItems.length === 0) {
              return (
                <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                  Ожидание задач...
                </div>
              );
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {allItems.slice(0, 10).map((item) => {
                  const liveStages = issueStages[item.number];
                  return (
                    <div
                      key={item.number}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--color-bg)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                        minWidth: 36,
                      }}>
                        #{item.number}
                      </span>
                      <span style={{
                        flex: 1,
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {item.title}
                      </span>
                      {liveStages ? (
                        <>
                          <StageProgress stages={liveStages} />
                          <LiveTimer stages={liveStages} />
                        </>
                      ) : (
                        <span style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--color-text-muted)",
                          padding: "1px 6px",
                          borderRadius: 8,
                          border: "1px solid var(--color-border)",
                        }}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Results ── */}
      {status && status.results.length > 0 && (
        <div className="bento-panel span-12">
          <div className="bento-panel-title">
            Результаты
            <span style={{ textTransform: "none", fontWeight: 400 }}>
              {status.results.length} задач
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {status.results.map((r) => {
              const isDone = r.status === "done";
              const isFailed = r.status === "needs_human";
              return (
                <div
                  key={r.issue_number}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-bg)",
                    border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : isFailed ? "rgba(239,68,68,0.2)" : "var(--color-border)"}`,
                  }}
                >
                  {/* Issue number */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    minWidth: 36,
                  }}>
                    #{r.issue_number}
                  </span>

                  {/* Status badge */}
                  <span style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    padding: "1px 8px",
                    borderRadius: 10,
                    background: isDone
                      ? "rgba(16, 185, 129, 0.12)"
                      : isFailed
                        ? "rgba(239, 68, 68, 0.12)"
                        : "rgba(76, 141, 255, 0.12)",
                    color: isDone
                      ? "var(--green-500)"
                      : isFailed
                        ? "var(--red-500)"
                        : "var(--blue-500)",
                  }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>

                  {/* Stage progress */}
                  <StageProgress stages={r.stages} compact />

                  {/* Review verdict */}
                  {r.review_verdict && (
                    <span style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 8,
                      background: VERDICT_STYLE[r.review_verdict]?.bg ?? "var(--color-surface)",
                      color: VERDICT_STYLE[r.review_verdict]?.color ?? "var(--color-text-muted)",
                    }}>
                      {r.review_verdict}
                    </span>
                  )}

                  {/* Duration */}
                  <LiveTimer stages={r.stages} />

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Retries */}
                  {r.retries > 0 && (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--orange-500)" }}>
                      {r.retries} retry
                    </span>
                  )}

                  {/* PR link */}
                  {r.pr_url && (
                    <a
                      href={r.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-primary)",
                        textDecoration: "none",
                      }}
                    >
                      PR
                    </a>
                  )}

                  {/* Error tooltip */}
                  {r.error && (
                    <span
                      title={r.error}
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--red-500)",
                        cursor: "help",
                      }}
                    >
                      err
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pulse animation for active stages */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
