import type { DebateListItem } from "../../../types/debate";
import { fmtCost, totalCost } from "./utils";

interface Props {
  debates: DebateListItem[];
}

export function DebateKpiStrip({ debates }: Props) {
  const total = debates.length;
  const running = debates.filter((d) => d.status === "running" || d.status === "queued").length;
  const done = debates.filter((d) => d.status === "done").length;
  const error = debates.filter((d) => d.status === "error").length;
  const cost = totalCost(debates);
  const unanimous = debates.filter((d) => d.status === "done" && d.consensus_level === "unanimous").length;

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div className="v4-projects-agg-cell" title="Всего дебатов в истории">
          <div className="v4-projects-agg-n num">{total}</div>
          <div className="v4-projects-agg-l">всего</div>
        </div>
        <div className="v4-projects-agg-cell" title="В работе или в очереди">
          <div
            className="v4-projects-agg-n num"
            style={{ color: running > 0 ? "var(--v4-warn-700)" : undefined }}
          >
            {running}
          </div>
          <div className="v4-projects-agg-l">в работе</div>
        </div>
        <div className="v4-projects-agg-cell" title="Успешно завершены">
          <div
            className="v4-projects-agg-n num"
            style={{ color: done > 0 ? "var(--v4-success-700)" : undefined }}
          >
            {done}
          </div>
          <div className="v4-projects-agg-l">завершены</div>
        </div>
        {error > 0 && (
          <div className="v4-projects-agg-cell" title="Завершились с ошибкой">
            <div className="v4-projects-agg-n num" style={{ color: "var(--v4-danger-700)" }}>
              {error}
            </div>
            <div className="v4-projects-agg-l">ошибки</div>
          </div>
        )}
        <div className="v4-projects-agg-cell" title="Дебаты с единогласным консенсусом">
          <div className="v4-projects-agg-n num">{unanimous}</div>
          <div className="v4-projects-agg-l">единогласно</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сумма потраченных API-токенов">
          <div className="v4-projects-agg-n num">{fmtCost(cost)}</div>
          <div className="v4-projects-agg-l">потрачено</div>
        </div>
      </div>
    </div>
  );
}
