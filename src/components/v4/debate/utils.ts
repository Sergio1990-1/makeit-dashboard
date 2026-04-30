import type { DebateListItem } from "../../../types/debate";

export const STATUS_LABEL: Record<DebateListItem["status"], string> = {
  queued: "В очереди",
  running: "В работе",
  done: "Завершён",
  error: "Ошибка",
};

export const CONSENSUS_LABEL: Record<DebateListItem["consensus_level"], string> = {
  unanimous: "Единогласно",
  majority: "Большинство",
  contested: "Спорно",
};

export type DebateFilter = "all" | "running" | "done" | "error";

export const DEBATE_FILTERS: Array<{ key: DebateFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "running", label: "В работе" },
  { key: "done", label: "Завершены" },
  { key: "error", label: "Ошибки" },
];

export function applyFilter(items: DebateListItem[], f: DebateFilter): DebateListItem[] {
  if (f === "all") return items;
  if (f === "running") return items.filter((d) => d.status === "running" || d.status === "queued");
  return items.filter((d) => d.status === f);
}

export function applySearch(items: DebateListItem[], q: string): DebateListItem[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((d) =>
    d.topic.toLowerCase().includes(needle) ||
    (d.project ?? "").toLowerCase().includes(needle),
  );
}

export type DebateSort = "date" | "cost";

export function applySort(items: DebateListItem[], by: DebateSort): DebateListItem[] {
  const arr = [...items];
  if (by === "cost") {
    arr.sort((a, b) => (b.total_cost ?? 0) - (a.total_cost ?? 0));
  } else {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return arr;
}

export function totalCost(items: DebateListItem[]): number {
  return items.reduce((s, d) => s + (d.total_cost ?? 0), 0);
}

export function fmtCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

export function fmtAge(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) return "только что";
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}д назад`;
  if (d < 30) return `${Math.floor(d / 7)} нед назад`;
  return `${Math.floor(d / 30)} мес назад`;
}

export function statusTagClass(s: DebateListItem["status"]): string {
  if (s === "done") return "v4-tag v4-tag--ok";
  if (s === "running") return "v4-tag v4-tag--warn";
  if (s === "error") return "v4-tag v4-tag--danger";
  return "v4-tag";
}

export function consensusTagClass(c: DebateListItem["consensus_level"]): string {
  if (c === "unanimous") return "v4-tag v4-tag--ok";
  if (c === "contested") return "v4-tag v4-tag--danger";
  return "v4-tag";
}
