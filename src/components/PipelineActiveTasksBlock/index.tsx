import { useMemo, useState } from "react";
import type {
  PipelineQueueItem,
  PipelineResult,
  PipelineStageEntry,
  PipelineStatus,
} from "../../utils/pipeline";
import { GITHUB_OWNER } from "../../utils/config";
import { ActiveTaskCard } from "./ActiveTaskCard";
import { LookingBanner, SkeletonRow, StoppingBanner } from "./Banners";
import { ExpandedTimeline } from "./ExpandedTimeline";
import { PanelHeader } from "./PanelHeader";
import { type ActiveTask, sumStageCost } from "./helpers";
import "./styles.css";

const MAX_VISIBLE = 6;

interface Props {
  status: PipelineStatus;
  density?: "comfortable" | "compact";
  showV2?: boolean;
  /**
   * Optional callback to open the IssueContext modal (PR #196).
   * Called from the per-card expanded view when the operator wants
   * the full backend-side context for one issue.
   */
  onOpenContext?: (issueNumber: number) => void;
}

function buildIssueUrl(project: string | null, number: number): string {
  if (!project) return `https://github.com/${GITHUB_OWNER}`;
  // pipeline's `current_project` may already include the owner prefix
  // (e.g. "Sergio1990-1/moliyakg") — keep as-is in that case to avoid
  // duplicating the owner. A bare repo name gets the default owner.
  const slug = project.includes("/") ? project : `${GITHUB_OWNER}/${project}`;
  return `https://github.com/${slug}/issues/${number}`;
}

function repoLabel(project: string | null): string | null {
  if (!project) return null;
  const i = project.indexOf("/");
  return i >= 0 ? project.slice(i + 1) : project;
}

function mapToActiveTasks(
  status: PipelineStatus,
  completedNums: Set<number>,
): { tasks: ActiveTask[]; total: number } {
  const issueStages = status.issue_stages ?? {};
  const repo = status.current_project ?? null;

  const stageIssueNums = Object.keys(issueStages)
    .map(Number)
    .filter((n) => !completedNums.has(n));
  const queueNums = new Set(status.queue.map((q) => q.number));
  const extraNums = stageIssueNums.filter((n) => !queueNums.has(n));

  const allItems: PipelineQueueItem[] = [
    ...extraNums.map(
      (n): PipelineQueueItem => ({
        number: n,
        title: `Issue #${n}`,
        status: "in_progress",
        priority: 0,
      }),
    ),
    ...status.queue.filter((q) => !completedNums.has(q.number)),
  ];

  const tasks: ActiveTask[] = allItems.map((item) => {
    const stages: PipelineStageEntry[] = issueStages[item.number] ?? [];
    return {
      number: item.number,
      title: item.title,
      repo: repo ?? "",
      risk_level: item.risk_level,
      priority: item.priority || undefined,
      status: item.status,
      complexity: undefined,
      model: undefined,
      attempt: undefined,
      maxAttempts: undefined,
      budgetSpent: sumStageCost(stages),
      budgetCap: undefined,
      issueUrl: buildIssueUrl(repo, item.number),
      prUrl: null,
      labels: [],
      stages,
    };
  });

  return { tasks, total: status.active_tasks || tasks.length };
}

export function PipelineActiveTasksBlock({
  status,
  density = "comfortable",
  showV2 = false,
  onOpenContext,
}: Props) {
  const completedNums = useMemo(
    () => new Set<number>((status.results || []).map((r: PipelineResult) => r.issue_number)),
    [status.results],
  );
  const { tasks, total } = useMemo(
    () => mapToActiveTasks(status, completedNums),
    [status, completedNums],
  );

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  // Prune expanded entries for tasks that disappeared (completed or removed)
  // — without this the Set grows unbounded over a long-running session.
  // Uses React's "storing prior render" pattern for prop-derived state, which
  // avoids the linter's set-state-in-effect rule.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const tasksKey = tasks
    .map((t) => t.number)
    .sort((a, b) => a - b)
    .join(",");
  const [prevTasksKey, setPrevTasksKey] = useState(tasksKey);
  if (prevTasksKey !== tasksKey) {
    setPrevTasksKey(tasksKey);
    if (expanded.size > 0) {
      const visibleNums = new Set(tasks.map((t) => t.number));
      let changed = false;
      const pruned = new Set<number>();
      expanded.forEach((n) => {
        if (visibleNums.has(n)) pruned.add(n);
        else changed = true;
      });
      if (changed) setExpanded(pruned);
    }
  }

  function toggle(n: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const isStopping = !!status.stopping;
  const isRunningEmpty = !!status.running && tasks.length === 0 && !isStopping;
  const visible = tasks.slice(0, MAX_VISIBLE);
  const hidden = tasks.length - visible.length;

  return (
    <div className="pl2-panel">
      <PanelHeader
        tasks={tasks}
        total={total}
        projectName={repoLabel(status.current_project ?? null)}
      />
      {isStopping && <StoppingBanner count={tasks.length} />}
      {isRunningEmpty && <LookingBanner />}

      <div>
        {isRunningEmpty ? (
          <>
            <SkeletonRow width={220} />
            <SkeletonRow width={180} />
          </>
        ) : tasks.length === 0 ? (
          <div className="pl2-empty">Нет активных задач.</div>
        ) : (
          visible.map((t) => (
            <div key={t.number}>
              <ActiveTaskCard
                task={t}
                density={density}
                showV2={showV2}
                expanded={expanded.has(t.number)}
                onToggle={() => toggle(t.number)}
              />
              {expanded.has(t.number) && (
                <ExpandedTimeline
                  task={t}
                  onOpenContext={onOpenContext ? () => onOpenContext(t.number) : undefined}
                />
              )}
            </div>
          ))
        )}
        {hidden > 0 && (
          <div
            className="pl2-empty"
            style={{ padding: "8px 18px", fontSize: 12, textAlign: "left" }}
          >
            ещё {hidden} {hidden === 1 ? "задача" : hidden < 5 ? "задачи" : "задач"} в работе…
          </div>
        )}
      </div>
    </div>
  );
}
