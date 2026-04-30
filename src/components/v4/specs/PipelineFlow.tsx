import type { SpecsProject } from "../../../types";

interface Props {
  project: SpecsProject;
}

/** Visual PRD → Epic → Tasks → Dev → Done flow inside a project card. */
export function PipelineFlow({ project }: Props) {
  const { epics, totalTasks, computedStatus } = project;

  const stages = [
    { key: "prd", label: "PRD", active: true },
    { key: "epic", label: "Epic", active: epics.length > 0 },
    { key: "tasks", label: `Tasks (${totalTasks})`, active: totalTasks > 0 },
    { key: "dev", label: "Dev", active: computedStatus === "in_development" || computedStatus === "completed" },
    { key: "done", label: "Done", active: computedStatus === "completed" },
  ];

  return (
    <div className="v4-spc-flow" role="list" aria-label="Этапы пайплайна">
      {stages.map((s, i) => (
        <div key={s.key} className="v4-spc-flow-step" role="listitem">
          <div className={`v4-spc-flow-dot ${s.active ? "is-active" : ""}`} aria-hidden="true" />
          <span className={`v4-spc-flow-label ${s.active ? "" : "is-inactive"}`}>{s.label}</span>
          {i < stages.length - 1 && (
            <div className={`v4-spc-flow-line ${s.active ? "is-active" : ""}`} aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}
