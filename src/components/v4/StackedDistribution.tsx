import type { CSSProperties } from "react";
import type { ProjectData } from "../../types";

interface Props {
  projects: ProjectData[];
}

interface IndexedStyle extends CSSProperties {
  "--i"?: number;
}

export function StackedDistribution({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">
            Распределение задач по проектам <span className="v4-tag">по приоритетам</span>
          </div>
        </div>
        <div className="v4-empty">Нет данных</div>
      </div>
    );
  }

  // Sort: by total desc
  const sorted = [...projects]
    .filter((p) => p.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Распределение задач по проектам <span className="v4-tag">по приоритетам</span>
        </div>
        <div className="v4-panel-meta">сортировка: всего ↓</div>
      </div>
      <div className="v4-stack-list">
        {sorted.map((p, i) => {
          const total = p.totalCount;
          const segP1 = (p.priorityCounts.P1 / total) * 100;
          const segP2 = (p.priorityCounts.P2 / total) * 100;
          const segP3 = (p.priorityCounts.P3 / total) * 100;
          const segDone = (p.doneCount / total) * 100;
          const rowStyle: IndexedStyle = { "--i": i };
          return (
            <div key={p.repo} className="v4-stack-row" style={rowStyle}>
              <span className="v4-nm">{p.repo}</span>
              <div className="v4-stack-bar" title={`P1:${p.priorityCounts.P1} · P2:${p.priorityCounts.P2} · P3:${p.priorityCounts.P3} · Done:${p.doneCount}`}>
                {segP1 > 0 && <div className="v4-seg v4-seg--p1" style={{ width: `${segP1}%`, "--i": i } as IndexedStyle} />}
                {segP2 > 0 && <div className="v4-seg v4-seg--p2" style={{ width: `${segP2}%`, "--i": i } as IndexedStyle} />}
                {segP3 > 0 && <div className="v4-seg v4-seg--p3" style={{ width: `${segP3}%`, "--i": i } as IndexedStyle} />}
                {segDone > 0 && <div className="v4-seg v4-seg--done" style={{ width: `${segDone}%`, "--i": i } as IndexedStyle} />}
              </div>
              <span className="v4-tot">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
