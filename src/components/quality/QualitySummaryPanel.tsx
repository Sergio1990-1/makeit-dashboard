import { useState } from "react";
import type { QualityPayload, Annotation, PeriodMode } from "../../types/quality";
import { QualityChart, type FocusMode } from "./QualityChart";
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

  return (
    <div className="panel summary">
      <div className="chartwrap">
        <div className="panel-t" style={{ marginBottom: 14 }}>
          Сводная по всем {Object.keys(data.repo_status).length} проектам
          <span className="tag">All repos</span>
          {errored.length > 0 && (
            <span
              className="tag tag-bad"
              title={errored.map(([r, s]) => `${r}: ${s.code ?? "ERROR"}`).join("\n")}
            >
              ⚠ {errored.length} репо без данных
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
      return "var(--mk-quality-p0, #dc2626)";
    case "p1":
      return "var(--mk-quality-p1, #f59e0b)";
    case "p2":
      return "var(--mk-quality-p2, #eab308)";
    case "dirty":
      return "var(--mk-danger-100, #ef4444)";
    case "all":
    default:
      return "var(--mk-success-100, #16a34a)";
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
