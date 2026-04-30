import type { SpecsProject, SpecStatus } from "../../../types";

export const STATUS_LABEL: Record<SpecStatus, string> = {
  draft: "Черновик",
  spec_ready: "Спека готова",
  in_development: "В разработке",
  completed: "Завершено",
};

/** Health/colour bucket for a single PRD status. */
export const STATUS_HEALTH: Record<SpecStatus, "ok" | "warn" | "danger" | "unknown"> = {
  draft: "warn",
  spec_ready: "unknown",
  in_development: "ok",
  completed: "ok",
};

/** v4-tag class for status badge. */
export function statusTagClass(s: SpecStatus): string {
  if (s === "in_development") return "v4-tag v4-tag--ok";
  if (s === "completed") return "v4-tag v4-tag--ok";
  if (s === "spec_ready") return "v4-tag";
  return "v4-tag v4-tag--warn"; // draft
}

/** v4-tag class for priority badge. Recognises P1-critical / P2-high / P3-medium. */
export function priorityTagClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p.includes("p1") || p.includes("critical")) return "v4-tag v4-tag--danger";
  if (p.includes("p2") || p.includes("high")) return "v4-tag v4-tag--warn";
  if (p.includes("p3") || p.includes("medium")) return "v4-tag";
  return "v4-tag";
}

/** v4-tag class for task size (S / M / L / XL). */
export function sizeTagClass(size: string): string {
  if (size === "S") return "v4-tag v4-tag--ok";
  if (size === "M") return "v4-tag";
  if (size === "L") return "v4-tag v4-tag--warn";
  if (size === "XL") return "v4-tag v4-tag--danger";
  return "v4-tag";
}

export type SpecFilter = "all" | "in_development" | "spec_ready" | "draft" | "completed";

export const SPEC_FILTERS: Array<{ key: SpecFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "in_development", label: "В разработке" },
  { key: "spec_ready", label: "Спека готова" },
  { key: "draft", label: "Черновики" },
  { key: "completed", label: "Завершено" },
];

export function applyFilter(items: SpecsProject[], f: SpecFilter): SpecsProject[] {
  if (f === "all") return items;
  return items.filter((p) => p.computedStatus === f);
}

export function applySearch(items: SpecsProject[], q: string): SpecsProject[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((p) => {
    const title = p.prd.title.toLowerCase();
    const id = p.prd.id.toLowerCase();
    if (title.includes(needle) || id.includes(needle)) return true;
    // Search in epic titles too
    return p.epics.some(
      (e) => e.title.toLowerCase().includes(needle) || e.id.toLowerCase().includes(needle),
    );
  });
}

export interface SpecsTotals {
  prds: number;
  inDevelopment: number;
  specReady: number;
  draft: number;
  completed: number;
  epics: number;
  tasks: number;
}

export function totals(items: SpecsProject[]): SpecsTotals {
  const t: SpecsTotals = {
    prds: items.length,
    inDevelopment: 0,
    specReady: 0,
    draft: 0,
    completed: 0,
    epics: 0,
    tasks: 0,
  };
  for (const p of items) {
    if (p.computedStatus === "in_development") t.inDevelopment++;
    else if (p.computedStatus === "spec_ready") t.specReady++;
    else if (p.computedStatus === "draft") t.draft++;
    else if (p.computedStatus === "completed") t.completed++;
    t.epics += p.epics.length;
    t.tasks += p.totalTasks;
  }
  return t;
}

/** Strip "PRD-NNN: " prefix from title. */
export function stripPrdPrefix(title: string): string {
  return title.replace(/^PRD-\d+:\s*/i, "");
}

/** Strip "Epic-NNN: " prefix from title. */
export function stripEpicPrefix(title: string): string {
  return title.replace(/^Epic-\d+:\s*/i, "");
}

/**
 * Russian noun pluralization.
 *   forms = [one, few (2-4), many (0, 5+, 11-14)]
 *
 * Examples:
 *   pluralRu(1,  ["задача", "задачи", "задач"]) → "задача"
 *   pluralRu(3,  ["задача", "задачи", "задач"]) → "задачи"
 *   pluralRu(5,  ["задача", "задачи", "задач"]) → "задач"
 *   pluralRu(11, ["задача", "задачи", "задач"]) → "задач"   // 11-14 are "many"
 *   pluralRu(21, ["задача", "задачи", "задач"]) → "задача"  // ends in 1, not 11
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = abs % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export const TASK_FORMS: [string, string, string] = ["задача", "задачи", "задач"];
export const SPEC_FORMS: [string, string, string] = [
  "спецификация",
  "спецификации",
  "спецификаций",
];
export const SPEC_READY_FORMS: [string, string, string] = [
  "спека готова",
  "спеки готовы",
  "спек готово",
];
