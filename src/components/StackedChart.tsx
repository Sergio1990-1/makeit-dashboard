import type { ProjectData } from "../types";

interface Props {
  projects: ProjectData[];
}

export function StackedChart({ projects }: Props) {
  if (projects.length === 0) return null;

  const maxTotal = Math.max(...projects.map((p) => p.totalCount), 1);

  return (
    <div className="bento-panel span-8" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="bento-panel-title">Распределение задач</div>
      <div className="stacked-chart" style={{ flex: 1 }}>
        {projects.map((p) => (
          <div key={p.repo} className="chart-row">
            <span className="chart-label">{p.repo}</span>
            <div className="chart-bar-container">
              <div className="chart-bar" style={{ width: `${(p.totalCount / maxTotal) * 100}%` }}>
                {p.priorityCounts.P1 > 0 && (
                  <div
                    className="chart-segment p1"
                    style={{ flex: p.priorityCounts.P1 }}
                    title={`P1: ${p.priorityCounts.P1}`}
                  />
                )}
                {p.priorityCounts.P2 > 0 && (
                  <div
                    className="chart-segment p2"
                    style={{ flex: p.priorityCounts.P2 }}
                    title={`P2: ${p.priorityCounts.P2}`}
                  />
                )}
                {p.priorityCounts.P3 > 0 && (
                  <div
                    className="chart-segment p3"
                    style={{ flex: p.priorityCounts.P3 }}
                    title={`P3: ${p.priorityCounts.P3}`}
                  />
                )}
                {p.doneCount > 0 && (
                  <div className="chart-segment done" style={{ flex: p.doneCount }} title={`Done: ${p.doneCount}`} />
                )}
              </div>
            </div>
            <span className="chart-total">{p.totalCount}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend" style={{ marginTop: 'auto', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--color-border)' }}>
        <span className="legend-item"><span className="legend-color p1" /> P1</span>
        <span className="legend-item"><span className="legend-color p2" /> P2</span>
        <span className="legend-item"><span className="legend-color p3" /> P3</span>
        <span className="legend-item"><span className="legend-color done" /> Done</span>
      </div>
    </div>
  );
}
