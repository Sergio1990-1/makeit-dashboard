import { useEffect, useMemo, useRef, useState } from "react";
import type { OrphanIssueMeta } from "../../utils/github-actions";
import { ruDow, ruMonthShort } from "./milestones/utils";

interface Props {
  items: OrphanIssueMeta[];
  loading: boolean;
  /** Timestamp of the most recent successful scan; null while we have no data yet. */
  lastUpdated: Date | null;
}

// SVG viewBox dimensions — match ClosedChart30d so both panels feel like
// siblings under the same header style.
const W = 960;
const H = 320;
const PAD_L = 16;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 28;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

const DAYS = 30;
const DAY_MS = 86_400_000;

// How often the "обновлено N мин назад" label refreshes — same cadence as
// AIInsightsPanel for visual consistency.
const META_TICK_MS = 30_000;

// Skeleton placeholder count used during a cold load (no cached items yet).
const SKELETON_BARS = 30;

// Shift the tooltip card to the left of the cursor once the hover point
// crosses this fraction of the chart width — keeps the popover from
// clipping the right edge of the panel.
const TOOLTIP_FLIP_THRESHOLD = 0.7;

interface DayBucket {
  /** UTC midnight of the day. Used as React key + tooltip date source. */
  iso: string;
  /** Total orphan count active on this day. */
  count: number;
  /** Per-repo breakdown sorted desc — capped to top entries by the renderer. */
  byRepo: Array<{ repo: string; count: number }>;
}

// Returns N consecutive UTC midnights ending at *today's* UTC midnight.
// Anchoring to UTC keeps the chart stable across DST transitions and
// matches GitHub's `created_at` (which is also UTC).
function build30DayBuckets(items: OrphanIssueMeta[]): DayBucket[] {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets: DayBucket[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const dayMs = todayUtc - i * DAY_MS;
    // End-of-day cutoff: an issue created at 23:59 UTC counts on its own day.
    const cutoff = dayMs + DAY_MS - 1;
    const perRepo = new Map<string, number>();
    let count = 0;
    for (const it of items) {
      const created = new Date(it.created_at).getTime();
      if (Number.isFinite(created) && created <= cutoff) {
        count++;
        perRepo.set(it.repo, (perRepo.get(it.repo) ?? 0) + 1);
      }
    }
    const byRepo = [...perRepo.entries()]
      .map(([repo, c]) => ({ repo, count: c }))
      .sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo));
    buckets.push({ iso: new Date(dayMs).toISOString(), count, byRepo });
  }
  return buckets;
}

function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length < 2) return "";
  const out = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0x, p0y] = points[i - 1] ?? points[i];
    const [p1x, p1y] = points[i];
    const [p2x, p2y] = points[i + 1];
    const [p3x, p3y] = points[i + 2] ?? points[i + 1];
    const cp1x = p1x + (p2x - p0x) / 6;
    const cp1y = p1y + (p2y - p0y) / 6;
    const cp2x = p2x - (p3x - p1x) / 6;
    const cp2y = p2y - (p3y - p1y) / 6;
    out.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`);
  }
  return out.join(" ");
}

function formatRelativeTime(d: Date | null, now: number): string | null {
  if (!d) return null;
  const diffMs = now - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "только что";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `обновлено ${sec} сек назад`;
  const min = Math.round(sec / 60);
  if (min < 60) return `обновлено ${min} мин назад`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `обновлено ${hr} ч назад`;
  const days = Math.round(hr / 24);
  return `обновлено ${days} д назад`;
}

export function OrphanIssuesPanel({ items, loading, lastUpdated }: Props) {
  const buckets = useMemo(() => build30DayBuckets(items), [items]);
  const today = buckets[buckets.length - 1] ?? null;
  const totalToday = today?.count ?? 0;

  // Y-axis: 10% headroom above the peak, never below 1 (otherwise the line
  // sits flush against the top edge when count=0).
  const peak = useMemo(() => buckets.reduce((m, b) => Math.max(m, b.count), 0), [buckets]);
  const yMax = Math.max(peak, 1) * 1.1;

  const stepX = INNER_W / Math.max(1, buckets.length - 1);
  const xOf = (i: number) => PAD_L + i * stepX;
  const yOf = (v: number) => PAD_T + INNER_H - (v / yMax) * INNER_H;

  // 0→1 grow animation — drives the area-fill reveal and the line
  // dash-offset. Same easing as ClosedChart30d.
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const dur = 900;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      setT(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width;
    if (x < PAD_L || x > W - PAD_R) {
      setHover(null);
      return;
    }
    const idx = Math.max(0, Math.min(buckets.length - 1, Math.round((x - PAD_L) / stepX)));
    setHover(idx);
  };

  // Live "N мин назад" clock — ticks every 30s while mounted.
  const [metaTickMs, setMetaTickMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMetaTickMs(Date.now()), META_TICK_MS);
    return () => clearInterval(id);
  }, []);
  const meta = formatRelativeTime(lastUpdated, metaTickMs);

  const linePts = buckets.map((b, i) => [xOf(i), yOf(b.count)] as readonly [number, number]);
  const lineD = smoothPath(linePts);
  const areaD = lineD
    ? `${lineD} L ${xOf(buckets.length - 1)} ${PAD_T + INNER_H} L ${xOf(0)} ${PAD_T + INNER_H} Z`
    : "";
  const pathRef = useRef<SVGPathElement | null>(null);
  const [lineLen, setLineLen] = useState(0);
  useEffect(() => {
    if (pathRef.current) setLineLen(pathRef.current.getTotalLength());
  }, [lineD]);

  const grid = [0, 1, 2, 3].map((i) => PAD_T + (INNER_H / 3) * i);

  const showSkeleton = loading && items.length === 0;
  const showRefreshing = loading && items.length > 0;
  const isEmpty = !loading && items.length === 0;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          <svg
            style={{ width: 14, height: 14, color: "var(--v4-warn-700)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          Orphan-issues по портфелю
          <span className="v4-tag">30 дней · без milestone</span>
          {showRefreshing && <span className="v4-tag">обновляется…</span>}
        </div>
        <div className="v4-panel-meta">
          {totalToday > 0 ? `сейчас ${totalToday}` : meta ?? ""}
          {totalToday > 0 && meta ? ` · ${meta}` : ""}
        </div>
      </div>

      <div className="v4-closed-chart">
        {showSkeleton ? (
          <OrphanSkeleton />
        ) : isEmpty ? (
          <div className="v4-empty v4-ai-empty">
            Все issues распределены по milestones.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            style={{ display: "block", cursor: "crosshair" }}
          >
            {/* gridlines (3 dotted + 1 solid baseline) */}
            {grid.map((y, i) => (
              <line
                key={i}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                stroke="var(--v4-line-soft)"
                strokeWidth="1"
                strokeDasharray={i === grid.length - 1 ? "0" : "2 4"}
              />
            ))}

            {/* hover full-height column highlight */}
            {hover !== null && (
              <line
                x1={xOf(hover)}
                x2={xOf(hover)}
                y1={PAD_T - 4}
                y2={PAD_T + INNER_H}
                stroke="var(--v4-accent-700)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.55"
              />
            )}

            {/* area fill — opacity ramps with `t` so it fades in cleanly */}
            {areaD && (
              <path
                d={areaD}
                fill="var(--v4-accent-100)"
                opacity={t * 0.6}
              />
            )}

            {/* trend line — animated dash-reveal */}
            {lineD && (
              <path
                ref={pathRef}
                d={lineD}
                fill="none"
                stroke="var(--v4-accent-500)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={lineLen ? `${lineLen} ${lineLen}` : undefined}
                strokeDashoffset={lineLen ? lineLen * (1 - t) : 0}
              />
            )}

            {/* hover dot */}
            {hover !== null && (
              <circle
                cx={xOf(hover)}
                cy={yOf(buckets[hover].count)}
                r="4"
                fill="var(--v4-accent-700)"
                stroke="var(--v4-paper)"
                strokeWidth="2"
              />
            )}

            {/* X-axis: every 5th day */}
            {buckets.map((b, i) =>
              i % 5 === 0 || i === buckets.length - 1 ? (
                <text
                  key={`x-${b.iso}`}
                  x={xOf(i)}
                  y={H - 10}
                  textAnchor="middle"
                  fontFamily="var(--v4-mono)"
                  fontSize="10"
                  fill="var(--v4-ink-400)"
                >
                  {new Date(b.iso).getUTCDate()}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {/* Tooltip card on hover — flips to the left of cursor near the
            right edge so it can't clip out of the panel. */}
        {!showSkeleton && !isEmpty && hover !== null && buckets[hover] && (() => {
          const row = buckets[hover];
          const date = new Date(row.iso);
          const xFrac = xOf(hover) / W;
          const flipLeft = xFrac > TOOLTIP_FLIP_THRESHOLD;
          // Cap repo breakdown — long lists overflow the card, and the
          // long tail is rarely meaningful on a per-day count.
          const TOP_REPOS = 6;
          const repos = row.byRepo.slice(0, TOP_REPOS);
          const overflow = Math.max(0, row.byRepo.length - TOP_REPOS);
          return (
            <div
              className="v4-closed-tip"
              style={{
                left: `calc(${xFrac * 100}% + ${flipLeft ? "-220px" : "20px"})`,
              }}
            >
              <div className="v4-closed-tip-l">
                {ruDow(date)}, {date.getUTCDate()} {ruMonthShort(date)}.{" "}
                {date.getUTCFullYear()}
              </div>
              <div className="v4-closed-tip-row">
                <span className="v4-closed-tip-v">{row.count}</span>
                <span className="v4-closed-tip-u">
                  {row.count === 1 ? "orphan-issue" : "orphan-issues"}
                </span>
              </div>
              {repos.length > 0 && (
                <div className="v4-orphan-tip-list">
                  {repos.map((r) => (
                    <div key={r.repo} className="v4-orphan-tip-row">
                      <span className="v4-mono">{r.repo}</span>
                      <span className="v4-orphan-tip-c">{r.count}</span>
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="v4-orphan-tip-more">
                      и ещё {overflow} {overflow === 1 ? "репо" : "репо"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {!showSkeleton && !isEmpty && (
        <div className="v4-cc-legend">
          <span className="v4-cc-lg">
            <span
              className="v4-cc-sw"
              style={{ background: "var(--v4-accent-500)" }}
            />
            Orphan-issues (open, без milestone)
          </span>
          <span className="v4-cc-peak">
            пик за 30 дн.: <b>{peak}</b>
          </span>
        </div>
      )}
    </div>
  );
}

function OrphanSkeleton() {
  // Light shimmer placeholder — uses the existing v4-ai-skel keyframe so we
  // don't ship a second animation. Bars climb in a faux trend so the
  // placeholder reads as a chart, not a flat strip.
  return (
    <div className="v4-orphan-skel" aria-hidden>
      {Array.from({ length: SKELETON_BARS }).map((_, i) => {
        const h = 20 + Math.round(60 * (0.4 + 0.6 * (i / SKELETON_BARS)));
        return (
          <div
            key={i}
            className="v4-orphan-skel-bar"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}
