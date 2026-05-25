import { useState, useEffect, type ReactNode } from "react";
import { fetchQualitySnapshot } from "../utils/quality";
import type { QualitySnapshot } from "../types";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}с`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}м ${s}с`;
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м`;
}

function pctBar(value: number, color: string) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
    }}>
      <div style={{
        flex: 1,
        height: 6,
        borderRadius: 3,
        background: "var(--mk-paper)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          height: "100%",
          borderRadius: 3,
          background: color,
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{
        fontFamily: "var(--mk-font-mono)",
        fontSize: "var(--mk-text-xs)",
        fontWeight: 700,
        color,
        minWidth: 36,
        textAlign: "right",
      }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

interface QualityPanelProps {
  project: string;
}

export function QualityPanel({ project }: QualityPanelProps) {
  const [snapshot, setSnapshot] = useState<QualitySnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Microtask defer satisfies react-hooks/set-state-in-effect (sync
    // setState in effect body) while still clearing stale snapshot/error
    // before the new fetch resolves on project change.
    Promise.resolve().then(() => {
      if (!cancelled) {
        setSnapshot(null);
        setError(false);
      }
    });
    const load = async () => {
      try {
        const data = await fetchQualitySnapshot(project);
        if (!cancelled) { setSnapshot(data); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [project]);

  if (error || !snapshot) return null;

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "First pass rate",
      value: pctBar(
        snapshot.first_pass_success_rate * 100,
        snapshot.first_pass_success_rate >= 0.8 ? "var(--mk-success)" : snapshot.first_pass_success_rate >= 0.6 ? "var(--mk-warn)" : "var(--mk-danger)",
      ),
    },
    {
      label: "Ср. время",
      value: (
        <span style={{ fontFamily: "var(--mk-font-mono)", fontSize: "var(--mk-text-xs)", fontWeight: 600, color: "var(--mk-ink-900)" }}>
          {formatDuration(snapshot.avg_duration_sec)}
        </span>
      ),
    },
    {
      label: "Retry rate",
      value: pctBar(
        snapshot.retry_rate * 100,
        snapshot.retry_rate <= 0.15 ? "var(--mk-success)" : snapshot.retry_rate <= 0.3 ? "var(--mk-warn)" : "var(--mk-danger)",
      ),
    },
  ];

  if (snapshot.qa_pass_rate != null) {
    rows.push({
      label: "QA pass rate",
      value: pctBar(
        snapshot.qa_pass_rate * 100,
        snapshot.qa_pass_rate >= 0.9 ? "var(--mk-success)" : snapshot.qa_pass_rate >= 0.7 ? "var(--mk-warn)" : "var(--mk-danger)",
      ),
    });
  }

  if (snapshot.top_error_classes.length > 0) {
    rows.push({
      label: "Top ошибки",
      value: (
        <span style={{ fontSize: "var(--mk-text-xs)", color: "var(--mk-ink-600)" }}>
          {snapshot.top_error_classes.slice(0, 3).map(([cls, count]) => `${cls} (${count})`).join(", ")}
        </span>
      ),
    });
  }

  return (
    <div className="bento-panel span-6">
      <div className="bento-panel-title">
        Quality
        <span style={{ textTransform: "none", fontWeight: 400, fontSize: "var(--mk-text-xs)", color: "var(--mk-ink-500)" }}>
          {" "}за 7 дней
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: "var(--mk-text-xs)",
              color: "var(--mk-ink-500)",
              minWidth: 90,
              flexShrink: 0,
            }}>
              {row.label}
            </span>
            <div style={{ flex: 1 }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
