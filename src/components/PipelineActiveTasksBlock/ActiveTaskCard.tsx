import { useState } from "react";
import {
  type ActiveTask,
  PHASES,
  PHASE_LABEL,
  currentPhase,
  detectAnomalies,
  fmtCost,
  fmtDuration,
  phaseStateMap,
  stripVariant,
  useNow,
} from "./helpers";
import { ChevronIcon } from "./icons";
import { PHASE_ICON } from "./phase-icons";

interface Props {
  task: ActiveTask;
  density?: "comfortable" | "compact";
  showV2?: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function PriChip({ p }: { p?: number }) {
  if (!p) return null;
  const tier = Math.min(4, Math.max(1, p));
  return <span className={`pl2-pri pl2-pri--p${tier}`}>P{tier}</span>;
}

function DotChain({ task }: { task: ActiveTask }) {
  const states = phaseStateMap(task.stages);
  return (
    <div className="pl2-dotchain" aria-label="Прогресс по фазам">
      {PHASES.map((p, i) => {
        const st = states[p];
        const cls = `pl2-dotchain-dot pl2-dotchain-dot--${st.kind} pl2-ph-${p}`;
        const lineCls = `pl2-dotchain-line pl2-dotchain-line--${st.kind}`;
        const tip = `${PHASE_LABEL[p]} · ${st.kind}`;
        return (
          <span key={p} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span className={lineCls} />}
            <span className={cls} title={tip} />
          </span>
        );
      })}
    </div>
  );
}

export function ActiveTaskCard({
  task,
  density = "comfortable",
  showV2 = false,
  expanded,
  onToggle,
}: Props) {
  const cur = currentPhase(task.stages);
  const a = detectAnomalies(task);

  // Live timer: backend returned `cur.duration_seconds` at last poll;
  // keep ticking client-side. Re-anchor in render when the running phase
  // identity changes so the displayed duration stays in sync with the
  // server's reported value at fetch time. (React's "storing prior render"
  // pattern: https://react.dev/reference/react/useState#storing-information-from-previous-renders.)
  const now = useNow(true, 1000);
  const phaseKey = cur ? `${cur.phase}:${(cur as { ts?: number }).ts ?? ""}` : "";
  const baseSecs = cur?.duration_seconds || 0;
  const [anchor, setAnchor] = useState<{ key: string; baseSecs: number; nowMs: number }>(() => ({
    key: phaseKey,
    baseSecs,
    nowMs: now,
  }));
  if (anchor.key !== phaseKey || anchor.baseSecs !== baseSecs) {
    setAnchor({ key: phaseKey, baseSecs, nowMs: now });
  }
  const liveSecs =
    cur?.status === "running" && anchor.key === phaseKey
      ? anchor.baseSecs + Math.max(0, Math.floor((now - anchor.nowMs) / 1000))
      : baseSecs;

  const stripCls = `pl2-card-strip--${stripVariant(a)}`;
  const isPlaceholderTitle = !task.title || /^Issue\s+#/.test(task.title);

  return (
    <div className="pl2-card-wrap">
      <article
        className={`pl2-card${density === "compact" ? " is-density-compact" : ""}`}
      >
        <span className={`pl2-card-strip ${stripCls}`} />

        <div className="pl2-c-row">
          {/* Identity */}
          <a
            className="pl2-num"
            href={task.issueUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            #{task.number}
          </a>
          {task.risk_level && (
            <span
              className={`pl2-risk-dot pl2-risk-dot--${task.risk_level}`}
              title={`Риск: ${task.risk_level}`}
              aria-label={`Риск ${task.risk_level}`}
            />
          )}
          <PriChip p={task.priority} />

          {/* Title */}
          <span
            className={`pl2-title${isPlaceholderTitle ? " pl2-title-placeholder" : ""}`}
            title={task.title}
          >
            {task.title || `Issue #${task.number}`}
          </span>

          {/* Phase progress (5 dots) */}
          <DotChain task={task} />

          {/* Active phase chip */}
          {cur && (
            <span className={`pl2-c-phase pl2-ph-${cur.phase}`}>
              <span className="pl2-c-phase-ic">{PHASE_ICON[cur.phase]}</span>
              <span className="pl2-c-phase-name">{PHASE_LABEL[cur.phase] ?? cur.phase}</span>
            </span>
          )}

          {/* Stat columns */}
          <div className="pl2-c-stats">
            <div className="pl2-c-stat">
              <span className="pl2-c-stat-l">фаза</span>
              <span className={`pl2-c-stat-v${a.stuck ? " pl2-attempt-warn" : ""}`}>
                {fmtDuration(liveSecs)}
              </span>
            </div>
            <div className="pl2-c-stat">
              <span className="pl2-c-stat-l">$</span>
              <span
                className={`pl2-c-stat-v ${
                  a.overbudget ? "pl2-cost--danger" : a.budget ? "pl2-cost--warn" : "pl2-cost"
                }`}
              >
                {fmtCost(task.budgetSpent)}
              </span>
            </div>
            {showV2 && task.attempt != null && task.maxAttempts != null && (
              <div className="pl2-c-stat pl2-c-stat--attempt">
                <span className="pl2-c-stat-l">↻</span>
                <span
                  className={`pl2-c-stat-v ${
                    task.attempt >= task.maxAttempts
                      ? "pl2-attempt-danger"
                      : task.attempt > 1
                        ? "pl2-attempt-warn"
                        : ""
                  }`}
                >
                  {task.attempt}/{task.maxAttempts}
                </span>
              </div>
            )}
            {showV2 && task.model && (
              <div className="pl2-c-stat pl2-c-stat--model">
                <span className="pl2-c-stat-l">model</span>
                <span className="pl2-c-stat-v">{task.model}</span>
              </div>
            )}
          </div>
        </div>

        {/* Anomaly secondary row */}
        {(a.anyAnomaly || cur?.summary) && density !== "compact" && (
          <div className="pl2-c-anrow">
            {a.retryLoop && (
              <span className="pl2-an pl2-an--retry">
                ⟲ Цикл review↔dev ×{a.loopCount}
              </span>
            )}
            {a.stuck && (
              <span className="pl2-an pl2-an--stuck">
                ⏱ Долго (avg {fmtDuration(a.avg)})
              </span>
            )}
            {a.overbudget && task.budgetCap != null && (
              <span className="pl2-an pl2-an--overbudget">
                $ Перерасход {fmtCost(task.budgetSpent)}/{fmtCost(task.budgetCap)}
              </span>
            )}
            {!a.overbudget && a.budget && (
              <span className="pl2-an pl2-an--budget">$ К лимиту</span>
            )}
            {cur?.summary && <span className="pl2-c-substep">→ {cur.summary}</span>}
          </div>
        )}

        <button
          className="pl2-card-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Свернуть детали задачи" : "Развернуть детали задачи"}
        >
          <ChevronIcon open={expanded} />
        </button>
      </article>
    </div>
  );
}
