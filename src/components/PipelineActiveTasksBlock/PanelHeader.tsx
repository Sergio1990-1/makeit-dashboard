import {
  type ActiveTask,
  PHASES,
  PHASE_LABEL,
  fmtCost,
  phaseDistribution,
  totalSpent,
} from "./helpers";
import { RepoIcon } from "./icons";

interface Props {
  tasks: ActiveTask[];
  total: number;
  projectName: string | null;
}

function PhaseSummary({ tasks }: { tasks: ActiveTask[] }) {
  const dist = phaseDistribution(tasks);
  const items = PHASES.map((p) => ({ p, n: dist[p] }));
  if (items.every((it) => it.n === 0)) return null;
  return (
    <span className="pl2-phase-summary">
      {items.map((it, i) => {
        const cls = `pl2-phase-summary-it${it.n === 0 ? " pl2-phase-summary-it--zero" : ""}`;
        const dotCls = `pl2-dotchain-dot pl2-dotchain-dot--${it.n > 0 ? "success" : "pending"} pl2-ph-${it.p}`;
        return (
          <span key={it.p} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span className="pl2-phase-summary-sep">·</span>}
            <span className={cls}>
              <span className={dotCls} style={{ width: 5, height: 5 }} />
              {PHASE_LABEL[it.p]}: <b>{it.n}</b>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function PanelHeader({ tasks, total, projectName }: Props) {
  const cost = totalSpent(tasks);
  return (
    <div className="pl2-panel-h">
      <span className="pl2-panel-t">
        Активные задачи <span className="pl2-panel-count">{total}</span>
      </span>
      {projectName && (
        <>
          <span className="pl2-panel-sep" />
          <span className="pl2-panel-proj">
            <RepoIcon />
            repo <b>{projectName}</b>
          </span>
        </>
      )}
      <PhaseSummary tasks={tasks} />
      {cost > 0 && (
        <span className="pl2-panel-cost">
          сессия: <b>{fmtCost(cost)}</b>
        </span>
      )}
    </div>
  );
}
