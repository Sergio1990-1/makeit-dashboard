import type { ProjectResearch } from "../../../types";
import { totals } from "./utils";

interface Props {
  projects: ProjectResearch[];
}

export function ResearchKpiStrip({ projects }: Props) {
  const t = totals(projects);

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div className="v4-projects-agg-cell" title="Всего проектов в портфеле">
          <div className="v4-projects-agg-n num">{t.projects}</div>
          <div className="v4-projects-agg-l">проектов</div>
        </div>
        <div className="v4-projects-agg-cell" title="Проекты с RESEARCH.md">
          <div
            className="v4-projects-agg-n num"
            style={{ color: t.withResearch > 0 ? "var(--v4-success-700)" : undefined }}
          >
            {t.withResearch}
          </div>
          <div className="v4-projects-agg-l">с research</div>
        </div>
        <div className="v4-projects-agg-cell" title="Проекты с DISCOVERY.md">
          <div
            className="v4-projects-agg-n num"
            style={{ color: t.withDiscovery > 0 ? "var(--v4-success-700)" : undefined }}
          >
            {t.withDiscovery}
          </div>
          <div className="v4-projects-agg-l">с discovery</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сумма competitor-карточек по портфелю">
          <div className="v4-projects-agg-n num">{t.competitors}</div>
          <div className="v4-projects-agg-l">конкурентов</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сумма идей в DISCOVERY.md">
          <div className="v4-projects-agg-n num">{t.suggestions}</div>
          <div className="v4-projects-agg-l">идей</div>
        </div>
        <div className="v4-projects-agg-cell" title="Quick Wins — быстрые победы из DISCOVERY.md">
          <div
            className="v4-projects-agg-n num"
            style={{ color: t.quickWins > 0 ? "var(--v4-success-700)" : undefined }}
          >
            {t.quickWins}
          </div>
          <div className="v4-projects-agg-l">quick wins</div>
        </div>
      </div>
    </div>
  );
}
