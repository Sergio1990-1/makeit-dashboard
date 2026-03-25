import type { Filters as FiltersType, ProjectData, Priority, IssueStatus } from "../types";

interface Props {
  filters: FiltersType;
  onChange: (f: FiltersType) => void;
  projects: ProjectData[];
}

const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];
const STATUSES: IssueStatus[] = ["Todo", "In Progress", "Review", "Done"];

export function Filters({ filters, onChange, projects }: Props) {
  return (
    <div className="filters">
      <select
        value={filters.project ?? ""}
        onChange={(e) => onChange({ ...filters, project: e.target.value || null })}
        className="filter-select"
      >
        <option value="">Все проекты</option>
        {projects.map((p) => (
          <option key={p.repo} value={p.repo}>
            {p.repo}
          </option>
        ))}
      </select>

      <select
        value={filters.priority ?? ""}
        onChange={(e) => onChange({ ...filters, priority: (e.target.value as Priority) || null })}
        className="filter-select"
      >
        <option value="">Все приоритеты</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={filters.status ?? ""}
        onChange={(e) => onChange({ ...filters, status: (e.target.value as IssueStatus) || null })}
        className="filter-select"
      >
        <option value="">Все статусы</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {(filters.project || filters.priority || filters.status) && (
        <button className="btn btn-sm" onClick={() => onChange({ project: null, priority: null, status: null })}>
          Сбросить
        </button>
      )}
    </div>
  );
}
