import type { AuditProjectStatus } from "../../../types";
import {
  avgDurationSec,
  fmtCost,
  fmtDuration,
  totalCost,
  totalFindingsBySeverity,
} from "./utils";

interface Props {
  projects: AuditProjectStatus[];
}

export function AuditKpiStrip({ projects }: Props) {
  const total = projects.length;
  const audited = projects.filter((p) => p.last_run).length;
  const totals = totalFindingsBySeverity(projects);
  const cost = totalCost(projects);
  const avgDur = avgDurationSec(projects);

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div className="v4-projects-agg-cell" title="Всего проектов в конфиге">
          <div className="v4-projects-agg-n num">{total}</div>
          <div className="v4-projects-agg-l">проектов</div>
        </div>
        <div className="v4-projects-agg-cell" title="Проекты с last_run">
          <div className="v4-projects-agg-n num">{audited}</div>
          <div className="v4-projects-agg-l">проаудированы</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сумма critical-находок по портфелю">
          <div
            className="v4-projects-agg-n num"
            style={{ color: totals.critical > 0 ? "var(--v4-danger-700)" : undefined }}
          >
            {totals.critical}
          </div>
          <div className="v4-projects-agg-l">критических</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сумма high-находок по портфелю">
          <div
            className="v4-projects-agg-n num"
            style={{ color: totals.high > 0 ? "var(--v4-warn-700)" : undefined }}
          >
            {totals.high}
          </div>
          <div className="v4-projects-agg-l">высоких</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сумма GPU-стоимости всех last_run">
          <div className="v4-projects-agg-n num">{fmtCost(cost)}</div>
          <div className="v4-projects-agg-l">потрачено</div>
        </div>
        <div className="v4-projects-agg-cell" title="Средняя длительность одного аудита">
          <div className="v4-projects-agg-n num">{fmtDuration(avgDur)}</div>
          <div className="v4-projects-agg-l">ср. время</div>
        </div>
      </div>
    </div>
  );
}
