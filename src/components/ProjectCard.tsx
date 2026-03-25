import type { ProjectData, Priority } from "../types";

interface Props {
  project: ProjectData;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  P1: "var(--color-p1)",
  P2: "var(--color-p2)",
  P3: "var(--color-p3)",
  P4: "var(--color-p4)",
};

const PHASE_LABELS: Record<string, string> = {
  "pre-dev": "Предразработка",
  development: "Разработка",
  support: "Поддержка",
};

export function ProjectCard({ project }: Props) {
  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="project-card">
      <div className="project-header">
        <h3 className="project-name">{project.repo}</h3>
        <span className={`phase-badge phase-${project.phase}`}>{PHASE_LABELS[project.phase]}</span>
      </div>

      <div className="project-client">{project.client}</div>

      {project.description && <p className="project-description">{project.description}</p>}

      <div className="priority-row">
        {(["P1", "P2", "P3", "P4"] as Priority[]).map((p) => (
          <span key={p} className="priority-badge" style={{ backgroundColor: PRIORITY_COLORS[p] }}>
            {p}: {project.priorityCounts[p]}
          </span>
        ))}
      </div>

      <div className="progress-section">
        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${project.progress}%` }} />
        </div>
        <span className="progress-text">
          {project.doneCount}/{project.totalCount} ({project.progress}%)
        </span>
      </div>

      <div className="project-footer">
        <span>Последний коммит: {formatDate(project.lastCommitDate)}</span>
        <span>
          {project.openCount} открытых / {project.doneCount} закрытых
        </span>
      </div>
    </div>
  );
}
