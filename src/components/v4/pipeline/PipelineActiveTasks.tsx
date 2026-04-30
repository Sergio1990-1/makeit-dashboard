import { useEffect, useRef, useState } from "react";
import type {
  PipelineQueueItem,
  PipelineStageEntry,
  PipelineStatus,
} from "../../../utils/pipeline";
import { PhaseDots } from "./PhaseDots";
import { RiskDot } from "./badges";
import { formatDuration } from "./utils";

interface Props {
  status: PipelineStatus | null;
  /** Reset trigger to clear taskSeenAt on a new run */
  runEpoch: number;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "В очереди",
  in_progress: "В работе",
  pr_open: "PR открыт",
  in_review: "На ревью",
  retry: "Повтор",
  done: "Готово",
  needs_human: "Нужен человек",
  rolled_back: "Откат",
};

function LiveTimer({ startMs }: { startMs?: number }) {
  // Hold "now" in state and bump it each second — keeps the elapsed value
  // as a derived render based on stable inputs (state, props), avoiding the
  // impure Date.now() call inside the render body.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startMs]);
  if (startMs == null) return null;
  const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
  return <span className="v4-pl-mono v4-pl-active-timer">{formatDuration(elapsed)}</span>;
}

export function PipelineActiveTasks({ status, runEpoch }: Props) {
  const taskSeenAtRef = useRef<Map<number, number>>(new Map());

  // Reset on new run
  useEffect(() => {
    taskSeenAtRef.current = new Map();
  }, [runEpoch]);

  // Derive active items first (pure computation), then sync the seen-map in
  // an effect — avoids calling Date.now() during render.
  const issueStages: Record<number, PipelineStageEntry[]> =
    status?.issue_stages ?? {};
  const completedNums = new Set(status?.results.map((r) => r.issue_number) ?? []);
  const stageIssueNums = Object.keys(issueStages)
    .map(Number)
    .filter((n) => !completedNums.has(n));
  const queueNums = new Set(status?.queue.map((q) => q.number) ?? []);
  const extraNums = stageIssueNums.filter((n) => !queueNums.has(n));
  const allItems: PipelineQueueItem[] = status
    ? [
        ...extraNums.map(
          (n): PipelineQueueItem => ({
            number: n,
            title: `Issue #${n}`,
            status: "in_progress",
            priority: 0,
          })
        ),
        ...status.queue.filter((q) => !completedNums.has(q.number)),
      ]
    : [];

  // Encode the active task set as a stable key so the effect runs only when
  // membership changes, not on every status poll that returns identical data.
  const activeKey = allItems
    .map((i) => i.number)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    const seen = taskSeenAtRef.current;
    const activeNums = new Set<number>(activeKey ? activeKey.split(",").map(Number) : []);
    // Side effect — Date.now() is fine inside useEffect (post-render).
    // The purity rule flags this conservatively; the rule is intended for
    // render-body, not effects. Disable narrowly with rationale.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    activeNums.forEach((n) => {
      if (!seen.has(n)) seen.set(n, now);
    });
    Array.from(seen.keys()).forEach((n) => {
      if (!activeNums.has(n)) seen.delete(n);
    });
  }, [activeKey]);

  if (!status?.running) return null;

  const seen = taskSeenAtRef.current;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Активные задачи{" "}
          <span className="v4-tag">{status.active_tasks ?? allItems.length}</span>
        </div>
      </div>
      <div className="v4-pl-active-list">
        {allItems.length === 0 ? (
          <div className="v4-empty">Ожидание задач…</div>
        ) : (
          allItems.slice(0, 10).map((item) => {
            const liveStages = issueStages[item.number];
            const fallbackStartMs = seen.get(item.number);
            return (
              <div key={item.number} className="v4-pl-active-row">
                <span className="v4-pl-mono v4-pl-active-num">#{item.number}</span>
                <RiskDot riskLevel={item.risk_level} />
                <span className="v4-pl-active-title">{item.title}</span>
                {liveStages ? (
                  <PhaseDots stages={liveStages} compact />
                ) : (
                  <span className="v4-pl-active-status">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                )}
                <LiveTimer startMs={fallbackStartMs} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
