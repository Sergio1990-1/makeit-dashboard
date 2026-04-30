import type { ResearchAgentStatus } from "../../../utils/pipeline";

interface Props {
  status: ResearchAgentStatus;
  onDismiss: () => void;
}

export function ResearchAgentBanner({ status, onDismiss }: Props) {
  const isDone = status.status === "done";
  const isError = status.status === "error";
  const isActive = !isDone && !isError;
  const label = status.agent === "research" ? "Research" : "Discovery";
  const health = isError ? "danger" : isDone ? "ok" : "warn";

  return (
    <div className={`v4-rsh-agent v4-rsh-agent--${health}`} role="status">
      <div className="v4-rsh-agent-h">
        <div className="v4-rsh-agent-label">
          <span className={`v4-rsh-agent-dot v4-rsh-agent-dot--${health}`} aria-hidden="true" />
          <b>{label} агент</b>
          {status.project && (
            <span className="v4-pl-mono v4-rsh-text-muted">{status.project.split("/").pop()}</span>
          )}
        </div>
        <div className="v4-rsh-agent-stage">
          {isError ? (status.error ?? "Ошибка") : isDone ? "Завершён" : status.stage}
        </div>
        {(isDone || isError) && (
          <button
            type="button"
            className="v4-btn v4-rsh-agent-dismiss"
            onClick={onDismiss}
            aria-label="Скрыть"
          >
            ✕
          </button>
        )}
      </div>
      {isActive && (
        <div
          className="v4-rsh-agent-track"
          role="progressbar"
          aria-valuenow={status.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="v4-rsh-agent-fill"
            style={{ width: `${Math.max(2, status.progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}
