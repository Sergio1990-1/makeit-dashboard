import type { PipelineStats } from "../../../utils/pipeline";

interface Props {
  stats: PipelineStats | null;
}

export function PipelineComplexityPanel({ stats }: Props) {
  if (!stats?.complexity_breakdown) return null;
  const b = stats.complexity_breakdown;
  const total = b.auto + b.assisted + b.manual;
  if (total === 0 && (!stats.model_usage || stats.model_usage.length === 0)) return null;

  const items = [
    { key: "auto" as const, label: "Auto", count: b.auto, color: "var(--mk-success-strong)" },
    { key: "assisted" as const, label: "Assisted", count: b.assisted, color: "var(--mk-warn-strong)" },
    { key: "manual" as const, label: "Manual", count: b.manual, color: "var(--mk-danger-strong)" },
  ];

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Сложность <span className="v4-tag">classification</span>
        </div>
      </div>
      <div className="v4-pl-cx-grid">
        {items.map((it) => {
          const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
          return (
            <div key={it.key} className="v4-pl-cx-cell">
              <div className="v4-pl-cx-n num" style={{ color: it.color }}>{it.count}</div>
              <div className="v4-pl-cx-l">
                {it.label} <span className="v4-pl-cx-pct">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {stats.model_usage && stats.model_usage.length > 0 && (
        <div className="v4-pl-models">
          <div className="v4-pl-models-l">Модели</div>
          <div className="v4-pl-models-list">
            {stats.model_usage.map((m) => (
              <span key={m.model} className="v4-pl-model-chip">
                {m.model}
                <span className="v4-pl-model-count">×{m.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
