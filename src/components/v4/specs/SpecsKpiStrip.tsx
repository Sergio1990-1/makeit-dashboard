import type { SpecsProject } from "../../../types";
import { totals } from "./utils";

interface Props {
  projects: SpecsProject[];
}

export function SpecsKpiStrip({ projects }: Props) {
  const t = totals(projects);

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div className="v4-projects-agg-cell" title="Всего PRD в портфеле">
          <div className="v4-projects-agg-n num">{t.prds}</div>
          <div className="v4-projects-agg-l">PRD</div>
        </div>
        <div className="v4-projects-agg-cell" title="PRD в активной разработке">
          <div
            className="v4-projects-agg-n num"
            style={{ color: t.inDevelopment > 0 ? "var(--mk-success-strong)" : undefined }}
          >
            {t.inDevelopment}
          </div>
          <div className="v4-projects-agg-l">в разработке</div>
        </div>
        <div className="v4-projects-agg-cell" title="Спека готова, можно запускать">
          <div
            className="v4-projects-agg-n num"
            style={{ color: t.specReady > 0 ? "var(--mk-warn-strong)" : undefined }}
          >
            {t.specReady}
          </div>
          <div className="v4-projects-agg-l">готовы</div>
        </div>
        <div className="v4-projects-agg-cell" title="Черновики PRD без эпиков">
          <div className="v4-projects-agg-n num">{t.draft}</div>
          <div className="v4-projects-agg-l">черновики</div>
        </div>
        <div className="v4-projects-agg-cell" title="Завершённые проекты">
          <div
            className="v4-projects-agg-n num"
            style={{ color: t.completed > 0 ? "var(--mk-success-strong)" : undefined }}
          >
            {t.completed}
          </div>
          <div className="v4-projects-agg-l">завершено</div>
        </div>
        <div className="v4-projects-agg-cell" title="Всего epic'ов">
          <div className="v4-projects-agg-n num">{t.epics}</div>
          <div className="v4-projects-agg-l">epics</div>
        </div>
        <div className="v4-projects-agg-cell" title="Всего задач во всех эпиках">
          <div className="v4-projects-agg-n num">{t.tasks}</div>
          <div className="v4-projects-agg-l">задач</div>
        </div>
      </div>
    </div>
  );
}
