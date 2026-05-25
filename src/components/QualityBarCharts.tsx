import type { QualityFindingsDistribution, QualityErrorsDistribution } from "../types";

// ── Colors ──────────────────────────────────────────────────────────

const FINDING_COLORS = [
  "var(--mk-brand-500)",
  "var(--mk-purple-500)",
  "var(--mk-sky-500)",
  "var(--mk-success)",
  "var(--mk-severity-medium)",
  "var(--mk-danger)",
];

const ERROR_COLORS = [
  "var(--mk-danger)",
  "var(--mk-severity-medium)",
  "var(--mk-purple-500)",
  "var(--mk-brand-500)",
  "var(--mk-sky-500)",
  "var(--mk-success)",
];

// ── Helpers ─────────────────────────────────────────────────────────

function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

// ── Horizontal Bar Chart (CSS-based) ────────────────────────────────

interface BarChartProps {
  entries: [string, number][];
  colors: string[];
}

function HorizontalBarChart({ entries, colors }: BarChartProps) {
  if (entries.length === 0) {
    return <div className="qbc-empty">Нет данных</div>;
  }

  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="qbc-bars">
      {entries.map(([label, value], i) => {
        const pct = Math.max(2, (value / maxVal) * 100);
        const color = colors[i % colors.length];

        return (
          <div key={label} className="qbc-bar-row">
            <span className="qbc-bar-label">{label}</span>
            <div className="qbc-bar-track">
              <div
                className="qbc-bar-fill"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="qbc-bar-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Findings Chart ──────────────────────────────────────────────────

interface FindingsProps {
  data: QualityFindingsDistribution;
}

export function QualityFindingsChart({ data }: FindingsProps) {
  const entries = sortedEntries(data.categories);
  return <HorizontalBarChart entries={entries} colors={FINDING_COLORS} />;
}

// ── Errors Chart ────────────────────────────────────────────────────

interface ErrorsProps {
  data: QualityErrorsDistribution;
}

export function QualityErrorsChart({ data }: ErrorsProps) {
  const entries = sortedEntries(data.classes);
  return <HorizontalBarChart entries={entries} colors={ERROR_COLORS} />;
}
