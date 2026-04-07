/**
 * Parsers for RESEARCH.md and DISCOVERY.md files.
 * Mirrors the Python parsers in makeit-pipeline (research.py / discovery.py).
 */

import type {
  ResearchCompetitor,
  ResearchPainPoint,
  ResearchData,
  DiscoverySuggestion,
  DiscoveryData,
} from "../types";

// ── RESEARCH.md parsing ──

function parseCompetitors(md: string): ResearchCompetitor[] {
  const competitors: ResearchCompetitor[] = [];
  let current: ResearchCompetitor | null = null;
  let inSection = false;

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();

    if (stripped.startsWith("## ") && (lower.includes("конкурент") || lower.includes("competitor"))) {
      inSection = true;
      continue;
    }
    if (inSection && stripped.startsWith("## ")) break;
    if (!inSection) continue;

    if (stripped.startsWith("### ")) {
      if (current) competitors.push(current);
      current = { name: stripped.slice(4).trim(), url: "", features: [], pricing: "", audience: "" };
    } else if (current) {
      if (lower.startsWith("- url:") || lower.startsWith("- сайт:")) {
        current.url = stripped.split(":", 2).slice(1).join(":").trim();
      } else if (lower.startsWith("- pricing:") || lower.startsWith("- цена:")) {
        current.pricing = stripped.split(":", 2).slice(1).join(":").trim();
      } else if (lower.startsWith("- audience:") || lower.startsWith("- аудитория:")) {
        current.audience = stripped.split(":", 2).slice(1).join(":").trim();
      } else if (lower.startsWith("- feature:") || lower.startsWith("- фича:")) {
        current.features.push(stripped.split(":", 2).slice(1).join(":").trim());
      }
    }
  }
  if (current) competitors.push(current);
  return competitors;
}

function parseFeatureMatrix(md: string): Record<string, Record<string, string>> {
  const matrix: Record<string, Record<string, string>> = {};
  let inSection = false;
  let headers: string[] = [];

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();

    if (stripped.startsWith("## ") && (lower.includes("матрица") || lower.includes("feature matrix"))) {
      inSection = true;
      continue;
    }
    if (inSection && stripped.startsWith("## ")) break;
    if (!inSection || !stripped.includes("|")) continue;

    const cells = stripped.split("|").map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    if (cells.every((c) => /^[-:]+$/.test(c))) continue;

    if (!headers.length) {
      headers = cells;
      continue;
    }
    if (cells.length >= 2) {
      const feature = cells[0];
      const row: Record<string, string> = {};
      for (let i = 1; i < cells.length && i < headers.length; i++) {
        row[headers[i]] = cells[i];
      }
      if (Object.keys(row).length) matrix[feature] = row;
    }
  }
  return matrix;
}

function parsePainPoints(md: string): ResearchPainPoint[] {
  const points: ResearchPainPoint[] = [];
  let inSection = false;

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();
    if (lower.includes("pain point") || lower.includes("болевые точки") || lower.includes("проблемы пользователей")) {
      inSection = true;
      continue;
    }
    if (inSection && stripped.startsWith("## ")) { inSection = false; continue; }
    if (inSection && stripped.startsWith("- ")) {
      points.push({ theme: stripped.slice(2).trim(), frequency: "", source: "", description: "" });
    }
  }
  return points;
}

function parseOpportunities(md: string): string[] {
  const opps: string[] = [];
  let inSection = false;

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();
    if (lower.includes("opportunit") || lower.includes("возможност")) { inSection = true; continue; }
    if (inSection && stripped.startsWith("## ")) { inSection = false; continue; }
    if (inSection && stripped.startsWith("- ")) opps.push(stripped.slice(2).trim());
  }
  return opps;
}

function parseRegulatory(md: string): string[] {
  const notes: string[] = [];
  let inSection = false;

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();
    if (lower.includes("regulat") || lower.includes("нормативн") || lower.includes("регулиров")) { inSection = true; continue; }
    if (inSection && stripped.startsWith("## ")) { inSection = false; continue; }
    if (inSection && stripped.startsWith("- ")) notes.push(stripped.slice(2).trim());
  }
  return notes;
}

export function parseResearchMd(md: string): ResearchData {
  return {
    competitors: parseCompetitors(md),
    featureMatrix: parseFeatureMatrix(md),
    painPoints: parsePainPoints(md),
    opportunities: parseOpportunities(md),
    regulatoryNotes: parseRegulatory(md),
    rawMarkdown: md,
  };
}

// ── DISCOVERY.md parsing ──

const EFFORT_RE = /\b(XL|[SML])\b/;
const IMPACT_RE = /\b(low|medium|high|critical)\b/i;
const CATEGORY_RE = /\b(quick[_\s]?win|strategic[_\s]?bet|nice[_\s]?to[_\s]?have|deprioritized)\b/i;

function normalizeCategory(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]/g, "_");
}

function parseSuggestions(md: string): DiscoverySuggestion[] {
  const suggestions: DiscoverySuggestion[] = [];
  let current: DiscoverySuggestion | null = null;
  let inSection = false;

  const CATEGORY_KEYWORDS = ["quick win", "strategic bet", "nice to have", "deprioritiz", "бэклог", "планировать", "делать первыми"];

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();

    if (stripped.startsWith("## ") && (lower.includes("рекомендац") || lower.includes("suggestion") || lower.includes("предложен") || lower.includes("feature"))) {
      inSection = true;
      continue;
    }
    if (inSection && stripped.startsWith("## ") && !["quick", "strateg", "nice", "depriori", "feature"].some((kw) => lower.includes(kw))) {
      if (current) { suggestions.push(current); current = null; }
      inSection = false;
      continue;
    }
    if (!inSection) continue;

    if (stripped.startsWith("### ")) {
      const rawName = stripped.slice(4).trim();
      if (CATEGORY_KEYWORDS.some((kw) => rawName.toLowerCase().includes(kw))) continue;
      if (current) suggestions.push(current);
      const name = rawName.replace(/^\d+[.)]\s*/, "");
      current = { name, description: "", effort: "", impact: "", evidence: "", category: "" };
      continue;
    }
    if (!current) continue;

    if (lower.startsWith("- effort:") || lower.startsWith("- трудозатрат")) {
      const m = EFFORT_RE.exec(stripped);
      if (m) current.effort = m[1];
    } else if (lower.startsWith("- impact:") || lower.startsWith("- влияни")) {
      const m = IMPACT_RE.exec(stripped);
      if (m) current.impact = m[1].toLowerCase();
    } else if (lower.startsWith("- evidence:") || lower.startsWith("- источник")) {
      current.evidence = stripped.split(":").slice(1).join(":").trim();
    } else if (lower.startsWith("- category:") || lower.startsWith("- категори")) {
      const m = CATEGORY_RE.exec(stripped);
      if (m) current.category = normalizeCategory(m[1]);
    } else if (lower.startsWith("- description:") || lower.startsWith("- описани")) {
      current.description = stripped.split(":").slice(1).join(":").trim();
    } else if (stripped.startsWith("- ") && !current.description) {
      current.description = stripped.slice(2).trim();
    }
  }
  if (current) suggestions.push(current);
  return suggestions;
}

function parseMatrixRows(md: string): DiscoverySuggestion[] {
  const suggestions: DiscoverySuggestion[] = [];
  let inMatrix = false;
  let headers: string[] = [];

  for (const line of md.split("\n")) {
    const stripped = line.trim();
    const lower = stripped.toLowerCase();

    if (stripped.startsWith("## ") && (lower.includes("матриц") || lower.includes("matrix"))) {
      inMatrix = true;
      continue;
    }
    if (inMatrix && stripped.startsWith("## ")) break;
    if (!inMatrix || !stripped.includes("|")) continue;

    const cells = stripped.split("|").map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    if (cells.every((c) => /^[-:]+$/.test(c))) continue;

    if (!headers.length) {
      headers = cells.map((h) => h.toLowerCase());
      continue;
    }
    if (cells.length >= 3) {
      let effort = "";
      let impact = "";
      let category = "";

      for (let i = 1; i < cells.length && i < headers.length; i++) {
        const h = headers[i];
        if (h.includes("effort") || h.includes("трудо")) {
          const m = EFFORT_RE.exec(cells[i]);
          effort = m ? m[1] : cells[i].trim();
        } else if (h.includes("impact") || h.includes("влияни")) {
          const m = IMPACT_RE.exec(cells[i]);
          impact = m ? m[1].toLowerCase() : cells[i].trim().toLowerCase();
        } else if (h.includes("categ") || h.includes("категор")) {
          const m = CATEGORY_RE.exec(cells[i]);
          category = m ? normalizeCategory(m[1]) : "";
        }
      }
      suggestions.push({ name: cells[0], description: "", effort, impact, evidence: "", category });
    }
  }
  return suggestions;
}

function categorizeSuggestions(suggestions: DiscoverySuggestion[]): DiscoveryData {
  const quickWins: DiscoverySuggestion[] = [];
  const strategicBets: DiscoverySuggestion[] = [];
  const niceToHaves: DiscoverySuggestion[] = [];

  for (const s of suggestions) {
    if (s.category === "quick_win") {
      quickWins.push(s);
    } else if (s.category === "strategic_bet") {
      strategicBets.push(s);
    } else if (s.category === "nice_to_have" || s.category === "deprioritized") {
      niceToHaves.push(s);
    } else {
      // Auto-categorize by effort/impact
      if ((s.effort === "S" || s.effort === "M") && (s.impact === "high" || s.impact === "critical")) {
        s.category = "quick_win";
        quickWins.push(s);
      } else if ((s.effort === "L" || s.effort === "XL") && (s.impact === "high" || s.impact === "critical")) {
        s.category = "strategic_bet";
        strategicBets.push(s);
      } else {
        s.category = "nice_to_have";
        niceToHaves.push(s);
      }
    }
  }
  return { suggestions, quickWins, strategicBets, niceToHaves, rawMarkdown: "" };
}

export function parseDiscoveryMd(md: string): DiscoveryData {
  const suggestions = parseSuggestions(md);
  const matrixRows = parseMatrixRows(md);

  // Merge matrix data into suggestions
  for (const ms of matrixRows) {
    const match = suggestions.find(
      (s) => s.name.toLowerCase() === ms.name.toLowerCase()
        || s.name.toLowerCase().startsWith(ms.name.toLowerCase())
        || ms.name.toLowerCase().startsWith(s.name.toLowerCase())
    );
    if (!match) {
      suggestions.push(ms);
    } else {
      if (!match.effort && ms.effort) match.effort = ms.effort;
      if (!match.impact && ms.impact) match.impact = ms.impact;
      if (!match.category && ms.category) match.category = ms.category;
    }
  }

  const result = categorizeSuggestions(suggestions);
  result.rawMarkdown = md;
  return result;
}
