import type { Milestone, MilestoneIssue } from "../../../types";
import type { MilestoneStatusKind } from "./classifyMilestone";

export const REPO_GLYPH: Record<string, string> = {
  "Sewing-ERP": "#2563EB",
  "mankassa-app": "#12B76A",
  "makeit-pipeline": "#7C3AED",
  "moliyakg": "#F79009",
  "Business-News": "#EF4444",
  "biznews-kg": "#EF4444",
  "solotax-kg": "#0EA5E9",
  "quiet-walls": "#A855F7",
  "MyMoney": "#10B981",
  "makeit-auditor": "#64748B",
  "makeit-dashboard": "#0EA5E9",
  "Beer_bot": "#F97316",
  "uchet-bot": "#14B8A6",
};

export function repoGlyphColor(repo: string): string {
  return REPO_GLYPH[repo] ?? "var(--mk-ink-400)";
}

const RU_MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];
const RU_DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function ruMonthShort(d: Date): string {
  return RU_MONTHS_SHORT[d.getMonth()];
}

export function ruDow(d: Date): string {
  return RU_DOW[d.getDay()];
}

/**
 * SINGLE canonical deadline-tier table. Every milestone tile (card grouping,
 * status bar, hero breakdown, gantt colour via `classifyMilestone`) derives
 * its bucket from this one place, so the same milestone never lands in two
 * differently-named groups.
 *
 * Thresholds (days until due):
 *   overdue: < 0   week: ≤ 7   month: ≤ 30   later: > 30   noeta: no dueOn
 */
export type DeadlineTier = "overdue" | "week" | "month" | "later" | "noeta";

export function deadlineTier(days: number | null): DeadlineTier {
  if (days === null) return "noeta";
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

/** Human label + sort order for each canonical tier (card group headers,
 *  status-bar legend). Labels MUST match across every consumer. */
const TIER_META: Record<
  DeadlineTier,
  { label: string; order: number }
> = {
  overdue: { label: "Просрочено", order: 0 },
  week: { label: "Эта неделя", order: 1 },
  month: { label: "Этот месяц", order: 2 },
  later: { label: "Дальше", order: 3 },
  noeta: { label: "Без дедлайна", order: 99 },
};

export function deadlineBucket(days: number | null): {
  key: DeadlineTier;
  label: string;
  order: number;
} {
  const key = deadlineTier(days);
  return { key, ...TIER_META[key] };
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Truncate to local midnight. Gantt math compares "calendar days" — using a
 * timestamp anchored at noon would break the diffDays rounding near DST.
 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Build a 14-bucket array of issue closures, oldest first, ending with `now`.
 * Used by the Velocity hero tile sparkline & 7-day delta.
 *
 * Accepts any item with a `closedAt` timestamp — milestone-issues
 * (`MilestoneIssue`) and project-items (`Issue`) both qualify. Presence of
 * `closedAt` is the only signal we need; the explicit state check was
 * pruning legitimate closures and would also break Issue inputs (whose
 * `status` is "Done", not state="CLOSED").
 */
export function buildDaily14(
  issues: Pick<MilestoneIssue, "closedAt">[],
  now: Date,
): number[] {
  const buckets = new Array<number>(14).fill(0);
  const start = startOfDay(addDays(now, -13));
  for (const i of issues) {
    if (!i.closedAt) continue;
    const d = startOfDay(new Date(i.closedAt));
    const idx = diffDays(d, start);
    if (idx >= 0 && idx < 14) buckets[idx]++;
  }
  return buckets;
}

export interface SparkPath {
  line: string;
  area: string;
}

export function buildSparkPath(values: number[], w: number, h: number): SparkPath {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map<[number, number]>((v, i) => [
    i * stepX,
    h - (v / max) * (h - 4) - 2,
  ]);
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  const area = `${line} L${last[0].toFixed(1)},${h} L0,${h} Z`;
  return { line, area };
}

export function inferPriority(m: Milestone): "P1" | "P2" | "P3" | "P4" | null {
  const labels = (m.issues ?? []).flatMap((i) => i.labels);
  for (const p of ["P1", "P2", "P3", "P4"] as const) {
    if (labels.some((l) => l.toUpperCase().startsWith(p))) return p;
  }
  return null;
}

export function countBlocked(m: Milestone): number {
  return (m.issues ?? []).filter(
    (i) => i.state === "OPEN" && i.labels.some((l) => l.toLowerCase() === "blocked")
  ).length;
}

export function countByPriority(m: Milestone, priority: "P1" | "P2"): number {
  return (m.issues ?? []).filter(
    (i) =>
      i.state === "OPEN" &&
      i.labels.some((l) => l.toUpperCase().startsWith(priority))
  ).length;
}

/**
 * Strip "Epic-007:" / "Sprint 12:" prefixes for compact contexts (Gantt rows
 * and "Next deadline" hero tile).
 */
export function stripEpicPrefix(title: string): string {
  return title
    .replace(/^Epic-?\d+:?\s*/i, "")
    .replace(/^Sprint\s+\d+:?\s*/i, "")
    .trim();
}

export function clsPriority(cls: MilestoneStatusKind): number {
  switch (cls) {
    case "overdue":
      return 0;
    case "warn":
      return 1;
    case "soon":
      return 2;
    case "norm":
      return 3;
    case "noeta":
      return 4;
    case "done":
      return 5;
  }
}

/**
 * Best-guess milestone start used as the left edge of the Gantt bar.
 *
 * Strategy keeps bars compact within the visible window:
 * - dueOn present: max(createdAt, due − issue-scaled offset), clamped to due.
 *   Using the LATER of created vs projected avoids showing year-long bars when
 *   a milestone was created long before its deadline. The clamp to `due`
 *   prevents `start > due` for overdue milestones whose createdAt happens to
 *   be after the deadline (e.g. a milestone updated/repurposed after it
 *   expired) — without it the Gantt bar gets negative width and renders
 *   inverted.
 * - dueOn missing: today. The bar projects forward by issue count, so the
 *   chart doesn't get a 28-px stub stuck at the left edge for milestones
 *   created months ago without a deadline.
 */
export function milestoneStart(m: Milestone, fallbackNow: Date): Date {
  const today = startOfDay(fallbackNow);
  if (m.dueOn) {
    const due = startOfDay(new Date(m.dueOn));
    const total = m.openIssues + m.closedIssues;
    const projected = addDays(due, -Math.max(7, Math.round(total * 1.5)));
    let candidate = projected;
    if (m.createdAt) {
      const created = startOfDay(new Date(m.createdAt));
      if (created > projected) candidate = created;
    }
    // Clamp to dueOn so the Gantt bar can never have negative width.
    return candidate > due ? due : candidate;
  }
  return today;
}
