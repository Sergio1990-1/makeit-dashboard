import { useState } from "react";
import type { EpicData } from "../../../types";
import {
  pluralRu,
  priorityTagClass,
  sizeTagClass,
  stripEpicPrefix,
  TASK_FORMS,
} from "./utils";

interface Props {
  epic: EpicData;
}

/** Single epic with collapsible task table. */
export function EpicPanel({ epic }: Props) {
  const [expanded, setExpanded] = useState(false);
  const cleanTitle = stripEpicPrefix(epic.title);
  const taskCount = epic.tasks.length;

  return (
    <div className={`v4-spc-epic ${expanded ? "is-expanded" : ""}`}>
      <button
        type="button"
        className="v4-spc-epic-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="v4-spc-epic-id v4-pl-mono">{epic.id}</span>
        <span className="v4-spc-epic-title">{cleanTitle}</span>
        <span className="v4-spc-epic-meta">
          {taskCount > 0 && (
            <span className="v4-spc-epic-stat">
              {taskCount} {pluralRu(taskCount, TASK_FORMS)}
            </span>
          )}
          {epic.deadline && (
            <span className="v4-spc-epic-stat" title="Дедлайн">
              {epic.deadline}
            </span>
          )}
          {epic.priority && (
            <span className={priorityTagClass(epic.priority)}>{epic.priority}</span>
          )}
        </span>
        <span className="v4-spc-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="v4-spc-epic-body">
          {epic.overview && <p className="v4-spc-epic-overview">{epic.overview}</p>}

          {taskCount > 0 ? (
            <div className="v4-spc-table-wrap">
              <table className="v4-spc-table">
                <thead>
                  <tr>
                    <th className="v4-spc-th-num">#</th>
                    <th>Задача</th>
                    <th className="v4-spc-th-size">Размер</th>
                    <th>Зависимости</th>
                    <th>Repo</th>
                  </tr>
                </thead>
                <tbody>
                  {epic.tasks.map((task) => (
                    <tr key={task.number}>
                      <td className="v4-spc-td-num v4-pl-mono">#{task.number}</td>
                      <td className="v4-spc-td-title">{task.title}</td>
                      <td>
                        {task.size ? (
                          <span className={sizeTagClass(task.size)}>{task.size}</span>
                        ) : (
                          <span className="v4-spc-text-muted">—</span>
                        )}
                      </td>
                      <td className="v4-spc-td-deps">
                        {task.dependencies ? (
                          <span className="v4-pl-mono">{task.dependencies}</span>
                        ) : (
                          <span className="v4-spc-text-muted">—</span>
                        )}
                      </td>
                      <td className="v4-spc-td-repo">
                        {task.repo ? (
                          <span className="v4-pl-mono">{task.repo}</span>
                        ) : (
                          <span className="v4-spc-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="v4-spc-empty-inline">Задачи ещё не описаны</div>
          )}
        </div>
      )}
    </div>
  );
}
