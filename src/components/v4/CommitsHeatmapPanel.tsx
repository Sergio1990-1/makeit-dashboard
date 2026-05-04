import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ProjectData } from "../../types";
import { getLastNDays } from "../../utils/dashboardMetrics";
import { ruDow, ruMonthShort } from "./milestones/utils";

interface IndexedStyle extends CSSProperties {
  "--i"?: number;
}

interface Props {
  projects: ProjectData[];
  /** Anchor for "last N days" — recomputed when data refreshes so the
      heatmap doesn't go stale if the dashboard is left open past midnight. */
  lastUpdated: Date | null;
}

const DAYS = 28;

function commitsWord(n: number): string {
  if (n === 0) return "нет коммитов";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "коммит";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "коммита";
  return "коммитов";
}

export function CommitsHeatmapPanel({ projects, lastUpdated }: Props) {
  const days = useMemo(
    () => getLastNDays(DAYS),
    // recompute on every refresh — `lastUpdated` is the wall-clock anchor
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastUpdated?.getTime()]
  );

  // Pick top-N projects by 28d total commits, but show at least all projects with any activity
  const rows = useMemo(() => {
    const enriched = projects.map((p) => {
      const cells = days.map((d) => p.commitActivity?.byDate?.[d] ?? 0);
      const total = cells.reduce((s, n) => s + n, 0);
      return { repo: p.repo, cells, total };
    });
    return enriched
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [projects, days]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  // Quantile-based 5-level buckets across all non-zero values for visual contrast
  const thresholds = useMemo(() => {
    const all = rows
      .flatMap((r) => r.cells)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const q = (p: number) => all[Math.floor(all.length * p)] ?? 0;
    return [q(0.25), q(0.5), q(0.75), q(0.9)] as const;
  }, [rows]);
  const levelOf = (v: number): 0 | 1 | 2 | 3 | 4 => {
    if (v === 0) return 0;
    if (v <= thresholds[0]) return 1;
    if (v <= thresholds[1]) return 2;
    if (v <= thresholds[2]) return 3;
    return 4;
  };

  // Cascade reveal: rows + cells (left-to-right inside each row)
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 600 + 80 * Math.max(rows.length, 1);
    const tick = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      setProgress(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rows.length, days.length]);

  const rowAlpha = (i: number) => {
    const start = i * 0.08;
    return Math.max(0, Math.min(1, (progress - start) / 0.4));
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  // Hover keyed by repo name + col index. Repo name is stable across re-sorts;
  // a row index would point to a different project after data refresh.
  const [hover, setHover] = useState<{ repo: string; col: number } | null>(null);
  const hoveredRow = hover ? rows.find((r) => r.repo === hover.repo) : null;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Активность · коммиты по дням <span className="v4-tag">{DAYS} дней</span>
        </div>
        <div className="v4-panel-meta">
          всего {grandTotal} {commitsWord(grandTotal)}
        </div>
      </div>
      <div
        className="v4-heat-strip"
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {rows.length === 0 || grandTotal === 0 ? (
          <div className="v4-empty">Нет активности за {DAYS} дней</div>
        ) : (
          rows.map((row, rowIdx) => {
            const a = rowAlpha(rowIdx);
            const isRowHover = hover?.repo === row.repo;
            const rowStyle: IndexedStyle = {
              "--i": rowIdx,
              opacity: a,
              transform: `translateX(${(1 - a) * -12}px)`,
            };
            return (
              <div
                key={row.repo}
                className={`v4-commit-row${isRowHover ? " is-on" : ""}`}
                style={rowStyle}
                onMouseMove={(e) => {
                  // Handler lives on the row (not on .v4-commit-cells) so it
                  // fires even when the cursor is over the row's padding,
                  // project name, or total — keeping the tooltip in sync
                  // when moving vertically between rows. mouseenter-per-cell
                  // was unreliable: React's synthetic mouseenter polyfill
                  // dropped events on fast moves and competed with cell
                  // transforms, leaving the tooltip stuck on a stale cell.
                  const cellsEl = e.currentTarget.querySelector(
                    ".v4-commit-cells",
                  ) as HTMLElement | null;
                  if (!cellsEl) return;
                  const rect = cellsEl.getBoundingClientRect();
                  if (rect.width <= 0) return;
                  const ratio = (e.clientX - rect.left) / rect.width;
                  const next = Math.max(
                    0,
                    Math.min(DAYS - 1, Math.floor(ratio * DAYS)),
                  );
                  if (hover?.repo !== row.repo || hover?.col !== next) {
                    setHover({ repo: row.repo, col: next });
                  }
                }}
              >
                <span className="v4-nm">{row.repo}</span>
                <div className="v4-commit-cells">
                  {row.cells.map((count, colIdx) => {
                    const lv = levelOf(count);
                    const isHover =
                      hover?.repo === row.repo && hover?.col === colIdx;
                    const inAxis =
                      hover && (hover.repo === row.repo || hover.col === colIdx);
                    const cellProg = Math.max(
                      0,
                      Math.min(1, a * 1.4 - (colIdx / DAYS) * 0.5)
                    );
                    const cellOpacity = hover
                      ? isHover || inAxis
                        ? 1
                        : 0.4
                      : 1;
                    const cellStyle: IndexedStyle = {
                      "--i": colIdx,
                      opacity: cellOpacity * cellProg,
                      transform: `scaleX(${0.4 + 0.6 * cellProg})`,
                      transformOrigin: "left center",
                    };
                    return (
                      <div
                        key={colIdx}
                        className={`v4-cc-wrap${
                          hover?.col === colIdx && !isHover
                            ? " v4-cc-wrap--col"
                            : ""
                        }`}
                      >
                        <div
                          className={`v4-cc${isHover ? " is-hover" : ""}`}
                          data-v={lv > 0 ? String(lv) : undefined}
                          style={cellStyle}
                        />
                      </div>
                    );
                  })}
                </div>
                <span className="v4-tot">{row.total}</span>
              </div>
            );
          })
        )}

        {hover &&
          hoveredRow &&
          (() => {
            const r = hoveredRow;
            const v = r.cells[hover.col];
            const day = days[hover.col];
            const date = new Date(day);
            const rect = containerRef.current?.getBoundingClientRect();
            const tipW = 200;
            const flipX = rect ? mouse.x + tipW + 16 > rect.width : false;
            const left = flipX ? mouse.x - tipW - 12 : mouse.x + 14;
            const top = mouse.y - 8;
            return (
              <div
                className="v4-heat-tip"
                style={{ left, top, width: tipW }}
              >
                <div className="v4-heat-tip-t">{r.repo}</div>
                <div className="v4-heat-tip-d">
                  {ruDow(date)}, {date.getDate()} {ruMonthShort(date)}.
                </div>
                <div className="v4-heat-tip-row">
                  <span
                    className={
                      v === 0 ? "v4-heat-tip-v v4-heat-tip-v--zero" : "v4-heat-tip-v"
                    }
                  >
                    {v}
                  </span>
                  <span className="v4-heat-tip-u">{commitsWord(v)}</span>
                </div>
              </div>
            );
          })()}
      </div>
      {rows.length > 0 && grandTotal > 0 && (
        <div className="v4-heat-foot">
          <div className="v4-heat-range">
            {(() => {
              const first = new Date(days[0]);
              const last = new Date(days[days.length - 1]);
              return `${first.getDate()} ${ruMonthShort(first)}. — ${last.getDate()} ${ruMonthShort(last)}.`;
            })()}
          </div>
          <div className="v4-heat-legend">
            реже
            {[1, 2, 3, 4].map((lv) => (
              <span
                key={lv}
                className="v4-heat-legend-sw"
                data-v={String(lv)}
              />
            ))}
            чаще
          </div>
        </div>
      )}
    </div>
  );
}
