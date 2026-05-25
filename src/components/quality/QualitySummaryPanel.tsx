import type { QualityPayload, Annotation, PeriodMode } from "../../types/quality";
import { QualityChart } from "./QualityChart";
import { QualityKPIs } from "./QualityKPIs";
import { QualityAnnotations } from "./QualityAnnotations";

interface Props {
  data: QualityPayload;
  annotations: Annotation[];
  mode: PeriodMode;
}

export function QualitySummaryPanel({ data, annotations, mode }: Props) {
  const buckets = data.buckets[mode].summary;
  const labels = data.buckets[mode].labels;
  const errored = Object.entries(data.repo_status).filter(([, s]) => s.status === "error");

  return (
    <div className="panel summary">
      <div className="chartwrap">
        <div className="panel-t" style={{ marginBottom: 14 }}>
          Сводно по всем {Object.keys(data.repo_status).length} проектам
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
          <QualityChart buckets={buckets} labels={labels} compact={false} />
          <QualityAnnotations annotations={annotations} mode={mode} bucketCount={buckets.length} />
        </div>
        <div className="chart-legend">
          <span><i className="dot dot-p1" /> P1 (критическое)</span>
          <span><i className="dot dot-p2" /> P2 (высокое)</span>
          <span><i className="dot dot-clean" /> чистые PR</span>
        </div>
      </div>
      <QualityKPIs data={data} mode={mode} />
    </div>
  );
}
