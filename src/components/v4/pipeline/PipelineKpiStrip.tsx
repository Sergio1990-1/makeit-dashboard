import type { PipelineStats } from "../../../utils/pipeline";
import { compactUSD, formatDuration } from "./utils";

interface Props {
  stats: PipelineStats | null;
  /** Sum of cost for all results currently in the status payload (today's batch) */
  todayCost: number;
  /** Number of completed runs today (heuristic: distinct run-windows) */
  todayRuns: number;
}

export function PipelineKpiStrip({ stats, todayCost, todayRuns }: Props) {
  if (!stats && todayRuns === 0 && todayCost === 0) return null;

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
        <div className="v4-projects-agg-cell">
          <div className="v4-projects-agg-n num">{todayRuns}</div>
          <div className="v4-projects-agg-l">ranов сегодня</div>
        </div>
        <div className="v4-projects-agg-cell">
          <div className="v4-projects-agg-n num" style={{ color: todayCost > 0 ? "var(--v4-success-700)" : undefined }}>
            {compactUSD(todayCost)}
          </div>
          <div className="v4-projects-agg-l">cost сегодня</div>
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
        {stats?.total_issues != null && (
          <div className="v4-projects-agg-cell">
            <div className="v4-projects-agg-n num">{stats.agent_completed}</div>
            <div className="v4-projects-agg-l">agent done</div>
          </div>
        )}
      </div>
    </div>
  );
}
