import { useEffect, useRef, useState } from "react";
import { useSpecs } from "../hooks/useSpecs";
import type { SpecsProject, EpicData, EpicTask, SpecStatus } from "../types";

const STATUS_LABEL: Record<SpecStatus, string> = {
  draft: "Черновик",
  spec_ready: "Спека готова",
  in_development: "В разработке",
  completed: "Завершено",
};

const STATUS_CLASS: Record<SpecStatus, string> = {
  draft: "spc-status-draft",
  spec_ready: "spc-status-ready",
  in_development: "spc-status-dev",
  completed: "spc-status-done",
};

const PRIORITY_CLASS: Record<string, string> = {
  "P1-critical": "spc-pri-p1",
  "P2-high": "spc-pri-p2",
  "P3-medium": "spc-pri-p3",
};

function StatusBadge({ status }: { status: SpecStatus }) {
  return (
    <span className={`spc-badge ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = Object.entries(PRIORITY_CLASS).find(([k]) =>
    priority.toLowerCase().includes(k.toLowerCase())
  );
  return (
    <span className={`spc-badge ${cls?.[1] ?? "spc-pri-default"}`}>
      {priority}
    </span>
  );
}

function SizeBadge({ size }: { size: string }) {
  if (!size) return null;
  const cls: Record<string, string> = { S: "spc-size-s", M: "spc-size-m", L: "spc-size-l", XL: "spc-size-xl" };
  return <span className={`spc-badge ${cls[size] ?? ""}`}>{size}</span>;
}

// ── Pipeline flow visualization ──

function PipelineFlow({ project }: { project: SpecsProject }) {
  const stages = [
    { key: "prd", label: "PRD", active: true },
    { key: "epic", label: "Epic", active: project.epics.length > 0 },
    { key: "tasks", label: `Tasks (${project.totalTasks})`, active: project.totalTasks > 0 },
    { key: "dev", label: "Dev", active: project.computedStatus === "in_development" || project.computedStatus === "completed" },
    { key: "done", label: "Done", active: project.computedStatus === "completed" },
  ];

  return (
    <div className="spc-flow">
      {stages.map((s, i) => (
        <div key={s.key} className="spc-flow-step">
          <div className={`spc-flow-dot ${s.active ? "spc-flow-active" : ""}`} />
          <span className={`spc-flow-label ${s.active ? "" : "spc-flow-inactive"}`}>{s.label}</span>
          {i < stages.length - 1 && <div className={`spc-flow-line ${s.active ? "spc-flow-line-active" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

// ── Task Row ──

function TaskRow({ task }: { task: EpicTask }) {
  return (
    <tr className="spc-task-row">
      <td className="spc-task-num">#{task.number}</td>
      <td className="spc-task-title">{task.title}</td>
      <td><SizeBadge size={task.size} /></td>
      <td className="spc-task-deps">{task.dependencies || "—"}</td>
      <td className="spc-task-repo">{task.repo}</td>
    </tr>
  );
}

// ── Epic Panel ──

function EpicPanel({ epic }: { epic: EpicData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="spc-epic">
      <div className="spc-epic-header" onClick={() => setExpanded(!expanded)}>
        <span className="spc-epic-id">{epic.id}</span>
        <span className="spc-epic-title">{epic.title.replace(/^Epic-\d+:\s*/, "")}</span>
        <span className="spc-epic-meta">
          {epic.tasks.length > 0 && <span className="spc-stat">{epic.tasks.length} задач</span>}
          {epic.deadline && <span className="spc-stat">{epic.deadline}</span>}
          <PriorityBadge priority={epic.priority} />
        </span>
        <span className="rsh-chevron">{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div className="spc-epic-body">
          {epic.overview && <p className="spc-epic-overview">{epic.overview}</p>}
          {epic.tasks.length > 0 && (
            <div className="rsh-table-wrap">
              <table className="rsh-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Задача</th>
                    <th>Размер</th>
                    <th>Зависимости</th>
                    <th>Repo</th>
                  </tr>
                </thead>
                <tbody>
                  {epic.tasks.map((t) => <TaskRow key={t.number} task={t} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Card ──

function ProjectCard({ project }: { project: SpecsProject }) {
  const [expanded, setExpanded] = useState(false);
  const { prd, epics, computedStatus, totalTasks } = project;

  return (
    <div className={`spc-project ${expanded ? "spc-project-expanded" : ""}`}>
      <div className="spc-project-header" onClick={() => setExpanded(!expanded)}>
        <div className="spc-project-left">
          <span className="spc-project-id">{prd.id}</span>
          <span className="spc-project-title">{prd.title.replace(/^PRD-\d+:\s*/, "")}</span>
        </div>
        <div className="spc-project-right">
          <StatusBadge status={computedStatus} />
          <PriorityBadge priority={prd.priority} />
          <span className="spc-stat">{epics.length} epic{epics.length !== 1 ? "s" : ""}</span>
          <span className="spc-stat">{totalTasks} задач</span>
          <span className="rsh-chevron">{expanded ? "▾" : "▸"}</span>
        </div>
      </div>

      {expanded && (
        <div className="spc-project-body">
          <PipelineFlow project={project} />

          <div className="spc-prd-meta">
            {prd.author && <span>Автор: {prd.author}</span>}
            {prd.date && <span>Дата: {prd.date}</span>}
            {prd.status && <span>PRD статус: {prd.status}</span>}
          </div>

          {epics.length > 0 && (
            <div className="spc-epics">
              {epics.map((e) => <EpicPanel key={e.id} epic={e} />)}
            </div>
          )}

          {epics.length === 0 && (
            <div className="spc-no-epics">Нет связанных эпиков</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──

export function SpecsTab() {
  const { projects, loading, error, refresh } = useSpecs();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      refresh();
    }
  }, [refresh]);

  const statusCounts = projects.reduce<Record<SpecStatus, number>>(
    (acc, p) => { acc[p.computedStatus]++; return acc; },
    { draft: 0, spec_ready: 0, in_development: 0, completed: 0 }
  );

  const totalTasks = projects.reduce((n, p) => n + p.totalTasks, 0);

  return (
    <div className="bento-panel span-12 panel-projects">
      <div className="bento-panel-title">
        <div>
          Specs Tracking
          <span className="audit-header-sub">PRD → Epic → Tasks из makeit-pipeline</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={refresh} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && projects.length === 0 && (
        <div className="rsh-loading">
          <div className="audit-spinner" />
          Загрузка спецификаций...
        </div>
      )}

      {!loading && projects.length === 0 && !error && (
        <div className="spc-empty">
          <div className="spc-empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3>Specs Tracking</h3>
          <p>
            Отслеживание спецификаций от PRD до задач.
            Используйте команду планирования в makeit-pipeline
            для генерации PRD, Epic и Tasks из описания фичи.
          </p>
          <div className="spc-empty-hint">
            <code>makeit-plan "описание фичи"</code>
          </div>
          <button className="btn btn-primary" style={{ marginTop: "var(--sp-4)" }} onClick={refresh}>
            Загрузить спецификации
          </button>
        </div>
      )}

      {projects.length > 0 && (
        <>
          <div className="spc-summary">
            <div className="spc-summary-item spc-summary-dev">
              <div className="spc-summary-value">{statusCounts.in_development}</div>
              <div className="spc-summary-label">в разработке</div>
            </div>
            <div className="spc-summary-item spc-summary-ready">
              <div className="spc-summary-value">{statusCounts.spec_ready}</div>
              <div className="spc-summary-label">спека готова</div>
            </div>
            <div className="spc-summary-item">
              <div className="spc-summary-value">{statusCounts.draft}</div>
              <div className="spc-summary-label">черновики</div>
            </div>
            <div className="spc-summary-item spc-summary-done">
              <div className="spc-summary-value">{statusCounts.completed}</div>
              <div className="spc-summary-label">завершено</div>
            </div>
            <div className="spc-summary-item">
              <div className="spc-summary-value">{totalTasks}</div>
              <div className="spc-summary-label">задач всего</div>
            </div>
          </div>

          <div className="spc-projects">
            {projects.map((p) => <ProjectCard key={p.prd.id} project={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
