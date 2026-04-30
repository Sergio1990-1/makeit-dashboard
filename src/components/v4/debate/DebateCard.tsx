import type { DebateListItem } from "../../../types/debate";
import {
  consensusTagClass,
  CONSENSUS_LABEL,
  fmtAge,
  fmtCost,
  statusTagClass,
  STATUS_LABEL,
} from "./utils";

interface Props {
  debate: DebateListItem;
  nowMs: number;
  onOpen: () => void;
}

export function DebateCard({ debate: d, nowMs, onOpen }: Props) {
  const isRunning = d.status === "running" || d.status === "queued";
  const isError = d.status === "error";
  const isDone = d.status === "done";
  const project = d.project ? d.project.split("/").pop() : null;
  const health: "ok" | "warn" | "danger" | "neutral" =
    isError ? "danger"
    : isRunning ? "warn"
    : isDone ? "ok"
    : "neutral";

  return (
    <button
      type="button"
      className={`v4-db-card v4-db-card--${health}`}
      onClick={onOpen}
      aria-label={`Открыть дебат: ${d.topic}`}
    >
      <div className="v4-db-card-h">
        <span className={statusTagClass(d.status)}>{STATUS_LABEL[d.status]}</span>
        {isDone && (
          <span className={consensusTagClass(d.consensus_level)}>
            {CONSENSUS_LABEL[d.consensus_level]}
          </span>
        )}
        {isRunning && (
          <span className="v4-db-card-running-dot" aria-hidden="true" />
        )}
      </div>

      <div className="v4-db-card-topic">{d.topic}</div>

      <div className="v4-db-card-meta">
        {project && (
          <span className="v4-tag v4-db-card-project" title={d.project}>
            {project}
          </span>
        )}
        <span className="v4-pl-mono v4-db-card-cost" title="Стоимость API-вызовов">
          {fmtCost(d.total_cost ?? 0)}
        </span>
        <span className="v4-pl-mono v4-db-card-age">{fmtAge(d.created_at, nowMs)}</span>
      </div>
    </button>
  );
}
