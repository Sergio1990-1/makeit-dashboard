import type { QualityFindingsDistribution, QualityErrorsDistribution } from "../types";

// ── Shared bar chart constants ──────────────────────────────────────

const SVG_W = 480;
const BAR_H = 22;
const GAP = 6;
const LABEL_W = 140;
const BAR_AREA_W = SVG_W - LABEL_W - 50; // 50 for value text

// ── Colors ──────────────────────────────────────────────────────────

const FINDING_COLORS = [
  "var(--blue-500)",
  "var(--purple-500)",
  "var(--cyan-500)",
  "var(--green-500)",
  "var(--yellow-500)",
  "var(--red-500)",
];

const ERROR_COLORS = [
  "var(--red-500)",
  "var(--yellow-500)",
  "var(--purple-500)",
  "var(--blue-500)",
  "var(--cyan-500)",
  "var(--green-500)",
];

// ── Helpers ─────────────────────────────────────────────────────────

function truncateLabel(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

// ── Horizontal Bar Chart (shared) ───────────────────────────────────

interface BarChartProps {
  entries: [string, number][];
  colors: string[];
  ariaLabel: string;
}

function HorizontalBarChart({ entries, colors, ariaLabel }: BarChartProps) {
  if (entries.length === 0) {
    return <div className="qbc-empty">Нет данных</div>;
  }

  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const svgH = entries.length * (BAR_H + GAP) + GAP;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${svgH}`}
      className="qbc-svg"
      role="img"
      aria-label={ariaLabel}
    >
      {entries.map(([label, value], i) => {
        const y = GAP + i * (BAR_H + GAP);
        const barW = Math.max(2, (value / maxVal) * BAR_AREA_W);
        const color = colors[i % colors.length];

        return (
          <g key={label}>
            {/* Label */}
            <text x={LABEL_W - 8} y={y + BAR_H / 2 + 1} className="qbc-label">
              {truncateLabel(label)}
            </text>

            {/* Bar background */}
            <rect
              x={LABEL_W}
              y={y}
              width={BAR_AREA_W}
              height={BAR_H}
              rx={3}
              className="qbc-bar-bg"
            />

            {/* Bar fill */}
            <rect
              x={LABEL_W}
              y={y}
              width={barW}
              height={BAR_H}
              rx={3}
              fill={color}
              className="qbc-bar-fill"
            >
              <title>{`${label}: ${value}`}</title>
            </rect>

            {/* Value */}
            <text
              x={LABEL_W + BAR_AREA_W + 8}
              y={y + BAR_H / 2 + 1}
              className="qbc-value"
            >
              {value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Findings Chart ──────────────────────────────────────────────────

interface FindingsProps {
  data: QualityFindingsDistribution;
}

export function QualityFindingsChart({ data }: FindingsProps) {
  const entries = sortedEntries(data.categories);
  return (
    <div className="qbc-wrap">
      <HorizontalBarChart
        entries={entries}
        colors={FINDING_COLORS}
        ariaLabel="Quality findings by category"
      />
    </div>
  );
}

// ── Errors Chart ────────────────────────────────────────────────────

interface ErrorsProps {
  data: QualityErrorsDistribution;
}

export function QualityErrorsChart({ data }: ErrorsProps) {
  const entries = sortedEntries(data.classes);
  return (
    <div className="qbc-wrap">
      <HorizontalBarChart
        entries={entries}
        colors={ERROR_COLORS}
        ariaLabel="Quality errors by class"
      />
    </div>
  );
}
