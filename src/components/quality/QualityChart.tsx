import { useMemo, useRef } from "react";
import type { QualityBucket } from "../../types/quality";
import {
  computeRollingAvg,
  lineColor,
  type FocusMode,
} from "./quality-trend";

// Re-export FocusMode для обратной совместимости — раньше тип жил здесь,
// внешние модули продолжают импортировать его из QualityChart.
export type { FocusMode } from "./quality-trend";

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
 *  - height баров анимируется ТОЛЬКО при смене focus-фильтра (~5 клик/сек max,
 *    30 баров — layout-cost копеечный). На period switch (30d↔12w) DOM
 *    пересоздаётся, transition там не запускается;
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
  /** Активный фильтр от KPI-плиток (только для main-чарта). */
  focus?: FocusMode;
}

const LOW_SAMPLE = 8;

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
  focus = "all",
}: QualityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipRefsObj = useRef<TipRefs>({});

  // В фильтр-режиме шкала Y должна отражать максимум выбранной метрики,
  // а не полный total_pr — иначе бары визуально крошечные на старой шкале,
  // и подпись «N/total» в chip не бьётся с тиками на оси.
  const scale = useMemo(() => {
    const valueOf = (b: QualityBucket): number => {
      switch (focus) {
        case "p0":
          return b.with_p0;
        case "p1":
          return b.with_p1_only;
        case "p2":
          return b.with_p2_only;
        case "dirty":
          return b.with_p0 + b.with_p1_only;
        case "all":
        default:
          return b.total_pr;
      }
    };
    const max = Math.max(1, ...buckets.map(valueOf));
    return niceCeil(max);
  }, [buckets, focus]);

  // Окно для скользящего среднего. Главный график: 7 (для 30d) / 3 (для 12w);
  // compact-мини в карточках overlay не показывает (мелко и шумно).
  const effectiveWindow = useMemo(() => {
    if (compact) return 0;
    if (rollingWindow !== undefined) return rollingWindow;
    return buckets.length >= 20 ? 7 : 3;
  }, [compact, rollingWindow, buckets.length]);

  const rollingAvgPct = useMemo(
    () =>
      effectiveWindow > 0
        ? computeRollingAvg(buckets, effectiveWindow, focus)
        : [],
    [buckets, effectiveWindow, focus],
  );

  const overlayColor = useMemo(() => lineColor(focus), [focus]);

  // Сегменты SVG-линии overlay: Y инвертирован (100% наверху), null значения
  // прерывают линию (выходные/пустые дни). Каждый сегмент — отдельный
  // <polyline>, чтобы корректно работать с gap'ами (атрибут `points` НЕ
  // понимает "M" moveto — это команда для <path d>). Одиночные точки
  // отдаются как `singlePoints` и рисуются <circle> — иначе единственный
  // нон-нул среди gap'ов остаётся невидимым.
  const { lineSegments, singlePoints } = useMemo(() => {
    type Pt = { x: number; y: number };
    const segs: Pt[][] = [];
    const dots: Pt[] = [];
    if (effectiveWindow === 0 || buckets.length === 0) {
      return { lineSegments: segs, singlePoints: dots };
    }
    let current: Pt[] = [];
    const flush = () => {
      if (current.length >= 2) segs.push(current);
      else if (current.length === 1) dots.push(current[0]);
      current = [];
    };
    rollingAvgPct.forEach((pct, i) => {
      if (pct === null) {
        flush();
        return;
      }
      current.push({
        x: ((i + 0.5) / buckets.length) * 100,
        y: 100 - pct,
      });
    });
    flush();
    return { lineSegments: segs, singlePoints: dots };
  }, [rollingAvgPct, buckets.length, effectiveWindow]);

  const hasLineData = lineSegments.length > 0 || singlePoints.length > 0;

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
        // worst-wins: P0+P1 объединены в crit (один красный сегмент)
        const critCount = b.with_p0 + b.with_p1_only;
        const cleanCount = Math.max(0, total - critCount - b.with_p2_only);
        const lowSample = total > 0 && total < LOW_SAMPLE;
        const hasP0 = b.with_p0 > 0;

        // Под фильтром оставляем ТОЛЬКО релевантный сегмент. Высота бара
        // в фильтр-моде = высоте этого сегмента (а не всего стека), чтобы
        // визуально бар «съезжал вниз» к baseline вместо парения в воздухе.
        type Seg = { kind: "clean" | "p2" | "crit"; count: number };
        const segments: Seg[] =
          focus === "all"
            ? [
                { kind: "clean", count: cleanCount },
                { kind: "p2", count: b.with_p2_only },
                { kind: "crit", count: critCount },
              ]
            : focus === "p2"
              ? [{ kind: "p2", count: b.with_p2_only }]
              : focus === "p0"
                ? [{ kind: "crit", count: b.with_p0 }]
                : focus === "p1"
                  ? [{ kind: "crit", count: b.with_p1_only }]
                  : /* dirty */ [{ kind: "crit", count: critCount }];

        // Effective height: в "all" — весь стек; под фильтром — сумма видимых
        // сегментов / scale. Так столбик растягивается ровно до значения
        // метрики и опускается к baseline, а не висит на верхней позиции.
        const effectiveCount = segments.reduce((a, s) => a + s.count, 0);
        const heightPct = (effectiveCount / scale) * 100;

        const classNames = [
          "bar",
          lowSample ? "is-low-sample" : "",
          hasP0 && focus !== "p2" ? "has-p0" : "",
        ]
          .filter(Boolean)
          .join(" ");

        // В фильтр-моде P0:N топпер виден только если он входит в выборку,
        // иначе ярлык про блокеры под фильтром «P2» сбивает с толку.
        const showP0Topper =
          !compact &&
          hasP0 &&
          (focus === "all" || focus === "p0" || focus === "dirty");

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
            {showP0Topper && (
              <div className="bar-topper-p0">P0:{b.with_p0}</div>
            )}
            <div
              className="bar-stack"
              style={{
                height: `${heightPct}%`,
                // Анимация роста/спадания бара при смене фильтра. cubic-bezier
                // и длительность подобраны к фейду сегментов и линии overlay,
                // чтобы переход воспринимался цельно. Изменение height
                // триггерит layout, но 30 баров — это копеечно.
                transition: "height 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {segments.map((seg) =>
                seg.count > 0 ? (
                  <div
                    key={seg.kind}
                    className={`bar-${seg.kind}`}
                    style={{
                      // Нормируем к effectiveCount, а не к total: в фильтр-моде
                      // в стеке только один сегмент, и он должен занимать 100%
                      // нового parent'а (а не свою долю от исходного total).
                      height: `${(seg.count / effectiveCount) * 100}%`,
                    }}
                  />
                ) : null,
              )}
            </div>
            {heightPct === 0 && <div className="bar-empty" />}
            <div className="bar-chip">
              {focus === "all" ? `${total} PR` : `${effectiveCount}/${total}`}
              {showP0Topper && (
                <>
                  {" · "}
                  <b style={{ color: "var(--mk-danger-100)" }}>P0:{b.with_p0}</b>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* SVG overlay: rolling-avg линия + опорные gridline'ы 0/50/100%.
          Текстовые подписи правой Y-оси НЕТ — они конфликтовали с числовой
          шкалой PR-count на той же стороне («200» + «100%» читались как
          «200 100%»). Шкала линии читается через бейдж в углу + два tick'а. */}
      {effectiveWindow > 0 && hasLineData && (
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
            {/* Gridline 100% (top) — на одном уровне с верхом chart-area,
                служит «ceiling» для линии чтобы было видно когда она прижата. */}
            <line
              x1="0" y1="0" x2="100" y2="0"
              stroke={overlayColor}
              strokeWidth="0.15"
              strokeDasharray="0.4 0.6"
              vectorEffect="non-scaling-stroke"
              opacity="0.3"
            />
            {/* Gridline 50% — мягкая, нейтральный цвет (не дублирует overlayColor). */}
            <line
              x1="0" y1="50" x2="100" y2="50"
              stroke="var(--mk-line-soft)"
              strokeWidth="0.15"
              strokeDasharray="0.6 0.6"
              vectorEffect="non-scaling-stroke"
            />
            {lineSegments.map((seg, idx) => (
              <polyline
                key={`seg-${idx}`}
                points={seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
                fill="none"
                stroke={overlayColor}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity="0.9"
              />
            ))}
            {singlePoints.map((p, idx) => (
              <circle
                key={`dot-${idx}`}
                cx={p.x}
                cy={p.y}
                r="0.6"
                fill={overlayColor}
                vectorEffect="non-scaling-stroke"
                opacity="0.9"
              />
            ))}
          </svg>
          {/* Бейдж с текущим значением rolling-avg рендерится в заголовке
              панели (QualitySummaryPanel) — там он никогда не перекрывает
              бары/topперы и доступен для drilldown'а вместе с метаданными
              периода. Здесь, в чарте, остаётся только линия + gridline'ы. */}
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
