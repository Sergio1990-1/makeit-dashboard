import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import type { ProjectData } from "../../types";

interface Props {
  projects: ProjectData[];
}

type SortKey = "progress" | "closed" | "p1" | "p2" | "p3" | "p4" | "open" | "total";

const COL_ORDER: ReadonlyArray<SortKey> = [
  "progress",
  "closed",
  "p1",
  "p2",
  "p3",
  "p4",
  "open",
  "total",
];

const PRIORITY_COLOR: Record<"p1" | "p2" | "p3" | "p4", string> = {
  p1: "var(--mk-priority-p1)",
  p2: "var(--mk-priority-p2)",
  p3: "var(--mk-priority-p3)",
  p4: "var(--mk-priority-p4)",
};

interface Row {
  repo: string;
  progress: number; // 0..1
  closed: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  open: number;
  total: number;
}

function buildRow(p: ProjectData): Row {
  return {
    repo: p.repo,
    progress: Math.max(0, Math.min(1, p.progress / 100)),
    closed: p.doneCount,
    p1: p.priorityCounts.P1,
    p2: p.priorityCounts.P2,
    p3: p.priorityCounts.P3,
    p4: p.priorityCounts.P4,
    open: p.openCount,
    total: p.totalCount,
  };
}

function ringColor(pct: number): string {
  if (pct >= 0.8) return "var(--mk-success)";
  if (pct >= 0.4) return "var(--mk-primary)";
  if (pct > 0) return "var(--mk-warn)";
  return "var(--mk-danger)";
}

function Ring({ pct, anim }: { pct: number; anim: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const len = pct * c * anim;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--mk-line)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke={ringColor(pct)}
        strokeWidth="3"
        strokeDasharray={`${len} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
        style={{ transition: "stroke 0.2s" }}
      />
    </svg>
  );
}

interface CellProps {
  val: number;
  max: number;
  color: string;
  alpha: number;
  dimmed: boolean;
  focused: boolean;
}

interface SortHeaderProps {
  k: SortKey;
  label: string;
  color?: string;
  align?: "flex-start" | "flex-end";
  active: boolean;
  hovered: boolean;
  onSort: (k: SortKey) => void;
  onEnter: (k: SortKey) => void;
  onLeave: (k: SortKey) => void;
}

function SortHeader({
  k,
  label,
  color,
  align = "flex-end",
  active,
  hovered,
  onSort,
  onEnter,
  onLeave,
}: SortHeaderProps) {
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      onMouseEnter={() => onEnter(k)}
      onMouseLeave={() => onLeave(k)}
      style={{
        appearance: "none",
        border: 0,
        cursor: "pointer",
        background: active
          ? "var(--mk-surface-2)"
          : hovered
            ? "var(--mk-brand-50)"
            : "transparent",
        padding: "8px 10px",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: align,
        gap: 6,
        fontFamily: "var(--mk-font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: active ? "var(--mk-ink-900)" : "var(--mk-ink-500)",
        transition: "background .15s, color .15s",
      }}
    >
      {color && (
        <i
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
          }}
        />
      )}
      {label}
      {active && <span style={{ fontSize: 9 }}>↓</span>}
    </button>
  );
}

function PriorityCell({ val, max, color, alpha, dimmed, focused }: CellProps) {
  const t = max ? val / max : 0;
  const scale = 0.9 + 0.1 * alpha;
  const style: CSSProperties = {
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
    outline: focused ? `2px solid ${color}` : "none",
    outlineOffset: focused ? "-1px" : 0,
    opacity: alpha * (dimmed ? 0.4 : 1),
    transform: `scale(${scale})`,
    transformOrigin: "left center",
    transition: "opacity .18s, outline .15s, box-shadow .15s",
    boxShadow: focused ? "var(--mk-shadow-md)" : "none",
  };
  const labelColor =
    val === 0 ? "var(--mk-ink-300)" : t > 0.55 ? "#fff" : "var(--mk-ink-800)";
  return (
    <div style={style}>
      <span
        className="num"
        style={{
          fontFamily: "var(--mk-font-mono)",
          fontSize: 12,
          fontWeight: t > 0.4 ? 700 : 500,
          color: labelColor,
        }}
      >
        {val > 0 ? val : "·"}
      </span>
    </div>
  );
}

export function ProgressMatrix({ projects }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("open");
  const [hover, setHoverRaw] = useState<{ row: number | null; col: SortKey | null } | null>(null);
  const setHover = (
    next:
      | { row: number | null; col: SortKey | null }
      | null
      | ((prev: { row: number | null; col: SortKey | null } | null) => { row: number | null; col: SortKey | null } | null),
  ) => {
    setHoverRaw((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      if (!v) return null;
      if ((v.row === null || v.row === undefined) && (v.col === null || v.col === undefined)) return null;
      return v;
    });
  };

  const rowsRaw = useMemo(
    () => projects.filter((p) => p.totalCount > 0).map(buildRow),
    [projects],
  );

  const sorted = useMemo(() => {
    const arr = [...rowsRaw];
    if (sortKey === "progress") {
      arr.sort((a, b) => a.progress - b.progress);
    } else {
      arr.sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
    }
    return arr;
  }, [rowsRaw, sortKey]);

  const maxByPriority = useMemo(
    () => ({
      p1: Math.max(0, ...rowsRaw.map((r) => r.p1)),
      p2: Math.max(0, ...rowsRaw.map((r) => r.p2)),
      p3: Math.max(0, ...rowsRaw.map((r) => r.p3)),
      p4: Math.max(0, ...rowsRaw.map((r) => r.p4)),
    }),
    [rowsRaw],
  );
  const maxOpen = Math.max(0, ...rowsRaw.map((r) => r.open));
  const maxTotal = Math.max(0, ...rowsRaw.map((r) => r.total));

  // Cascade reveal 0..1
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 800;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      setProgress(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // FLIP re-sort
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevRects = useRef<Record<string, DOMRect>>({});
  useLayoutEffect(() => {
    Object.entries(rowRefs.current).forEach(([name, el]) => {
      if (!el) return;
      const newRect = el.getBoundingClientRect();
      const prev = prevRects.current[name];
      if (prev) {
        const dy = prev.top - newRect.top;
        if (Math.abs(dy) > 0.5) {
          el.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
            { duration: 400, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
        }
      }
      prevRects.current[name] = newRect;
    });
  }, [sorted]);

  const rowAlpha = (i: number) => {
    const lag = 0.06;
    const start = i * lag;
    return Math.max(0, Math.min(1, (progress - start) / 0.45));
  };
  const cellAlpha = (rowI: number, colI: number) => {
    const a = rowAlpha(rowI);
    return Math.max(0, Math.min(1, a * 1.4 - colI * 0.07));
  };
  const colIdx = (k: SortKey) => COL_ORDER.indexOf(k);

  if (rowsRaw.length === 0) {
    return (
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">
            Прогресс проектов <span className="v4-tag">матрица</span>
          </div>
        </div>
        <div className="v4-empty">Нет данных</div>
      </div>
    );
  }

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Прогресс проектов <span className="v4-tag">матрица</span>
        </div>
        <div
          className="v4-panel-meta"
          style={{ color: "var(--mk-ink-500)" }}
        >
          плотность = доля от макс по столбцу
        </div>
      </div>

      <div className="v4-pm-scroll">
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "170px 100px 70px repeat(4, 1fr) 70px 70px",
          padding: "4px 14px",
          borderBottom: "1px solid var(--mk-line-soft)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            fontFamily: "var(--mk-font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--mk-ink-500)",
          }}
        >
          проект
        </div>
        <SortHeader
          k="progress"
          label="готовность"
          align="flex-start"
          active={sortKey === "progress"}
          hovered={hover?.col === "progress"}
          onSort={setSortKey}
          onEnter={(k) => setHover((h) => ({ row: h?.row ?? null, col: k }))}
          onLeave={(k) => setHover((h) => (h?.col === k ? { row: h.row, col: null } : h))}
        />
        <div
          onMouseEnter={() => setHover((h) => ({ row: h?.row ?? null, col: "closed" }))}
          onMouseLeave={() =>
            setHover((h) => (h?.col === "closed" ? { row: h.row, col: null } : h))
          }
          style={{
            padding: "8px 10px",
            fontFamily: "var(--mk-font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--mk-ink-500)",
            textAlign: "right",
            background:
              hover?.col === "closed" ? "var(--mk-brand-50)" : "transparent",
            borderRadius: 6,
            transition: "background .15s",
          }}
        >
          closed
        </div>
        {(["p1", "p2", "p3", "p4"] as const).map((k) => (
          <SortHeader
            key={k}
            k={k}
            label={k.toUpperCase()}
            color={PRIORITY_COLOR[k]}
            active={sortKey === k}
            hovered={hover?.col === k}
            onSort={setSortKey}
            onEnter={(kk) => setHover((h) => ({ row: h?.row ?? null, col: kk }))}
            onLeave={(kk) =>
              setHover((h) => (h?.col === kk ? { row: h.row, col: null } : h))
            }
          />
        ))}
        <SortHeader
          k="open"
          label="open"
          active={sortKey === "open"}
          hovered={hover?.col === "open"}
          onSort={setSortKey}
          onEnter={(k) => setHover((h) => ({ row: h?.row ?? null, col: k }))}
          onLeave={(k) => setHover((h) => (h?.col === k ? { row: h.row, col: null } : h))}
        />
        <SortHeader
          k="total"
          label="всего"
          active={sortKey === "total"}
          hovered={hover?.col === "total"}
          onSort={setSortKey}
          onEnter={(k) => setHover((h) => ({ row: h?.row ?? null, col: k }))}
          onLeave={(k) => setHover((h) => (h?.col === k ? { row: h.row, col: null } : h))}
        />
      </div>

      <div
        onMouseLeave={() =>
          setHover((h) => (h ? { row: null, col: h.col } : null))
        }
        style={{ padding: "6px 14px 14px", position: "relative" }}
      >
        {sorted.map((d, rowI) => {
          const a = rowAlpha(rowI);
          const isRowHover = hover?.row === rowI;
          const isAnyHover = !!hover && (hover.row !== null || hover.col !== null);
          const dimRow = isAnyHover && !isRowHover && hover?.col === null;
          const isCellDim = (k: SortKey) => {
            if (!isAnyHover || !hover) return false;
            const inRow = hover.row === rowI;
            const inCol = hover.col === k;
            return !(inRow || inCol);
          };
          const isCellFocus = (k: SortKey) =>
            isRowHover && hover?.col === k;

          const openT = maxOpen ? d.open / maxOpen : 0;
          const openColor =
            openT < 0.5
              ? `color-mix(in oklab, var(--mk-success) ${Math.round((1 - openT * 2) * 100)}%, var(--mk-warn))`
              : `color-mix(in oklab, var(--mk-warn) ${Math.round((1 - (openT - 0.5) * 2) * 100)}%, var(--mk-danger))`;
          const openBg =
            d.open === 0
              ? "transparent"
              : `color-mix(in oklab, ${openColor} ${Math.round(18 + openT * 42)}%, white)`;

          const totalT = maxTotal ? d.total / maxTotal : 0;

          return (
            <div
              key={d.repo}
              ref={(el) => {
                rowRefs.current[d.repo] = el;
              }}
              onMouseEnter={() =>
                setHover((h) => ({ row: rowI, col: h?.col ?? null }))
              }
              onMouseLeave={() =>
                setHover((h) => (h?.row === rowI ? { row: null, col: h.col } : h))
              }
              style={{
                display: "grid",
                gridTemplateColumns: "170px 100px 70px repeat(4, 1fr) 70px 70px",
                gap: 6,
                alignItems: "center",
                padding: "3px 0",
                opacity: a,
                transform: `translateX(${(1 - a) * -14}px)`,
                background: isRowHover ? "var(--mk-surface-2)" : "transparent",
                borderRadius: 6,
                transition: "background .15s",
              }}
            >
              <div
                className="num"
                style={{
                  padding: "0 10px",
                  fontFamily: "var(--mk-font-mono)",
                  color: isRowHover ? "var(--mk-ink-900)" : "var(--mk-ink-800)",
                  fontSize: 13,
                  fontWeight: isRowHover ? 600 : 500,
                  opacity: dimRow ? 0.4 : 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  transition: "color .15s, opacity .18s",
                }}
              >
                {d.repo}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 10px",
                  opacity:
                    cellAlpha(rowI, colIdx("progress")) * (isCellDim("progress") ? 0.4 : 1),
                  transition: "opacity .18s",
                }}
              >
                <Ring pct={d.progress} anim={cellAlpha(rowI, colIdx("progress"))} />
                <span
                  className="num"
                  style={{
                    fontFamily: "var(--mk-font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--mk-ink-800)",
                  }}
                >
                  {Math.round(d.progress * 100)}%
                </span>
              </div>

              <div
                className="num"
                style={{
                  fontFamily: "var(--mk-font-mono)",
                  textAlign: "right",
                  padding: "0 10px",
                  color: "var(--mk-ink-600)",
                  fontSize: 12,
                  opacity:
                    cellAlpha(rowI, colIdx("closed")) * (isCellDim("closed") ? 0.4 : 1),
                  transition: "opacity .18s",
                }}
              >
                {d.closed}
              </div>

              <PriorityCell
                val={d.p1}
                max={maxByPriority.p1}
                color={PRIORITY_COLOR.p1}
                alpha={cellAlpha(rowI, colIdx("p1"))}
                dimmed={isCellDim("p1")}
                focused={isCellFocus("p1")}
              />
              <PriorityCell
                val={d.p2}
                max={maxByPriority.p2}
                color={PRIORITY_COLOR.p2}
                alpha={cellAlpha(rowI, colIdx("p2"))}
                dimmed={isCellDim("p2")}
                focused={isCellFocus("p2")}
              />
              <PriorityCell
                val={d.p3}
                max={maxByPriority.p3}
                color={PRIORITY_COLOR.p3}
                alpha={cellAlpha(rowI, colIdx("p3"))}
                dimmed={isCellDim("p3")}
                focused={isCellFocus("p3")}
              />
              <PriorityCell
                val={d.p4}
                max={maxByPriority.p4}
                color={PRIORITY_COLOR.p4}
                alpha={cellAlpha(rowI, colIdx("p4"))}
                dimmed={isCellDim("p4")}
                focused={isCellFocus("p4")}
              />

              <div
                className="num"
                style={{
                  fontFamily: "var(--mk-font-mono)",
                  textAlign: "right",
                  padding: "0 6px",
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  background: openBg,
                  borderRadius: 4,
                  outline: isCellFocus("open") ? `2px solid ${openColor}` : "none",
                  outlineOffset: isCellFocus("open") ? "-1px" : 0,
                  color:
                    openT > 0.7
                      ? "var(--mk-danger-strong)"
                      : openT > 0.35
                        ? "var(--mk-warn-strong)"
                        : "var(--mk-ink-800)",
                  fontSize: 12,
                  fontWeight: openT > 0.4 ? 700 : 600,
                  opacity:
                    cellAlpha(rowI, colIdx("open")) * (isCellDim("open") ? 0.4 : 1),
                  transform: `scale(${0.9 + 0.1 * cellAlpha(rowI, colIdx("open"))})`,
                  transformOrigin: "left center",
                  transition: "opacity .18s, outline .15s, box-shadow .15s",
                  boxShadow: isCellFocus("open")
                    ? "var(--mk-shadow-md)"
                    : "none",
                }}
              >
                {d.open || "·"}
              </div>

              <div
                className="num"
                style={{
                  fontFamily: "var(--mk-font-mono)",
                  textAlign: "right",
                  padding: "0 6px",
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  background: `color-mix(in oklab, var(--mk-ink-900) ${Math.round(totalT * 45)}%, white)`,
                  borderRadius: 4,
                  outline: isCellFocus("total") ? "2px solid var(--mk-ink-900)" : "none",
                  outlineOffset: isCellFocus("total") ? "-1px" : 0,
                  color:
                    totalT > 0.55
                      ? "#fff"
                      : isRowHover
                        ? "var(--mk-ink-900)"
                        : "var(--mk-ink-800)",
                  fontSize: 13,
                  fontWeight: 700,
                  opacity:
                    cellAlpha(rowI, colIdx("total")) * (isCellDim("total") ? 0.4 : 1),
                  transform: `scale(${0.9 + 0.1 * cellAlpha(rowI, colIdx("total"))})`,
                  transformOrigin: "left center",
                  transition:
                    "opacity .18s, outline .15s, box-shadow .15s, color .15s",
                  boxShadow: isCellFocus("total")
                    ? "var(--mk-shadow-md)"
                    : "none",
                }}
              >
                {d.total}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
