import type { Milestone } from "../../../types";

export type MilestoneStatusKind = "done" | "overdue" | "warn" | "soon" | "norm" | "noeta";

/**
 * Classify a milestone into a visual bucket. Pure — `days` should be
 * pre-computed from `daysUntil(m.dueOn)` so the caller controls the time
 * anchor.
 */
export function classifyMilestone(m: Milestone, days: number | null): MilestoneStatusKind {
  const total = m.openIssues + m.closedIssues;
  if (m.state === "CLOSED" || (total > 0 && m.openIssues === 0)) return "done";
  if (days === null) return "noeta";
  if (days < 0) return "overdue";
  if (days <= 3) return "warn";
  if (days <= 14) return "soon";
  return "norm";
}
