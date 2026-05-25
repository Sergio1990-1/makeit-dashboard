import type { QualityFindingsDistribution, QualityErrorsDistribution } from "../../../types";

const PALETTE = [
  "var(--mk-brand-500)",
  "var(--mk-purple-500)",
  "var(--mk-sky-500)",
  "var(--mk-success)",
  "var(--mk-warn)",
  "var(--mk-danger)",
];

function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

function HBars({ entries }: { entries: [string, number][] }) {
  if (entries.length === 0) {
    return <div className="v4-empty">Нет данных</div>;
  }
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="v4-qa-bars">
      {entries.map(([label, value], i) => {
        const widthPct = Math.max(2, (value / maxVal) * 100);
        const color = PALETTE[i % PALETTE.length];
        return (
          <div key={label} className="v4-qa-bar-row">
            <span className="v4-qa-bar-label" title={label}>
              {label}
            </span>
            <div className="v4-qa-bar-track">
              <div className="v4-qa-bar-fill" style={{ width: `${widthPct}%`, background: color }} />
            </div>
            <span className="v4-qa-bar-value v4-pl-mono">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FindingsBarChart({ data }: { data: QualityFindingsDistribution }) {
  return <HBars entries={sortedEntries(data.categories)} />;
}

export function ErrorsBarChart({ data }: { data: QualityErrorsDistribution }) {
  return <HBars entries={sortedEntries(data.classes)} />;
}
