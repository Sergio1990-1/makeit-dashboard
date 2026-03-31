import type { ProjectData } from "../types";

interface Props {
  projects: ProjectData[];
}

export function StaleAlert({ projects }: Props) {
  const stale = projects
    .filter((p) => p.daysSinceActivity !== null && p.daysSinceActivity >= 2 && p.openCount > 0)
    .sort((a, b) => (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0));

  if (stale.length === 0) return null;

  return (
    <div className="bento-panel span-4 panel-stale">
      <div className="bento-panel-title" style={{ color: "var(--color-caution)" }}>Нет движения ({stale.length})</div>
      <div className="stale-feed">
        {stale.map((p) => (
          <div key={p.repo} className={`stale-row ${p.daysSinceActivity && p.daysSinceActivity >= 5 ? "stale-row--urgent" : ""}`}>
            <div className="stale-row-main">
              <div className="stale-project-info">
                <span className="stale-project-name">{p.repo}</span>
                <span className="stale-project-meta">{p.openCount} открытых задач</span>
              </div>
              <div className="stale-time-wrap">
                <span className="stale-time-label">⏱️ {p.daysSinceActivity}д</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
