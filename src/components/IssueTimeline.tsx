import { useState, useEffect, useCallback } from "react";
import { fetchTimeline, STAGE_LABEL } from "../utils/pipeline";
import type { TimelineEntry } from "../utils/pipeline";

/* ── Helpers ── */

function dotColor(status: string): string {
  if (status === "completed") return "var(--green-500)";
  if (status === "failed") return "var(--red-500)";
  if (status === "started" || status === "in_progress") return "var(--blue-500)";
  if (status === "partial") return "var(--orange-500)";
  return "var(--gray-400)";
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/* ── Component ── */

interface IssueTimelineProps {
  repo: string;
  issueNumber: number;
  onClose: () => void;
}

export function IssueTimeline({ repo, issueNumber, onClose }: IssueTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries(null);

    fetchTimeline(repo, issueNumber)
      .then((data) => {
        if (!cancelled) {
          setEntries(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [repo, issueNumber]);

  /* Close on Escape */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  /* Totals */
  const totalCost = entries?.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0) ?? 0;
  const totalDuration = entries?.length
    ? (() => {
        const durations = entries.reduce((sum, e) => sum + (e.duration_seconds ?? 0), 0);
        if (durations > 0) return durations;
        // Fallback: last ts - first ts
        const first = entries[0];
        const last = entries[entries.length - 1];
        return first && last ? last.ts - first.ts : 0;
      })()
    : 0;

  /* Attempt number from entries detail (look for "attempt" in last entry) */
  const attemptEntry = entries?.find((e) => e.detail?.match(/attempt/i));
  const attemptText = attemptEntry?.detail;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" style={{ maxWidth: 560, minWidth: 380 }}>
        {/* Header */}
        <div className="dialog-header">
          <h3 className="dialog-title">
            Issue #{issueNumber}
          </h3>
          <button className="dialog-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="dialog-body" style={{ padding: "16px 20px" }}>
          {loading && (
            <div className="dialog-spinner-wrap">
              <div className="dialog-spinner" />
              <p className="dialog-hint">Загрузка таймлайна...</p>
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: "var(--red-500)", fontSize: "var(--text-sm)", margin: 0 }}>
                {error}
              </p>
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginTop: 8 }}>
                Timeline API недоступен
              </p>
            </div>
          )}

          {!loading && !error && (!entries || entries.length === 0) && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
                Нет данных таймлайна
              </p>
            </div>
          )}

          {!loading && !error && entries && entries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {entries.map((entry, i) => {
                const color = dotColor(entry.status);
                const isLast = i === entries.length - 1;
                return (
                  <div
                    key={`${entry.stage}-${entry.ts}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      position: "relative",
                      paddingBottom: isLast ? 0 : 12,
                    }}
                  >
                    {/* Vertical line + dot */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        minWidth: 16,
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                          marginTop: 3,
                          zIndex: 1,
                        }}
                      />
                      {!isLast && (
                        <div
                          style={{
                            width: 2,
                            flex: 1,
                            background: "var(--color-border)",
                            minHeight: 12,
                          }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        flex: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Stage name */}
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--color-text)",
                          minWidth: 100,
                        }}
                      >
                        {STAGE_LABEL[entry.stage] ?? entry.stage}
                      </span>

                      {/* Time */}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-xs)",
                          color: "var(--color-text-muted)",
                          minWidth: 62,
                        }}
                      >
                        {formatTime(entry.ts)}
                      </span>

                      {/* Cost */}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-xs)",
                          color: entry.cost_usd ? "var(--green-500)" : "var(--color-text-faint)",
                          minWidth: 44,
                        }}
                      >
                        {entry.cost_usd ? formatCost(entry.cost_usd) : "\u2014"}
                      </span>

                      {/* Duration */}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--text-xs)",
                          color: "var(--color-text-secondary)",
                          minWidth: 50,
                        }}
                      >
                        {entry.duration_seconds ? formatDuration(entry.duration_seconds) : "\u2014"}
                      </span>

                      {/* Detail */}
                      {entry.detail && (
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            fontWeight: 600,
                            color:
                              entry.detail === "APPROVED"
                                ? "var(--green-500)"
                                : entry.detail === "CHANGES_REQUESTED"
                                  ? "var(--orange-500)"
                                  : entry.detail === "PASS"
                                    ? "var(--green-500)"
                                    : entry.detail === "FAIL"
                                      ? "var(--red-500)"
                                      : "var(--color-text-muted)",
                          }}
                        >
                          {entry.detail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && entries && entries.length > 0 && (
          <div
            className="dialog-footer"
            style={{
              justifyContent: "center",
              gap: 16,
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {totalCost > 0 && (
              <span>
                Стоимость:{" "}
                <span style={{ color: "var(--green-500)", fontWeight: 600 }}>
                  {formatCost(totalCost)}
                </span>
              </span>
            )}
            {totalDuration > 0 && (
              <span>
                Время:{" "}
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {formatDuration(totalDuration)}
                </span>
              </span>
            )}
            {attemptText && (
              <span>{attemptText}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
