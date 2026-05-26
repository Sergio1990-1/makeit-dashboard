import { useMemo, useState } from "react";
import type { QualityPayload, Annotation, PeriodMode } from "../../types/quality";
import { QualityChart } from "./QualityChart";
import {
  badgeLabel,
  computeRollingAvg,
  lineColor,
  type FocusMode,
} from "./quality-trend";
import { QualityKPIs } from "./QualityKPIs";
import { QualityAnnotations } from "./QualityAnnotations";

interface Props {
  data: QualityPayload;
  annotations: Annotation[];
  mode: PeriodMode;
}

export function QualitySummaryPanel({ data, annotations, mode }: Props) {
  const [focus, setFocus] = useState<FocusMode>("all");
  const buckets = data.buckets[mode].summary;
  const labels = data.buckets[mode].labels;
  const errored = Object.entries(data.repo_status).filter(([, s]) => s.status === "error");

  // Click on the same focused tile → release filter; otherwise switch.
  // Keeping toggle logic in one place so KPI tile components stay dumb.
  const toggleFocus = (mode: FocusMode) =>
    setFocus((prev) => (prev === mode ? "all" : mode));

  // Окно скользящего среднего: 7 для 30d, 3 для 12w (синхронно с дефолтом
  // QualityChart, см. effectiveWindow там). Дублирование оправдано: parent
  // считает badge value, child рисует линию по тому же окну.
  const rollingWindow = buckets.length >= 20 ? 7 : 3;
  const latestRollingPct = useMemo(() => {
    const series = computeRollingAvg(buckets, rollingWindow, focus);
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i] !== null) return series[i];
    }
    return null;
  }, [buckets, rollingWindow, focus]);
  const unitLabel = buckets.length >= 20 ? "д" : "нед";

  return (
    <div className="panel summary">
      <div className="chartwrap">
        <div
          className="panel-t"
          style={{
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>Сводная по всем {Object.keys(data.repo_status).length} проектам</span>
          <span className="tag">All repos</span>
          {errored.length > 0 && (
            <span
              className="tag tag-bad"
              title={errored.map(([r, s]) => `${r}: ${s.code ?? "ERROR"}`).join("\n")}
            >
              ⚠ {errored.length} репо без данных
            </span>
          )}
          {/* Бейдж rolling-avg вынесен из чарта в заголовок: больше не
              пересекается с барами/topперами и читается как часть метрики,
              а не как deco-наклейка на графике. Цвет/подпись подстраиваются
              под текущий focus-фильтр (общая утилита lineColor/badgeLabel). */}
          {latestRollingPct !== null && (
            <span
              className="chart-trend-badge"
              title={`${rollingWindow}-${unitLabel === "д" ? "дневное" : "недельное"} скользящее среднее «${badgeLabel(focus) === "чистых" ? "% PR без P0/P1" : `% PR с ${badgeLabel(focus).replace("с ", "")}`}»`}
              style={{
                marginLeft: "auto",
                padding: "3px 8px",
                background: lineColor(focus),
                color: "white",
                fontFamily: "var(--mk-font-mono)",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 4,
                whiteSpace: "nowrap",
                boxShadow: "0 1px 4px color-mix(in srgb, var(--mk-ink-900) 15%, transparent)",
              }}
            >
              {latestRollingPct.toFixed(0)}% {badgeLabel(focus)} · {rollingWindow}{unitLabel} avg
            </span>
          )}
        </div>
        <div className="chart-area">
          <QualityChart buckets={buckets} labels={labels} compact={false} focus={focus} />
          <QualityAnnotations annotations={annotations} mode={mode} bucketCount={buckets.length} />
        </div>
        <div className="chart-legend">
          {focus === "all" ? (
            <>
              <span><i className="dot dot-p1" /> P0 / P1 (грязные)</span>
              <span><i className="dot dot-p2" /> P2 (нит)</span>
              <span><i className="dot dot-clean" /> чистые</span>
            </>
          ) : (
            <span style={{ opacity: 0.7 }}>
              Фильтр: {focusLabel(focus)} · клик по карточке ещё раз — снять
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i
              style={{
                display: "inline-block",
                width: 18,
                height: 2,
                background: focusLineColor(focus),
                borderRadius: 2,
              }}
            />
            {mode === "30d" ? "7-дневное" : "3-недельное"} скользящее среднее «
            {focusLineLabel(focus)}»
          </span>
        </div>
      </div>
      <QualityKPIs data={data} mode={mode} focus={focus} onToggleFocus={toggleFocus} />
    </div>
  );
}

// Centralised because three places reference the same focus-mode → display
// mapping (legend swatch colour, legend label, KPI tile hover). Keeping them
// here means a new mode lands in one diff, not three.
function focusLineColor(f: FocusMode): string {
  switch (f) {
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

function focusLineLabel(f: FocusMode): string {
  switch (f) {
    case "p0":
      return "% PR с P0";
    case "p1":
      return "% PR с P1";
    case "p2":
      return "% PR с P2";
    case "dirty":
      return "% грязных PR (P0+P1)";
    case "all":
    default:
      return "% PR без P0/P1";
  }
}

function focusLabel(f: FocusMode): string {
  switch (f) {
    case "p0":
      return "только P0";
    case "p1":
      return "только P1";
    case "p2":
      return "только P2";
    case "dirty":
      return "только грязные (P0+P1)";
    case "all":
    default:
      return "все";
  }
}
