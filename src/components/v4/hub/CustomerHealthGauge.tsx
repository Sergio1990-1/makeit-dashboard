import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeHealth,
  clearHealthCache,
  type CustomerHealthResult,
} from "../../../utils/customerHealthScore";
import type { ProjectTier } from "../../../utils/driftNorm";

/**
 * Customer Health gauge + 90-day sparkline (Epic-012 Task-07, FR-37).
 *
 * Self-contained: takes the repo (and optional tier / finance so the
 * cadence + paid components can be measured) and owns its own async
 * `computeHealth` call. The score is throttled to a weekly recompute
 * inside `customerHealthScore.ts`; the manual "Пересчитать" button
 * invalidates the cache and forces a fresh sentiment pass via Haiku.
 *
 * States:
 *   - loading  → spinner-ish placeholder (layout stays stable)
 *   - n/a      → "нет данных, требуется свежий транскрипт" placeholder
 *   - ready    → semicircle gauge tinted by zone + sparkline below
 *
 * Color zones (FR-37): 0–40 red, 40–70 yellow, 70–100 green. Boundary
 * convention: a value exactly on a boundary takes the HIGHER zone
 * (40 → yellow, 70 → green) so a "just reached 70" reads as green.
 */

interface Props {
  /** Repo slug (`owner/repo` or bare name → dashboard owner). */
  repo: string;
  /** Drift tier for the cadence baseline. Defaults to strictest (1). */
  tier?: ProjectTier;
  /** Contract size (USD) — drives the `paid` component. */
  budget?: number;
  /** Amount paid (USD) — drives the `paid` component. */
  paid?: number;
  /**
   * Bumped by the parent (e.g. NBA regeneration) to trigger a forced
   * recompute without the user clicking the button.
   */
  recomputeSignal?: number;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; result: CustomerHealthResult }
  | { phase: "error"; message: string };

/** Zone tone for a numeric score. Boundaries lean to the higher zone. */
function zoneOf(score: number): {
  color: string;
  bg: string;
  label: string;
} {
  if (score >= 70) {
    return { color: "var(--mk-success)", bg: "color-mix(in srgb, var(--mk-success) 12%, transparent)", label: "Здоровый" };
  }
  if (score >= 40) {
    return { color: "var(--mk-severity-medium)", bg: "color-mix(in srgb, var(--mk-severity-medium) 14%, transparent)", label: "Под наблюдением" };
  }
  return { color: "var(--mk-danger)", bg: "color-mix(in srgb, var(--mk-danger) 12%, transparent)", label: "Критичный" };
}

const GAUGE_W = 200;
const GAUGE_H = 110;
const CX = GAUGE_W / 2;
const CY = GAUGE_H - 6;
const R = 86;

/** Point on the gauge arc for `t` in `[0, 1]` (0 = left, 1 = right). */
function arcPoint(t: number): [number, number] {
  // Semicircle sweeps 180° (π) → 0°, left to right.
  const angle = Math.PI - t * Math.PI;
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

function arcPath(fromT: number, toT: number): string {
  const [x1, y1] = arcPoint(fromT);
  const [x2, y2] = arcPoint(toT);
  // largeArc=0, sweep=1 (clockwise as drawn left→right over the top).
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(
    2,
  )} ${y2.toFixed(2)}`;
}

const SPARK_W = 200;
const SPARK_H = 40;

/** Minimal sparkline — value range fixed to 0..100 so the line height
 *  is comparable across recomputes (not auto-fit to min/max). */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const stepX = values.length > 1 ? SPARK_W / (values.length - 1) : 0;
  const coords = values.map((v, i): [number, number] => {
    const clamped = Math.max(0, Math.min(100, v));
    return [
      values.length > 1 ? i * stepX : SPARK_W / 2,
      SPARK_H - (clamped / 100) * SPARK_H,
    ];
  });
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${SPARK_W} ${SPARK_H} L 0 ${SPARK_H} Z`;
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      width="100%"
      height={SPARK_H}
      role="img"
      aria-label={`Динамика здоровья за ${values.length} дней`}
    >
      <path d={area} fill={color} opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CustomerHealthGauge({
  repo,
  tier,
  budget,
  paid,
  recomputeSignal,
}: Props) {
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  const [recomputing, setRecomputing] = useState(false);
  // Bumped by the manual button to force a fresh (cache-busting) compute.
  const [forceToken, setForceToken] = useState(0);
  // Track which force/signal values were already consumed so a forced
  // recompute applies ONLY to its triggering bump — a later prop change
  // (repo/tier/budget/paid) must NOT inherit a stale `force` and burn an
  // unnecessary Claude call (it should take the throttled path instead).
  const consumedForce = useRef(0);
  const lastSignal = useRef(recomputeSignal);
  // Identity of the project currently reflected in `load`. When `repo`
  // changes we must drop straight to the loading state — keeping the
  // previous project's `ready` score on screen would mis-attribute it
  // to the new project for the duration of the (possibly multi-second)
  // recompute. A same-repo recompute still keeps the old gauge visible
  // so a minor refresh doesn't flash a spinner.
  const lastRepo = useRef(repo);

  useEffect(() => {
    let cancelled = false;
    // "Recompute now" iff this exact forceToken bump (manual button) or
    // recomputeSignal change (parent, e.g. NBA regen) hasn't been
    // consumed yet. Any other dependency change → throttled path.
    const forced =
      forceToken !== consumedForce.current ||
      recomputeSignal !== lastSignal.current;
    consumedForce.current = forceToken;
    lastSignal.current = recomputeSignal;

    const repoChanged = repo !== lastRepo.current;
    lastRepo.current = repo;

    setLoad((prev) =>
      prev.phase === "ready" && !repoChanged ? prev : { phase: "loading" },
    );

    (async () => {
      try {
        const result = await computeHealth(repo, {
          tier,
          budget,
          paid,
          force: forced,
        });
        if (cancelled) return;
        setLoad({ phase: "ready", result });
      } catch (e) {
        // computeHealth never throws by contract, but stay defensive so
        // the Hub render boundary is never hit.
        if (cancelled) return;
        const message =
          e instanceof Error ? e.message : "Не удалось рассчитать health";
        setLoad({ phase: "error", message });
      } finally {
        if (!cancelled) setRecomputing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repo, tier, budget, paid, forceToken, recomputeSignal]);

  const handleRecompute = useCallback(() => {
    setRecomputing(true);
    clearHealthCache(repo);
    setForceToken((t) => t + 1);
  }, [repo]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 10,
        background: "var(--mk-paper)",
        border: "1px solid var(--mk-line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: "var(--mk-ink-500)",
          }}
        >
          Здоровье клиента
        </div>
        <button
          type="button"
          className="v4-btn"
          onClick={handleRecompute}
          disabled={recomputing}
          title="Сбросить кэш и пересчитать sentiment через Claude Haiku"
        >
          {recomputing ? "Пересчёт…" : "Пересчитать"}
        </button>
      </div>

      {load.phase === "loading" && (
        <div
          style={{
            minHeight: GAUGE_H + SPARK_H + 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--mk-ink-500)",
            fontSize: 13,
          }}
        >
          Расчёт health…
        </div>
      )}

      {load.phase === "error" && (
        <div
          style={{
            minHeight: GAUGE_H,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--mk-danger)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {load.message}
        </div>
      )}

      {load.phase === "ready" && load.result.score === "n/a" && (
        <div
          style={{
            minHeight: GAUGE_H + SPARK_H + 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "var(--mk-ink-500)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.4 }}>—</div>
          <div>нет данных, требуется свежий транскрипт</div>
        </div>
      )}

      {load.phase === "ready" &&
        typeof load.result.score === "number" &&
        (() => {
          const score = load.result.score;
          const zone = zoneOf(score);
          const t = Math.max(0, Math.min(1, score / 100));
          const c = load.result.components;
          const fmt = (v: number | null) =>
            v === null ? "—" : Math.round(v).toString();
          return (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <svg
                  viewBox={`0 0 ${GAUGE_W} ${GAUGE_H}`}
                  width="100%"
                  height={GAUGE_H}
                  role="img"
                  aria-label={`Здоровье клиента: ${Math.round(score)} из 100, зона ${zone.label}`}
                >
                  {/* Track */}
                  <path
                    d={arcPath(0, 1)}
                    fill="none"
                    stroke="var(--mk-line-soft)"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  {/* Value arc (guard t≈0 so an empty arc isn't drawn) */}
                  {t > 0.001 && (
                    <path
                      d={arcPath(0, t)}
                      fill="none"
                      stroke={zone.color}
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                  )}
                  <text
                    x={CX}
                    y={CY - 14}
                    textAnchor="middle"
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      fill: zone.color,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Math.round(score)}
                  </text>
                  <text
                    x={CX}
                    y={CY + 4}
                    textAnchor="middle"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fill: "var(--mk-ink-500)",
                    }}
                  >
                    {zone.label}
                  </text>
                </svg>
              </div>

              <div style={{ padding: "0 4px" }}>
                <Sparkline
                  values={load.result.sparkline}
                  color={zone.color}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: "var(--mk-ink-400)",
                    marginTop: 2,
                  }}
                >
                  <span>90 дней назад</span>
                  <span>сегодня</span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                {(
                  [
                    ["Настроение", c.sentiment],
                    ["Ритм", c.cadence],
                    ["Поставка", c.delivery],
                    ["Оплата", c.paid],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    title={`${label}: ${fmt(value)}${value === null ? " (нет данных, учитывается как нейтральное)" : "/100"}`}
                    style={{
                      background: zone.bg,
                      borderRadius: 8,
                      padding: "6px 4px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        color: "var(--mk-ink-500)",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--mk-ink-900)",
                      }}
                    >
                      {fmt(value)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
    </div>
  );
}

export default CustomerHealthGauge;
