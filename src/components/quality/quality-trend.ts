/**
 * Pure data-utility module for the rolling-avg «trend line» on QualityChart.
 *
 * Lives outside QualityChart.tsx because ESLint's
 * `react-refresh/only-export-components` bans non-component exports from
 * component files. Two consumers — QualityChart (renders the line) and
 * QualitySummaryPanel (renders the badge in the panel title) — both
 * compute over the same series and need the same color/label mapping.
 *
 * `bucketPct` is the per-bucket percentage selector, `computeRollingAvg`
 * smooths it over a window, `lineColor` / `badgeLabel` map the active
 * focus filter to its display color and noun.
 */
import type { QualityBucket } from "../../types/quality";

/** Какой срез данных подсвечивать. Управляется кликом по KPI-плиткам:
 * "all" = дефолт (стек целиком + линия %-чистых), остальные изолируют
 * один сегмент бара и переключают линию overlay на эту метрику. */
export type FocusMode = "all" | "p0" | "p1" | "p2" | "dirty";

/** Извлекает значение для конкретной метрики из бакета.
 * Возвращает null если бакет пустой — пропускаем такие точки в rolling avg
 * (выходные/праздники иначе дают ложные провалы линии). */
export function bucketPct(b: QualityBucket, mode: FocusMode): number | null {
  if (b.total_pr === 0) return null;
  switch (mode) {
    case "p0":
      return (b.with_p0 / b.total_pr) * 100;
    case "p1":
      return (b.with_p1_only / b.total_pr) * 100;
    case "p2":
      return (b.with_p2_only / b.total_pr) * 100;
    case "dirty":
      return ((b.with_p0 + b.with_p1_only) / b.total_pr) * 100;
    case "all":
    default:
      // % чистых = без P0/P1. P2-нит не делает PR «грязным».
      return ((b.total_pr - b.with_p0 - b.with_p1_only) / b.total_pr) * 100;
  }
}

export function lineColor(mode: FocusMode): string {
  switch (mode) {
    case "p0":
      return "var(--mk-quality-p0)";
    case "p1":
      return "var(--mk-quality-p1)";
    case "p2":
      return "var(--mk-quality-p2)";
    case "dirty":
      return "var(--mk-danger-100)";
    case "all":
    default:
      return "var(--mk-success-100)";
  }
}

export function badgeLabel(mode: FocusMode): string {
  switch (mode) {
    case "p0":
      return "с P0";
    case "p1":
      return "с P1";
    case "p2":
      return "с P2";
    case "dirty":
      return "грязных";
    case "all":
    default:
      return "чистых";
  }
}

/** Скользящее среднее выбранной метрики по последним `window` бакетам.
 * Пустые бакеты (нет PR) пропускаем — иначе выходные/праздники дают
 * ложные провалы в линии. Возвращаем null если в окне совсем нет данных. */
export function computeRollingAvg(
  buckets: QualityBucket[],
  window: number,
  mode: FocusMode,
): Array<number | null> {
  return buckets.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = buckets.slice(start, i + 1);
    const pcts = slice
      .map((b) => bucketPct(b, mode))
      .filter((p): p is number => p !== null);
    if (pcts.length === 0) return null;
    return pcts.reduce((a, b) => a + b, 0) / pcts.length;
  });
}
