import { useEffect, useState } from "react";
import type { PipelineStageEntry, PhaseStatus } from "../../utils/pipeline";

export const PHASES = ["dev", "review", "qa_verify", "merge", "ci_monitor"] as const;
export type Phase = typeof PHASES[number];

export const PHASE_LABEL: Record<string, string> = {
  dev: "Dev",
  review: "Review",
  qa_verify: "QA",
  merge: "Merge",
  ci_monitor: "CI",
};

// Rolling-median expectations (in seconds). When backend exposes per-phase
// medians, replace with values from /pipeline/stats.
export const PHASE_AVG: Record<string, number> = {
  dev: 180,
  review: 90,
  qa_verify: 120,
  merge: 30,
  ci_monitor: 240,
};

export type PhaseStateKind = PhaseStatus | "pending";

export interface PhaseState {
  kind: PhaseStateKind;
  entry: PipelineStageEntry | null;
}

export interface ActiveTask {
  number: number;
  title: string;
  repo: string;
  risk_level?: "low" | "medium" | "high";
  priority?: number;
  status: string;
  complexity?: "auto" | "assisted" | "manual";
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  budgetSpent: number;
  budgetCap?: number;
  issueUrl: string;
  prUrl: string | null;
  labels: string[];
  stages: PipelineStageEntry[];
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}с`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}м ${r.toString().padStart(2, "0")}с`;
  const h = Math.floor(m / 60);
  return `${h}ч ${(m % 60).toString().padStart(2, "0")}м`;
}

export function fmtCost(usd: number | null | undefined): string {
  if (usd == null) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

export function currentPhase(stages: PipelineStageEntry[] | undefined): PipelineStageEntry | null {
  if (!stages?.length) return null;
  return stages[stages.length - 1];
}

const PRIORITY: Record<PhaseStateKind, number> = {
  running: 5,
  partial: 4,
  failure: 4,
  terminal_failure: 4,
  success: 1,
  pending: 0,
};

export function phaseStateMap(
  stages: PipelineStageEntry[] | undefined,
): Record<string, PhaseState> {
  const out: Record<string, PhaseState> = {};
  for (const p of PHASES) out[p] = { kind: "pending", entry: null };
  if (!stages) return out;
  for (const s of stages) {
    const cur = out[s.phase];
    if (!cur) continue;
    const incomingP = PRIORITY[s.status as PhaseStateKind] ?? 0;
    const currentP = PRIORITY[cur.kind] ?? 0;
    if (incomingP >= currentP) {
      out[s.phase] = { kind: s.status as PhaseStateKind, entry: s };
    }
  }
  return out;
}

export function phaseRunCounts(
  stages: PipelineStageEntry[] | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!stages) return counts;
  for (const s of stages) counts[s.phase] = (counts[s.phase] || 0) + 1;
  return counts;
}

export interface Anomalies {
  stuck: boolean;
  starting: boolean;
  budget: boolean;
  overbudget: boolean;
  retryLoop: boolean;
  // Number of complete dev↔review cycles. ≥3 triggers `retryLoop`. Surfaced
  // so the UI can show the actual count instead of a placeholder.
  loopCount: number;
  anyAnomaly: boolean;
  avg: number;
}

export function detectAnomalies(task: ActiveTask): Anomalies {
  const cur = currentPhase(task.stages);
  const avg = cur ? (PHASE_AVG[cur.phase] ?? 60) : 60;
  const stuck = !!cur && cur.status === "running" && cur.duration_seconds > avg * 1.5;
  const starting = !!cur && cur.status === "running" && cur.duration_seconds < 5;
  const cap = task.budgetCap;
  const spent = task.budgetSpent ?? 0;
  const ratio = cap && cap > 0 ? spent / cap : 0;
  const budget = cap != null && ratio >= 0.8;
  const overbudget = cap != null && ratio >= 0.95;
  const counts = phaseRunCounts(task.stages);
  const totalDevReview = (counts.dev || 0) + (counts.review || 0);
  // Each cycle contributes one dev + one review entry.
  const loopCount = Math.floor(totalDevReview / 2);
  const retryLoop = totalDevReview >= 5;
  const anyAnomaly = stuck || budget || overbudget || retryLoop;
  return { stuck, starting, budget, overbudget, retryLoop, loopCount, anyAnomaly, avg };
}

export function phaseDistribution(tasks: ActiveTask[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PHASES) out[p] = 0;
  for (const t of tasks) {
    const cur = currentPhase(t.stages);
    if (cur && out[cur.phase] != null) out[cur.phase]++;
  }
  return out;
}

export function totalSpent(tasks: ActiveTask[]): number {
  return tasks.reduce((acc, t) => acc + (t.budgetSpent || 0), 0);
}

export function sumStageCost(stages: PipelineStageEntry[] | undefined): number {
  if (!stages) return 0;
  return stages.reduce((acc, s) => acc + (s.cost_usd || 0), 0);
}

// Live-clock hook: re-renders every `intervalMs` while `active`. Used to tick
// a phase's running-duration without polling the backend.
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

// Determine accent strip colour for a card based on detected anomalies.
export function stripVariant(a: Anomalies): "running" | "warn" | "danger" | "idle" {
  if (a.retryLoop || a.overbudget) return "danger";
  if (a.stuck || a.budget) return "warn";
  if (a.starting) return "idle";
  return "running";
}

// Collapse a verbose review event into a compact verdict for UI display.
export function reviewVerdict(event: string): string | null {
  if (event === "review_approved") return "APPROVED";
  if (event === "review_changes_requested") return "CHANGES_REQUESTED";
  return null;
}
