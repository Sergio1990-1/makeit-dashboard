import type { CSSProperties } from "react";
import type { QualityPayload, PeriodMode } from "../../types/quality";

interface Props {
  data: QualityPayload;
  mode: PeriodMode;
}

export function QualityKPIs({ data, mode }: Props) {
  const buckets = data.buckets[mode].summary;
  const total = buckets.reduce((a, b) => a + b.total_pr, 0);
  const totalP0 = buckets.reduce((a, b) => a + b.with_p0, 0);
  const totalP1 = buckets.reduce((a, b) => a + b.with_p1_only, 0);
  const totalP2 = buckets.reduce((a, b) => a + b.with_p2_only, 0);
  const dirty = totalP0 + totalP1 + totalP2;
  const dirtyPct = total ? Math.round((dirty / total) * 100) : 0;
  const p1Pct = total ? Math.round((totalP1 / total) * 100) : 0;
  const p2Pct = total ? Math.round((totalP2 / total) * 100) : 0;
  const avgPerPeriod = buckets.length ? Math.round(total / buckets.length) : 0;
  const periodLabel = mode === "12w" ? "за 12 нед." : "за 30 дней";
  const avgLabel = mode === "12w" ? "среднем за неделю" : "среднем за день";

  const kpiStyle = (i: number): CSSProperties => ({ ["--i" as string]: i } as CSSProperties);

  return (
    <div className="kpis">
      {totalP0 > 0 && (
        <div className="kpi-p0-alert" title="Блокирующие баги от Codex. Требуют немедленного внимания.">
          <span className="kpi-p0-icon">🔴</span>
          <div className="kpi-p0-text">
            <b>P0: {totalP0}</b>
            <span>БЛОКЕРЫ {periodLabel}</span>
          </div>
        </div>
      )}
      <div className="kpi" style={kpiStyle(0)}>
        <div className="kpi-lbl">% грязных PR · {periodLabel}</div>
        <div className="kpi-v">{dirtyPct}%</div>
        <div className="kpi-sub">{dirty} из {total} PR</div>
      </div>
      <div className="kpi" style={kpiStyle(1)}>
        <div className="kpi-lbl">% P1 · {periodLabel}</div>
        <div className="kpi-v" style={{ color: "var(--v4-p1-text)" }}>{p1Pct}%</div>
      </div>
      <div className="kpi" style={kpiStyle(2)}>
        <div className="kpi-lbl">% P2 · {periodLabel}</div>
        <div className="kpi-v" style={{ color: "var(--v4-p2-text)" }}>{p2Pct}%</div>
      </div>
      <div className="kpi" style={kpiStyle(3)}>
        <div className="kpi-lbl">PR {periodLabel}</div>
        <div className="kpi-v">{total}</div>
        <div className="kpi-sub">{avgPerPeriod} в {avgLabel}</div>
      </div>
    </div>
  );
}
