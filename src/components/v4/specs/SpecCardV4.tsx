import { memo, useState } from "react";
import type { SpecsProject } from "../../../types";
import { EpicPanel } from "./EpicPanel";
import { PipelineFlow } from "./PipelineFlow";
import {
  pluralRu,
  priorityTagClass,
  STATUS_HEALTH,
  STATUS_LABEL,
  statusTagClass,
  stripPrdPrefix,
  TASK_FORMS,
} from "./utils";

interface Props {
  project: SpecsProject;
  /** Optional initial expanded state — used by parent to expand the first card. */
  initialExpanded?: boolean;
}

/**
 * V4 PRD card. Header is always visible (id, title, status, priority, counts).
 * Body (PipelineFlow + epics) collapsed by default; chevron toggles open.
 *
 * Accessibility: chevron is the only interactive element in the header so
 * we never nest a button inside a clickable parent (WCAG 4.1.1).
 */
function SpecCardV4Inner({ project, initialExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initialExpanded);

  const { prd, epics, computedStatus, totalTasks } = project;
  const cleanTitle = stripPrdPrefix(prd.title);
  const health = STATUS_HEALTH[computedStatus];

  return (
    <article className={`v4-spc-card v4-spc-card--${health} ${expanded ? "is-expanded" : ""}`}>
      <div className="v4-spc-card-head">
        <div className="v4-spc-card-id-block">
          <span className="v4-spc-card-id v4-pl-mono">{prd.id}</span>
          <h3 className="v4-spc-card-title">{cleanTitle}</h3>
        </div>
        <div className="v4-spc-card-meta">
          <span className={statusTagClass(computedStatus)}>{STATUS_LABEL[computedStatus]}</span>
          {prd.priority && (
            <span className={priorityTagClass(prd.priority)}>{prd.priority}</span>
          )}
          <span className="v4-spc-card-stat">
            {epics.length} {epics.length === 1 ? "epic" : "epics"}
          </span>
          <span className="v4-spc-card-stat">
            {totalTasks} {pluralRu(totalTasks, TASK_FORMS)}
          </span>
          <button
            type="button"
            className="v4-spc-card-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Свернуть детали PRD" : "Развернуть детали PRD"}
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="v4-spc-card-body">
          <PipelineFlow project={project} />

          {(prd.author || prd.date || prd.status) && (
            <div className="v4-spc-prd-meta">
              {prd.author && (
                <span>
                  <span className="v4-spc-text-muted">Автор:</span> {prd.author}
                </span>
              )}
              {prd.date && (
                <span>
                  <span className="v4-spc-text-muted">Дата:</span> {prd.date}
                </span>
              )}
              {prd.status && (
                <span>
                  <span className="v4-spc-text-muted">PRD статус:</span>{" "}
                  <span className="v4-pl-mono">{prd.status}</span>
                </span>
              )}
            </div>
          )}

          {epics.length > 0 ? (
            <div className="v4-spc-epics">
              {epics.map((e) => (
                <EpicPanel key={e.id} epic={e} />
              ))}
            </div>
          ) : (
            <div className="v4-spc-empty-inline">Нет связанных эпиков</div>
          )}
        </div>
      )}
    </article>
  );
}

export const SpecCardV4 = memo(SpecCardV4Inner);
