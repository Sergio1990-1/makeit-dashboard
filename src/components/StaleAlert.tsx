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
    <div className="stale-banner">
      <div className="stale-title">Нет движения ({stale.length})</div>
      {stale.map((p) => (
        <div key={p.repo} className="stale-item">
          <span>
            <strong>{p.repo}</strong>
            <span className="stale-open"> — {p.openCount} открытых задач</span>
          </span>
          <span className="stale-days">{p.daysSinceActivity}д</span>
        </div>
      ))}
    </div>
  );
}
