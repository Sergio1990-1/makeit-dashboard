import { useState } from "react";
import {
  type ActiveTask,
  PHASE_LABEL,
  fmtCost,
  fmtDuration,
  reviewVerdict,
} from "./helpers";
import { CopyIcon } from "./icons";

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* ignore */
    }
    document.body.removeChild(ta);
    resolve();
  });
}

export function ExpandedTimeline({ task }: { task: ActiveTask }) {
  const stages = task.stages || [];
  const [copied, setCopied] = useState(false);

  async function handleCopyLogCommand() {
    const cmd = `tail -f ~/.makeit-pipeline/logs/issue-${task.number}.log`;
    await copyToClipboard(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="pl2-exp">
      <div className="pl2-exp-meta">
        <div className="pl2-exp-meta-l">
          {task.complexity && (
            <span className={`pl2-cx pl2-cx--${task.complexity}`}>{task.complexity}</span>
          )}
          {task.model && (
            <span className="pl2-meta-mono">
              model: <b>{task.model}</b>
            </span>
          )}
          {task.attempt != null && task.maxAttempts != null && (
            <span className="pl2-meta-mono">
              попытка: <b>{task.attempt}/{task.maxAttempts}</b>
            </span>
          )}
          {task.budgetCap != null && (
            <span className="pl2-meta-mono">
              бюджет:{" "}
              <b>
                {fmtCost(task.budgetSpent)} / {fmtCost(task.budgetCap)}
              </b>
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l} className="pl2-exp-label">
              {l}
            </span>
          ))}
        </div>
        <div className="pl2-exp-meta-r">
          <a className="pl2-btn" href={task.issueUrl} target="_blank" rel="noreferrer">
            Open issue ↗
          </a>
          {task.prUrl && (
            <a className="pl2-btn" href={task.prUrl} target="_blank" rel="noreferrer">
              Open PR ↗
            </a>
          )}
          <button
            type="button"
            className="pl2-btn pl2-btn--ghost"
            onClick={handleCopyLogCommand}
            title="Скопировать команду для tail -f"
          >
            <CopyIcon />
            {copied ? "скопировано" : "tail logs"}
          </button>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="pl2-empty" style={{ padding: "8px 4px", textAlign: "left" }}>
          Шаги ещё не записаны. Дождитесь начала первой фазы.
        </div>
      ) : (
        <div className="pl2-exp-tl">
          {stages.map((s, i) => {
            const isCurrent = i === stages.length - 1 && s.status === "running";
            const isRetry = stages.findIndex((p, j) => j < i && p.phase === s.phase) !== -1;
            const cls = `pl2-exp-step pl2-ph-${s.phase} is-${s.status}${
              isCurrent ? " is-current" : ""
            }${isRetry ? " is-retry" : ""}`;
            const verdict = s.phase === "review" ? reviewVerdict(s.event) : null;
            const summaryText = s.summary || (verdict ? verdict : "");
            const emphasized =
              isCurrent || (i === stages.length - 1 && s.status !== "running");
            return (
              <div key={`${s.phase}-${s.event}-${s.status}-${i}`} className={cls}>
                <div className="pl2-exp-step-bullet">
                  {s.status === "success"
                    ? "✓"
                    : s.status === "partial"
                      ? "!"
                      : s.status === "failure" || s.status === "terminal_failure"
                        ? "✕"
                        : s.status === "running"
                          ? ""
                          : "·"}
                </div>
                <div>
                  <div className="pl2-exp-step-h">
                    <span className="pl2-exp-step-name">
                      {PHASE_LABEL[s.phase] ?? s.phase}
                    </span>
                    {isRetry && <span className="pl2-an pl2-an--retry">retry</span>}
                    {s.duration_seconds > 0 && (
                      <span className="pl2-meta-mono">{fmtDuration(s.duration_seconds)}</span>
                    )}
                    {s.cost_usd > 0 && (
                      <span className="pl2-meta-mono pl2-cost">{fmtCost(s.cost_usd)}</span>
                    )}
                    {verdict && (
                      <span className="pl2-meta-mono" style={{ fontWeight: 600 }}>
                        {verdict}
                      </span>
                    )}
                  </div>
                  {summaryText && (
                    <div className={`pl2-exp-step-sum${emphasized ? " is-emphasized" : ""}`}>
                      {summaryText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
