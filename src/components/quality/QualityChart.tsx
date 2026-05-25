import { useMemo, useRef } from "react";
import type { QualityBucket } from "../../types/quality";

/**
 * QualityChart — переиспользуемый чарт качества (main panel + mini в карточках).
 *
 * Префиксы CSS-классов (`.chart`, `.bar`, `.chart-tip` и т.д.) портированы из
 * прототипа `docs/superpowers/specs/quality-tab-prototype.html` и scoped
 * через `.v4-quality-tab` (см. `src/styles/v4-quality.css`).
 *
 * Перформанс-критичные решения (см. spec section "Перформанс-критичные правила"):
 *  - tooltip-структура создаётся один раз, на hover обновляются только textContent
 *    (refs → tipRefsObj), никаких `innerHTML = ...`;
 *  - dim non-hovered баров — через class toggle `is-hovering`/`is-active`, НЕ `:has()`;
 *  - height баров не анимируется (transition: height триггерит layout) —
 *    высоты выставляются в style на mount, на period switch DOM пересоздаётся;
 *  - hover-эффекты — только opacity / transform.
 *
 * Метрика (worst-wins, см. spec):
 *  - crit = with_p0 + with_p1_only     → красный сегмент (.bar-crit)
 *  - p2   = with_p2_only               → жёлтый сегмент (.bar-p2)
 *  - clean = total_pr - crit - p2      → голубой сегмент (.bar-clean)
 *  - has-p0: bucket с ≥1 P0 → постоянный gradient + topper-pill (main only)
 */

export interface QualityChartProps {
  buckets: QualityBucket[];
  labels: string[];
  compact: boolean;
  /** Окно скользящего среднего (баров). Дефолт: 7 для main, без overlay для compact. */
  rollingWindow?: number;
}

const LOW_SAMPLE = 8;

/** «Чистый PR» по новой метрике = без P0 и без P1. P2-нит не считается грязью.
 * Возвращает null если в бакете нет PR (чтобы не загрязнять rolling avg нулями). */
function cleanPct(b: QualityBucket): number | null {
  if (b.total_pr === 0) return null;
  const dirty = b.with_p0 + b.with_p1_only;
  return ((b.total_pr - dirty) / b.total_pr) * 100;
}

/** Скользящее среднее «% чистых PR» по последним `window` бакетам.
 * Пустые бакеты (нет PR) пропускаем — иначе выходные/праздники дают
 * ложные провалы в линии. Возвращаем null если в окне совсем нет данных. */
function computeRollingAvg(
  buckets: QualityBucket[],
  window: number,
): Array<number | null> {
  return buckets.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = buckets.slice(start, i + 1);
    const pcts = slice.map(cleanPct).filter((p): p is number => p !== null);
    if (pcts.length === 0) return null;
    return pcts.reduce((a, b) => a + b, 0) / pcts.length;
  });
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  if (n <= 200) return 200;
  return Math.ceil(n / 100) * 100;
}

interface TipRefs {
  label?: HTMLElement;
  total?: HTMLElement;
  clean?: HTMLElement;
  p2?: HTMLElement;
  p1?: HTMLElement;
  p0?: HTMLElement;
  dirty?: HTMLElement;
}

export function QualityChart({
  buckets,
  labels,
  compact,
  rollingWindow,
}: QualityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipRefsObj = useRef<TipRefs>({});

  const scale = useMemo(() => {
    const max = Math.max(1, ...buckets.map((b) => b.total_pr));
    return niceCeil(max);
  }, [buckets]);

  // Окно для скользящего среднего. Главный график: 7 (для 30d) / 3 (для 12w);
  // compact-мини в карточках overlay не показывает (мелко и шумно).
  const effectiveWindow = useMemo(() => {
    if (compact) return 0;
    if (rollingWindow !== undefined) return rollingWindow;
    return buckets.length >= 20 ? 7 : 3;
  }, [compact, rollingWindow, buckets.length]);

  const rollingAvgPct = useMemo(
    () => (effectiveWindow > 0 ? computeRollingAvg(buckets, effectiveWindow) : []),
    [buckets, effectiveWindow],
  );

  // Точки SVG-линии overlay: Y инвертирован (100% наверху), null значения
  // прерывают линию (выходные/пустые дни). Координаты в долях 0–1.
  const linePoints = useMemo(() => {
    if (effectiveWindow === 0 || buckets.length === 0) return "";
    const segments: string[] = [];
    let current: string[] = [];
    rollingAvgPct.forEach((pct, i) => {
      if (pct === null) {
        if (current.length > 1) segments.push(current.join(" "));
        current = [];
        return;
      }
      const x = ((i + 0.5) / buckets.length) * 100;
      const y = 100 - pct;
      current.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    });
    if (current.length > 1) segments.push(current.join(" "));
    return segments.join(" M ");
  }, [rollingAvgPct, buckets.length, effectiveWindow]);

  const latestRollingPct = useMemo(() => {
    for (let i = rollingAvgPct.length - 1; i >= 0; i--) {
      if (rollingAvgPct[i] !== null) return rollingAvgPct[i];
    }
    return null;
  }, [rollingAvgPct]);

  const handleEnter = (
    b: QualityBucket,
    label: string,
    barEl: HTMLDivElement,
  ) => {
    const tip = tipRef.current;
    const refs = tipRefsObj.current;
    if (!tip || !containerRef.current) return;

    const crit = b.with_p0 + b.with_p1_only;
    const clean = Math.max(0, b.total_pr - crit - b.with_p2_only);
    // Новая метрика «грязный» = только P0/P1 (P2-нит — фон, не блокирует ship).
    const dirtyPct =
      b.total_pr > 0 ? (crit / b.total_pr) * 100 : 0;

    // textContent only — no innerHTML (perf rule #4)
    if (refs.label) refs.label.textContent = label;
    if (refs.total) refs.total.textContent = String(b.total_pr);
    if (refs.clean) refs.clean.textContent = String(clean);
    if (refs.p2) refs.p2.textContent = String(b.with_p2_only);
    if (refs.p1) refs.p1.textContent = String(b.with_p1_only);
    if (refs.p0) refs.p0.textContent = String(b.with_p0);
    if (refs.dirty) refs.dirty.textContent = dirtyPct.toFixed(0) + "%";

    const cRect = containerRef.current.getBoundingClientRect();
    const bRect = barEl.getBoundingClientRect();
    const pctX =
      ((bRect.left + bRect.width / 2 - cRect.left) / cRect.width) * 100;

    if (compact) {
      // Compact: tooltip над баром, центрируется по X.
      tip.style.left = `${pctX}%`;
      tip.style.transform = "translateX(-50%)";
    } else {
      // Main: справа от бара, flip-left у правого края (>70%).
      const flipLeft = pctX > 70;
      tip.style.left = `calc(${pctX}% + 12px - ${flipLeft ? "208px" : "0px"})`;
    }
    tip.classList.add("show");
    containerRef.current.classList.add("is-hovering");
    barEl.classList.add("is-active");
  };

  const handleLeave = (barEl: HTMLDivElement) => {
    tipRef.current?.classList.remove("show");
    containerRef.current?.classList.remove("is-hovering");
    barEl.classList.remove("is-active");
  };

  return (
    <div ref={containerRef} className={compact ? "card-chart" : "chart"}>
      {!compact && (
        <div className="chart-axis">
          <span className="chart-axis-label" style={{ top: "-2px" }}>
            {scale}
          </span>
          <span
            className="chart-axis-label"
            style={{ top: "calc(50% - 6px)" }}
          >
            {Math.round(scale / 2)}
          </span>
        </div>
      )}

      {buckets.map((b, i) => {
        const total = b.total_pr;
        const heightPct = (total / scale) * 100;
        // worst-wins: P0+P1 объединены в crit (один красный сегмент)
        const critCount = b.with_p0 + b.with_p1_only;
        const cleanCount = Math.max(0, total - critCount - b.with_p2_only);
        const critPct = total > 0 ? (critCount / total) * heightPct : 0;
        const p2Pct = total > 0 ? (b.with_p2_only / total) * heightPct : 0;
        const cleanPct = heightPct - critPct - p2Pct;
        const lowSample = total > 0 && total < LOW_SAMPLE;
        const hasP0 = b.with_p0 > 0;

        const classNames = [
          "bar",
          lowSample ? "is-low-sample" : "",
          hasP0 ? "has-p0" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={`${labels[i] ?? "i"}-${i}`}
            className={classNames}
            ref={(el) => {
              if (!el) return;
              el.onmouseenter = () => handleEnter(b, labels[i], el);
              el.onmouseleave = () => handleLeave(el);
            }}
          >
            {!compact && hasP0 && (
              <div className="bar-topper-p0">P0:{b.with_p0}</div>
            )}
            <div className="bar-stack" style={{ height: `${heightPct}%` }}>
              {cleanPct > 0 && (
                <div
                  className="bar-clean"
                  style={{ height: `${(cleanCount / total) * 100}%` }}
                />
              )}
              {p2Pct > 0 && (
                <div
                  className="bar-p2"
                  style={{ height: `${(b.with_p2_only / total) * 100}%` }}
                />
              )}
              {critPct > 0 && (
                <div
                  className="bar-crit"
                  style={{ height: `${(critCount / total) * 100}%` }}
                />
              )}
            </div>
            {heightPct === 0 && <div className="bar-empty" />}
            <div className="bar-chip">
              {total} PR
              {hasP0 && (
                <>
                  {" · "}
                  <b style={{ color: "var(--mk-danger-100)" }}>P0:{b.with_p0}</b>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* SVG overlay: 7-day rolling avg «% чистых PR» (без P0/P1).
          Правая Y-ось 0–100%. Pointer-events: none — чтобы не ломать hover баров. */}
      {effectiveWindow > 0 && linePoints && (
        <>
          <svg
            className="chart-trend-overlay"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            {/* Опорные линии 50% и 100% — eдва видны, но дают шкалу */}
            <line
              x1="0" y1="50" x2="100" y2="50"
              stroke="var(--mk-line-soft, rgba(127,127,127,0.18))"
              strokeWidth="0.15"
              strokeDasharray="0.6 0.6"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={linePoints}
              fill="none"
              stroke="var(--mk-success-100, #16a34a)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.9"
            />
          </svg>
          {/* Правая Y-ось (0–100%) + бейдж с актуальным значением */}
          <div
            className="chart-trend-axis"
            style={{
              position: "absolute",
              right: -36,
              top: 0,
              bottom: 0,
              width: 32,
              fontFamily: "var(--mk-font-mono)",
              fontSize: 10,
              color: "var(--mk-success-100, #16a34a)",
              opacity: 0.85,
              pointerEvents: "none",
            }}
          >
            <div style={{ position: "absolute", top: -2 }}>100%</div>
            <div style={{ position: "absolute", top: "calc(50% - 6px)" }}>50%</div>
            <div style={{ position: "absolute", bottom: -2 }}>0%</div>
          </div>
          {latestRollingPct !== null && (
            <div
              className="chart-trend-badge"
              style={{
                position: "absolute",
                right: 4,
                top: `calc(${100 - latestRollingPct}% - 10px)`,
                padding: "2px 6px",
                background: "var(--mk-success-100, #16a34a)",
                color: "white",
                fontFamily: "var(--mk-font-mono)",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 4,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                transform: "translateY(-50%)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              }}
            >
              {latestRollingPct.toFixed(0)}% чистых · {effectiveWindow}
              {buckets.length >= 20 ? "д" : "нед"} avg
            </div>
          )}
        </>
      )}

      {/* Pre-created tooltip — refs обновляют только textContent (perf rule #4) */}
      <div
        ref={tipRef}
        className={`chart-tip ${compact ? "chart-tip--compact" : ""}`}
      >
        {compact ? (
          <>
            <div className="ct-line1">
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.label = el;
                }}
                className="ct-d"
              />
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.total = el;
                }}
                className="ct-v"
              />
              <span className="ct-u">PR</span>
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.dirty = el;
                }}
                className="ct-pct"
              />
            </div>
            <div className="ct-line2">
              <span className="ct-seg ct-p0-wrap">
                🔴<b
                  ref={(el) => {
                    if (el) tipRefsObj.current.p0 = el;
                  }}
                />
              </span>
              <span className="ct-seg">
                <i className="sw" style={{ background: "var(--mk-quality-p1)" }} />
                P1:
                <b
                  ref={(el) => {
                    if (el) tipRefsObj.current.p1 = el;
                  }}
                />
              </span>
              <span className="ct-seg">
                <i className="sw" style={{ background: "var(--mk-quality-p2)" }} />
                P2:
                <b
                  ref={(el) => {
                    if (el) tipRefsObj.current.p2 = el;
                  }}
                />
              </span>
              <span className="ct-seg">
                <i
                  className="sw"
                  style={{ background: "var(--mk-quality-clean-soft)" }}
                />
                clean:
                <b
                  ref={(el) => {
                    if (el) tipRefsObj.current.clean = el;
                  }}
                />
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              ref={(el) => {
                if (el) tipRefsObj.current.label = el;
              }}
              className="chart-tip-l"
            />
            <div className="chart-tip-row">
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.total = el;
                }}
                className="chart-tip-v"
              />
              <span className="chart-tip-u">PR в периоде</span>
            </div>
            <div className="chart-tip-foot">
              <span className="chart-tip-seg">
                <i
                  className="sw"
                  style={{ background: "var(--mk-quality-clean-soft)" }}
                />{" "}
                чистые
              </span>
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.clean = el;
                }}
                className="chart-tip-tr"
              />
            </div>
            <div className="chart-tip-foot chart-tip-foot--tight">
              <span className="chart-tip-seg">
                <i className="sw" style={{ background: "var(--mk-quality-p2)" }} /> P2
                only
              </span>
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.p2 = el;
                }}
                className="chart-tip-tr"
                style={{ color: "var(--mk-quality-p2-text)" }}
              />
            </div>
            <div className="chart-tip-foot chart-tip-foot--tight">
              <span className="chart-tip-seg">
                <i className="sw" style={{ background: "var(--mk-quality-p1)" }} /> P1
              </span>
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.p1 = el;
                }}
                className="chart-tip-tr"
                style={{ color: "var(--mk-quality-p1-text)" }}
              />
            </div>
            <div className="chart-tip-foot chart-tip-foot--tight">
              <span className="chart-tip-seg">
                <i className="sw" style={{ background: "var(--mk-quality-p0)" }} /> P0
                (blockers)
              </span>
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.p0 = el;
                }}
                className="chart-tip-tr"
                style={{ color: "var(--mk-quality-p0-text)" }}
              />
            </div>
            <div
              className="chart-tip-foot"
              style={{
                borderTop: "1px solid var(--mk-line-soft)",
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <span>% грязных</span>
              <span
                ref={(el) => {
                  if (el) tipRefsObj.current.dirty = el;
                }}
                className="chart-tip-tr"
                style={{ fontSize: 13 }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
