import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { Issue } from "../../../types";

interface Props {
  issues: Issue[];
}

// Rows: P1..P4 + "—" (no priority label). Columns: the three pipeline
// complexity buckets + "unclassified" (no complexity-* label). Every open
// issue falls into exactly one (row, col) pair, so the 5×4 grid partitions
// the open set with no overlap and no gaps — the cell sum always equals the
// open-issue count (verified by the totals row/column).
const PRIORITY_ROWS = ["P1", "P2", "P3", "P4", "—"] as const;
type PriorityRow = (typeof PRIORITY_ROWS)[number];

const COMPLEXITY_COLS = ["auto", "assisted", "manual", "unclassified"] as const;
type ComplexityCol = (typeof COMPLEXITY_COLS)[number];

const COL_LABEL: Record<ComplexityCol, string> = {
  auto: "auto",
  assisted: "assisted",
  manual: "manual",
  unclassified: "без классиф.",
};

// Row colour mirrors ProgressMatrix's priority palette; "—" (no priority)
// uses the muted ink tone, same as P4's neutral grey there.
const ROW_COLOR: Record<PriorityRow, string> = {
  P1: "#EF4444",
  P2: "#F79009",
  P3: "#2563EB",
  P4: "#94A0B8",
  "—": "#94A0B8",
};

function rowKey(issue: Issue): PriorityRow {
  return issue.priority ?? "—";
}

function colKey(issue: Issue): ComplexityCol {
  return issue.complexity ?? "unclassified";
}

interface MatrixModel {
  /** counts[row][col] — open-issue count per cell. */
  counts: Record<PriorityRow, Record<ComplexityCol, number>>;
  rowTotals: Record<PriorityRow, number>;
  colTotals: Record<ComplexityCol, number>;
  /** Largest single cell value — drives heat density. */
  cellMax: number;
  /** Sum of all cells == project open-issue count. */
  grandTotal: number;
}

function buildModel(issues: Issue[]): MatrixModel {
  const counts = {} as MatrixModel["counts"];
  const rowTotals = {} as MatrixModel["rowTotals"];
  const colTotals = {} as MatrixModel["colTotals"];
  for (const r of PRIORITY_ROWS) {
    counts[r] = {} as Record<ComplexityCol, number>;
    rowTotals[r] = 0;
    for (const c of COMPLEXITY_COLS) counts[r][c] = 0;
  }
  for (const c of COMPLEXITY_COLS) colTotals[c] = 0;

  let grandTotal = 0;
  for (const issue of issues) {
    // Open = not Done. Mirrors the open-issue definition used by the
    // priorityCounts aggregation in utils/github.ts.
    if (issue.status === "Done") continue;
    const r = rowKey(issue);
    const c = colKey(issue);
    counts[r][c] += 1;
    rowTotals[r] += 1;
    colTotals[c] += 1;
    grandTotal += 1;
  }

  let cellMax = 0;
  for (const r of PRIORITY_ROWS) {
    for (const c of COMPLEXITY_COLS) {
      if (counts[r][c] > cellMax) cellMax = counts[r][c];
    }
  }

  return { counts, rowTotals, colTotals, cellMax, grandTotal };
}

function cellStyle(val: number, max: number, color: string): CSSProperties {
  const t = max > 0 ? val / max : 0;
  return {
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 10,
    background:
      val === 0
        ? "transparent"
        : `color-mix(in oklab, ${color} ${Math.round(t * 55)}%, white)`,
    borderRadius: 4,
  };
}

function cellLabelColor(val: number, max: number): string {
  const t = max > 0 ? val / max : 0;
  if (val === 0) return "var(--v4-ink-300)";
  return t > 0.55 ? "#fff" : "var(--v4-ink-800)";
}

const GRID_COLUMNS = "70px repeat(4, 1fr) 70px";

const HEADER_CELL: CSSProperties = {
  padding: "8px 10px",
  fontFamily: "var(--v4-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--v4-ink-500)",
  textAlign: "right",
};

/**
 * Hub Overview task matrix: open issues by priority (rows) × pipeline
 * complexity (columns), counts per cell. Heat density mirrors the
 * "Прогресс проектов" matrix on the Dashboard (color-mix by the single
 * busiest cell). Zero new backend calls — computed purely from the
 * already-loaded project.issues[]. Empty cells render `0`; the totals
 * row/column make the cell-sum == open-issue invariant visible.
 */
export function TaskMatrix({ issues }: Props) {
  const model = useMemo(() => buildModel(issues), [issues]);

  return (
    <div className="v4-panel" style={{ gridColumn: "1 / -1" }}>
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Открытые задачи <span className="v4-tag">приоритет × сложность</span>
        </div>
        <div className="v4-panel-meta" style={{ color: "var(--v4-ink-500)" }}>
          плотность = доля от самой загруженной ячейки
        </div>
      </div>

      <div style={{ padding: "8px 14px 14px" }}>
        {/* Column header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLUMNS,
            gap: 6,
            alignItems: "center",
            borderBottom: "1px solid var(--v4-line-soft)",
            paddingBottom: 4,
            marginBottom: 4,
          }}
        >
          <div style={{ ...HEADER_CELL, textAlign: "left" }}>приор.</div>
          {COMPLEXITY_COLS.map((c) => (
            <div key={c} style={HEADER_CELL}>
              {COL_LABEL[c]}
            </div>
          ))}
          <div style={HEADER_CELL}>всего</div>
        </div>

        {/* Priority rows */}
        {PRIORITY_ROWS.map((r) => (
          <div
            key={r}
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLUMNS,
              gap: 6,
              alignItems: "center",
              padding: "3px 0",
            }}
          >
            <div
              className="num"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 10px",
                fontFamily: "var(--v4-mono)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--v4-ink-800)",
              }}
            >
              <i
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: ROW_COLOR[r],
                }}
              />
              {r}
            </div>

            {COMPLEXITY_COLS.map((c) => {
              const val = model.counts[r][c];
              return (
                <div key={c} style={cellStyle(val, model.cellMax, ROW_COLOR[r])}>
                  <span
                    className="num"
                    style={{
                      fontFamily: "var(--v4-mono)",
                      fontSize: 12,
                      fontWeight: model.cellMax > 0 && val / model.cellMax > 0.4 ? 700 : 500,
                      color: cellLabelColor(val, model.cellMax),
                    }}
                  >
                    {val}
                  </span>
                </div>
              );
            })}

            <div
              className="num"
              style={{
                fontFamily: "var(--v4-mono)",
                textAlign: "right",
                padding: "0 10px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--v4-ink-700)",
              }}
            >
              {model.rowTotals[r]}
            </div>
          </div>
        ))}

        {/* Totals row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRID_COLUMNS,
            gap: 6,
            alignItems: "center",
            borderTop: "1px solid var(--v4-line-soft)",
            paddingTop: 6,
            marginTop: 4,
          }}
        >
          <div
            style={{
              ...HEADER_CELL,
              textAlign: "left",
            }}
          >
            всего
          </div>
          {COMPLEXITY_COLS.map((c) => (
            <div
              key={c}
              className="num"
              style={{
                fontFamily: "var(--v4-mono)",
                textAlign: "right",
                paddingRight: 10,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--v4-ink-700)",
              }}
            >
              {model.colTotals[c]}
            </div>
          ))}
          <div
            className="num"
            style={{
              fontFamily: "var(--v4-mono)",
              textAlign: "right",
              padding: "0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--v4-ink-900)",
            }}
          >
            {model.grandTotal}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskMatrix;
