/**
 * Mock data for the Pipeline Active Tasks block. Used by `?pipeline-demo=1`
 * URL flag (see App.tsx) to render the block without a live backend, so we
 * can iterate on the design and verify states visually.
 */
import type { PipelineStatus, PipelineStageEntry } from "../../utils/pipeline";

interface MakeStagesArgs {
  done?: Array<{
    phase: PipelineStageEntry["phase"];
    status?: PipelineStageEntry["status"];
    duration: number;
    cost: number;
    summary?: string;
  }>;
  current?: {
    phase: PipelineStageEntry["phase"];
    runningFor: number;
    costSoFar?: number;
    summary?: string;
  } | null;
}

function makeStages({ done = [], current = null }: MakeStagesArgs): PipelineStageEntry[] {
  const out: PipelineStageEntry[] = [];
  done.forEach((s) => {
    out.push({
      phase: s.phase,
      status: s.status ?? "success",
      event: s.status === "failure" ? "phase_failed" : "phase_complete",
      duration_seconds: s.duration,
      cost_usd: s.cost,
      summary: s.summary ?? "",
    });
  });
  if (current) {
    out.push({
      phase: current.phase,
      status: "running",
      event: "phase_started",
      duration_seconds: current.runningFor,
      cost_usd: current.costSoFar ?? 0,
      summary: current.summary ?? "",
    });
  }
  return out;
}

const ISSUE_STAGES_NORMAL: Record<number, PipelineStageEntry[]> = {
  1618: makeStages({
    current: { phase: "dev", runningFor: 72, costSoFar: 0.42, summary: "генерирую diff" },
  }),
  1602: makeStages({
    done: [
      { phase: "dev", status: "success", duration: 215, cost: 0.94, summary: "diff +147/-32" },
    ],
    current: { phase: "review", runningFor: 38, costSoFar: 0.24, summary: "сверяю с CONTRIBUTING.md" },
  }),
  1591: makeStages({
    done: [
      { phase: "dev", status: "success", duration: 142, cost: 0.61, summary: "diff +28/-14" },
      { phase: "review", status: "success", duration: 64, cost: 0.18, summary: "APPROVED" },
    ],
    current: { phase: "qa_verify", runningFor: 95, costSoFar: 1.07, summary: "tsc + vitest" },
  }),
  1577: makeStages({
    done: [
      { phase: "dev", status: "success", duration: 320, cost: 1.12, summary: "diff +52/-7" },
      { phase: "review", status: "partial", duration: 88, cost: 0.32, summary: "CHANGES_REQUESTED: missing tsc check" },
      { phase: "dev", status: "success", duration: 165, cost: 0.42, summary: "fixed" },
      { phase: "review", status: "partial", duration: 64, cost: 0.24, summary: "CHANGES_REQUESTED: still missing test" },
      { phase: "dev", status: "success", duration: 122, cost: 0.18, summary: "added test" },
    ],
    current: { phase: "review", runningFor: 28, costSoFar: 0.06, summary: "" },
  }),
  1623: makeStages({
    current: { phase: "dev", runningFor: 487, costSoFar: 1.8, summary: "ожидание ответа модели" },
  }),
  1574: makeStages({
    done: [
      { phase: "dev", status: "success", duration: 240, cost: 1.05, summary: "diff +88/-22" },
      { phase: "review", status: "success", duration: 70, cost: 0.22, summary: "APPROVED" },
    ],
    current: { phase: "merge", runningFor: 12, costSoFar: 0.04, summary: "git merge --ff-only" },
  }),
};

const QUEUE = [
  { number: 1618, title: "Add billing webhook with retry-on-429", status: "in_progress", priority: 1, risk_level: "low" as const },
  { number: 1602, title: "Sewing-ERP: orders.list pagination cursor", status: "in_review", priority: 2, risk_level: "medium" as const },
  { number: 1591, title: "mankassa-app: i18n fallback for unknown locale", status: "in_progress", priority: 3, risk_level: "low" as const },
  { number: 1577, title: "makeit-pipeline: stale lock cleanup on crash", status: "in_progress", priority: 1, risk_level: "high" as const },
  { number: 1623, title: "solotax-kg: tax rates table sync", status: "in_progress", priority: 2, risk_level: "high" as const },
  { number: 1574, title: "Sewing-ERP: migrate auth to JWKS rotation", status: "in_progress", priority: 1, risk_level: "medium" as const },
];

export const DEMO_STATUS_RUNNING: PipelineStatus = {
  running: true,
  stopping: false,
  current_project: "moliyakg",
  active_tasks: 6,
  results: [],
  queue: QUEUE,
  issue_stages: ISSUE_STAGES_NORMAL,
};

export const DEMO_STATUS_STOPPING: PipelineStatus = {
  ...DEMO_STATUS_RUNNING,
  stopping: true,
  active_tasks: 2,
  queue: QUEUE.slice(0, 2),
  issue_stages: {
    1618: ISSUE_STAGES_NORMAL[1618],
    1602: ISSUE_STAGES_NORMAL[1602],
  },
};

export const DEMO_STATUS_LOOKING: PipelineStatus = {
  running: true,
  stopping: false,
  current_project: "moliyakg",
  active_tasks: 0,
  results: [],
  queue: [],
  issue_stages: {},
};
