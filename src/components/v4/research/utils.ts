import type { ProjectResearch } from "../../../types";

export type Effort = "S" | "M" | "L" | "XL";
export type Impact = "critical" | "high" | "medium" | "low";

export const EFFORT_LABEL: Record<string, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
};

export const IMPACT_COLOR: Record<string, string> = {
  critical: "var(--v4-danger-500)",
  high: "var(--v4-warn-500)",
  medium: "var(--v4-accent-500)",
  low: "var(--v4-ink-400)",
};

export const IMPACT_LABEL: Record<string, string> = {
  critical: "Критический",
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

export type ResearchFilter = "all" | "withResearch" | "withDiscovery" | "noData" | "hasQuickWins";

export const RESEARCH_FILTERS: Array<{ key: ResearchFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "withResearch", label: "С research" },
  { key: "withDiscovery", label: "С discovery" },
  { key: "hasQuickWins", label: "Quick wins" },
  { key: "noData", label: "Без данных" },
];

export function applyFilter(items: ProjectResearch[], f: ResearchFilter): ProjectResearch[] {
  if (f === "all") return items;
  if (f === "withResearch") return items.filter((p) => !!p.research);
  if (f === "withDiscovery") return items.filter((p) => !!p.discovery);
  if (f === "noData") return items.filter((p) => !p.research && !p.discovery);
  if (f === "hasQuickWins") return items.filter((p) => (p.discovery?.quickWins.length ?? 0) > 0);
  return items;
}

export function applySearch(items: ProjectResearch[], q: string): ProjectResearch[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((p) => p.repo.toLowerCase().includes(needle));
}

export interface PortfolioTotals {
  projects: number;
  withResearch: number;
  withDiscovery: number;
  competitors: number;
  painPoints: number;
  opportunities: number;
  suggestions: number;
  quickWins: number;
  strategicBets: number;
  niceToHaves: number;
}

export function totals(items: ProjectResearch[]): PortfolioTotals {
  const t: PortfolioTotals = {
    projects: items.length,
    withResearch: 0,
    withDiscovery: 0,
    competitors: 0,
    painPoints: 0,
    opportunities: 0,
    suggestions: 0,
    quickWins: 0,
    strategicBets: 0,
    niceToHaves: 0,
  };
  for (const p of items) {
    if (p.research) t.withResearch++;
    if (p.discovery) t.withDiscovery++;
    if (p.research) {
      t.competitors += p.research.competitors.length;
      t.painPoints += p.research.painPoints.length;
      t.opportunities += p.research.opportunities.length;
    }
    if (p.discovery) {
      t.suggestions += p.discovery.suggestions.length;
      t.quickWins += p.discovery.quickWins.length;
      t.strategicBets += p.discovery.strategicBets.length;
      t.niceToHaves += p.discovery.niceToHaves.length;
    }
  }
  return t;
}

export function effortTagClass(e: string): string {
  if (e === "S") return "v4-tag v4-tag--ok";
  if (e === "M") return "v4-tag";
  if (e === "L") return "v4-tag v4-tag--warn";
  if (e === "XL") return "v4-tag v4-tag--danger";
  return "v4-tag";
}

export function impactTagClass(i: string): string {
  if (i === "critical") return "v4-tag v4-tag--danger";
  if (i === "high") return "v4-tag v4-tag--warn";
  if (i === "medium") return "v4-tag";
  if (i === "low") return "v4-tag";
  return "v4-tag";
}
