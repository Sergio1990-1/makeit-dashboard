import type { PipelineStats } from "../../../utils/pipeline";
import { compactUSD, formatDuration } from "./utils";

interface Props {
  stats: PipelineStats | null;
  /** Sum of cost for all results in the current status payload (this session, not strictly today). */
  sessionCost: number;
  /** Number of distinct runs in the current status payload (heuristic). */
  sessionRuns: number;
}

export function PipelineKpiStrip({ stats, sessionCost, sessionRuns }: Props) {
  if (!stats && sessionRuns === 0 && sessionCost === 0) return null;

  const firstPass = stats?.first_pass_rate ?? null;
  const firstPassColor =
    firstPass === null
      ? undefined
      : firstPass >= 80
      ? "var(--v4-success-700)"
      : firstPass >= 60
      ? "var(--v4-warn-700)"
      : "var(--v4-danger-700)";

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div
          className="v4-projects-agg-cell"
          title="Завершённые ранее запуски в текущей API-сессии"
        >
          <div className="v4-projects-agg-n num">{sessionRuns}</div>
          <div className="v4-projects-agg-l">ranов в сессии</div>
        </div>
        <div
          className="v4-projects-agg-cell"
          title="Сумма cost по всем результатам в текущей API-сессии (не строго за сегодня)"
        >
          <div
            className="v4-projects-agg-n num"
            style={{ color: sessionCost > 0 ? "var(--v4-success-700)" : undefined }}
          >
            {compactUSD(sessionCost)}
          </div>
          <div className="v4-projects-agg-l">cost сессии</div>
        </div>
        {firstPass !== null && (
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num" style={{ color: firstPassColor }}>
              {Math.round(firstPass)}%
            </div>
            <div className="v4-projects-agg-l">first-pass 7д</div>
          </div>
        )}
        {stats?.avg_duration_seconds != null && (
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">
              {formatDuration(stats.avg_duration_seconds)}
            </div>
            <div className="v4-projects-agg-l">avg time</div>
          </div>
        )}
        {stats?.cost_per_task_usd != null && (
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">
              {compactUSD(stats.cost_per_task_usd)}
            </div>
            <div className="v4-projects-agg-l">cost/задачу</div>
          </div>
        )}
        {stats?.agent_completed != null && (
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{stats.agent_completed}</div>
            <div className="v4-projects-agg-l">agent done</div>
          </div>
        )}
      </div>
    </div>
  );
}
