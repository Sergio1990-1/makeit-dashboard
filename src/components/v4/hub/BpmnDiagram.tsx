import { useMemo } from "react";
import type { BpNode, BpProcess } from "../../../types/bizProcess";

/**
 * Deterministic, layout-free BPMN-lite renderer (Project Hub →
 * Бизнес-процессы). All geometry is derived from `lane` + `col`; the YAML
 * carries NO pixel coordinates. Pure presentational — no data fetching,
 * no state. House style matches makeit-process-map.html; colours come from
 * v4 tokens via classes in src/styles/v4-bizproc.css (so light/dark both
 * work). Deterministic column/swimlane layout + Manhattan edge routing.
 */

interface Props {
  process: BpProcess;
}

// Geometry — kept in sync with the approved prototype.
const COLW = 176;
const LANEH = 116;
const PADX = 170; // swimlane-label gutter
const PADTOP = 14;
const TASK_W = 146;
const TASK_H = 56;
const R = 20; // event radius
const GW = 46; // gateway diamond size

function nodeHalf(n: BpNode): { w: number; h: number } {
  if (n.type === "start" || n.type === "end") return { w: R, h: R };
  if (n.type === "gateway") return { w: GW / 2, h: GW / 2 };
  return { w: TASK_W / 2, h: TASK_H / 2 };
}

/** Greedy word-wrap to fit `maxw` px at ~6.6px/char (12px Inter). */
function wrapText(txt: string, maxw: number): string[] {
  const words = txt.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).length * 6.6 > maxw && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function BpmnDiagram({ process }: Props) {
  const model = useMemo(() => {
    const laneIx = new Map<string, number>();
    process.lanes.forEach((l, i) => laneIx.set(l.id, i));
    const maxCol = process.nodes.reduce((m, n) => Math.max(m, n.col), 0);
    const W = PADX + (maxCol + 1) * COLW + 40;
    const H = PADTOP + process.lanes.length * LANEH + 10;

    const pos = new Map<string, { x: number; y: number; n: BpNode }>();
    for (const n of process.nodes) {
      const x = PADX + n.col * COLW + COLW / 2;
      const y = PADTOP + (laneIx.get(n.lane) ?? 0) * LANEH + LANEH / 2;
      pos.set(n.id, { x, y, n });
    }

    interface EdgeViz {
      key: string;
      d: string;
      warn: boolean;
      label?: { x: number; y: number; text: string; warn: boolean };
    }
    const edges: EdgeViz[] = [];
    process.flows.forEach((f, i) => {
      const a = pos.get(f.from);
      const b = pos.get(f.to);
      if (!a || !b) return;
      const back = b.x <= a.x;
      const warn = /переделка|повтор/.test(f.label ?? "") && back;
      const ah = nodeHalf(a.n);
      const bh = nodeHalf(b.n);
      const ax = a.x + (back ? 0 : ah.w);
      const ay = a.y;
      const bx = b.x - (back ? 0 : bh.w) - 2;
      const by = b.y;
      let d: string;
      if (back) {
        const dip = Math.max(a.y, b.y) + LANEH / 2 - 18;
        d = `M ${a.x} ${a.y + ah.h} V ${dip} H ${b.x} V ${b.y + bh.h}`;
      } else if (Math.abs(ay - by) < 2) {
        d = `M ${ax} ${ay} H ${bx}`;
      } else {
        const midx = ax + (bx - ax) / 2;
        d = `M ${ax} ${ay} H ${midx} V ${by} H ${bx}`;
      }
      let label: EdgeViz["label"];
      if (f.label) {
        const lx = back ? (a.x + b.x) / 2 : (ax + bx) / 2;
        const ly = back
          ? Math.max(a.y, b.y) + LANEH / 2 - 18
          : (ay + by) / 2 - (ay === by ? 12 : 0);
        label = { x: lx, y: ly, text: f.label, warn };
      }
      edges.push({ key: `e${i}`, d, warn, label });
    });

    return { laneIx, W, H, pos, edges, maxCol };
  }, [process]);

  const { W, H, pos, edges } = model;

  return (
    <div className="v4-bp-canvas">
      <svg
        className="v4-bp-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`Диаграмма бизнес-процесса: ${process.name}`}
      >
        <defs>
          <marker
            id="v4-bp-arr"
            markerWidth="9"
            markerHeight="7"
            refX="8"
            refY="3.5"
            orient="auto"
          >
            <polygon className="v4-bp-arrhead" points="0 0, 9 3.5, 0 7" />
          </marker>
          <marker
            id="v4-bp-arr-w"
            markerWidth="9"
            markerHeight="7"
            refX="8"
            refY="3.5"
            orient="auto"
          >
            <polygon
              className="v4-bp-arrhead v4-bp-arrhead--warn"
              points="0 0, 9 3.5, 0 7"
            />
          </marker>
        </defs>

        {/* swimlane bands + labels */}
        {process.lanes.map((l, i) => {
          const y = PADTOP + i * LANEH;
          return (
            <g key={`lane-${l.id}`}>
              <rect
                x={0}
                y={y}
                width={W}
                height={LANEH}
                className={`v4-bp-lane${i % 2 ? " v4-bp-lane--alt" : ""}`}
              />
              <rect
                x={0}
                y={y}
                width={PADX - 22}
                height={LANEH}
                className="v4-bp-lane-gutter"
              />
              <text
                x={24}
                y={y + LANEH / 2}
                className="v4-bp-lane-label"
                dominantBaseline="middle"
              >
                {l.name}
              </text>
            </g>
          );
        })}

        {/* flows (under nodes) */}
        {edges.map((e) => (
          <g key={e.key}>
            <path
              d={e.d}
              className={`v4-bp-flow${e.warn ? " v4-bp-flow--warn" : ""}`}
              markerEnd={`url(#${e.warn ? "v4-bp-arr-w" : "v4-bp-arr"})`}
            />
            {e.label && (
              <>
                <rect
                  x={e.label.x - (e.label.text.length * 6.4 + 12) / 2}
                  y={e.label.y - 9}
                  width={e.label.text.length * 6.4 + 12}
                  height={18}
                  rx={4}
                  className="v4-bp-flbl-bg"
                />
                <text
                  x={e.label.x}
                  y={e.label.y + 1}
                  className={`v4-bp-flbl${
                    e.label.warn ? " v4-bp-flbl--warn" : ""
                  }`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {e.label.text}
                </text>
              </>
            )}
          </g>
        ))}

        {/* nodes */}
        {process.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const { x, y } = p;
          if (n.type === "start" || n.type === "end") {
            return (
              <g key={n.id} className="v4-bp-node">
                <title>{n.name}</title>
                <circle
                  cx={x}
                  cy={y}
                  r={R}
                  className={`v4-bp-ev v4-bp-ev--${n.type}`}
                />
                <text
                  x={x}
                  y={y + R + 15}
                  className="v4-bp-ncap"
                  textAnchor="middle"
                >
                  {n.name}
                </text>
              </g>
            );
          }
          if (n.type === "gateway") {
            return (
              <g key={n.id} className="v4-bp-node">
                <title>{n.name}</title>
                <polygon
                  className="v4-bp-gw"
                  points={`${x},${y - GW / 2} ${x + GW / 2},${y} ${x},${
                    y + GW / 2
                  } ${x - GW / 2},${y}`}
                />
                <text
                  x={x}
                  y={y + 1}
                  className="v4-bp-gw-x"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ×
                </text>
                <text
                  x={x}
                  y={y + GW / 2 + 15}
                  className="v4-bp-ncap"
                  textAnchor="middle"
                >
                  {n.name}
                </text>
              </g>
            );
          }
          // task
          const sys = !!n.sub;
          const lines = wrapText(n.name, TASK_W - 18);
          const startY = y - (n.sub ? 6 : 0) - (lines.length - 1) * 7;
          return (
            <g key={n.id} className="v4-bp-node">
              <title>{n.sub ? `${n.name} · ${n.sub}` : n.name}</title>
              <g className="v4-bp-task-wrap">
                <rect
                  x={x - TASK_W / 2}
                  y={y - TASK_H / 2}
                  width={TASK_W}
                  height={TASK_H}
                  rx={9}
                  className={`v4-bp-task${sys ? " v4-bp-task--sys" : ""}`}
                />
                {lines.map((ln, li) => (
                  <text
                    key={li}
                    x={x}
                    y={startY + li * 14}
                    className="v4-bp-ntext"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {ln}
                  </text>
                ))}
                {n.sub && (
                  <text
                    x={x}
                    y={y + 15}
                    className="v4-bp-nsub"
                    textAnchor="middle"
                  >
                    {n.sub}
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default BpmnDiagram;
