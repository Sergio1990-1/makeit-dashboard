import type { Milestone } from "../../../types";
import { deadlineTier } from "./utils";

export type MilestoneStatusKind = "done" | "overdue" | "warn" | "soon" | "norm" | "noeta";

/**
 * Map the canonical deadline tier (single source in `utils.deadlineTier`) onto
 * the visual status-kind enum. The enum keeps its historic names — `warn` =
 * week (≤7), `soon` = month (≤30), `norm` = later (>30) — because CSS classes,
 * `clsPriority`, `FILL_BY_CLS` and the status-bar `ORDER` key off them. The
 * labels shown to the user (status-bar legend / card group headers) come from
 * the canonical table so the *named* bucket is identical everywhere.
 */
const TIER_TO_KIND = {
  overdue: "overdue",
  week: "warn",
  month: "soon",
  later: "norm",
  noeta: "noeta",
} as const;

/**
 * Classify a milestone into a visual bucket. Pure — `days` should be
 * pre-computed from `daysUntil(m.dueOn)` so the caller controls the time
 * anchor.
 *
 * "done" is driven by `m.state === "CLOSED"`. An OPEN milestone whose issues
 * all happen to be closed keeps its normal deadline classification so it stays
 * visible in the deadline plan (it isn't actually finished until GitHub closes
 * the milestone).
 *
 * Resilience (issue 537): on first paint the dashboard may serve legacy cached
 * data whose milestones lack a reliable `state`. We treat a milestone with all
 * issues closed (and none open) as done WHEN `state` is missing — guarded to
 * `state !== "OPEN"` so a genuine open-but-all-closed milestone still stays in
 * the active plan. Without this, stale state-less closed milestones flash into
 * the active Gantt until the fresh fetch (with `state`) replaces them.
 */
export function classifyMilestone(m: Milestone, days: number | null): MilestoneStatusKind {
  if (m.state === "CLOSED") return "done";
  if (m.state !== "OPEN" && m.openIssues === 0 && m.closedIssues > 0) return "done";
  return TIER_TO_KIND[deadlineTier(days)];
}
