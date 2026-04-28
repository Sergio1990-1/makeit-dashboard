import type { ProjectData, Monitor } from "../types";

export interface RiskFactor {
  text: string;
  points: number;
}

export interface RiskResult {
  score: number; // 0-100
  level: "low" | "medium" | "high" | "critical";
  label: string;
  factors: RiskFactor[];
}

// Risk-bucket thresholds. Calibrated empirically against existing MakeIT
// projects: a healthy active repo scores < 15; one with a single P1 or
// stale-week scores 15–35; multiple risk factors push 35–60; a downed
// service or 3+ P1s with no activity hits 60+. Revisit after major
// portfolio shifts (e.g., +10 projects) or when monitoring policy changes.
const LOW_THRESHOLD = 15;
const MEDIUM_THRESHOLD = 35;
const HIGH_THRESHOLD = 60;

export function calcRiskScore(project: ProjectData, monitor?: Monitor): RiskResult {
  let score = 0;
  const factors: RiskFactor[] = [];

  // P1 critical open issues (0–30): each P1 adds 10 pts, cap at 30
  const p1pts = Math.min(30, project.priorityCounts.P1 * 10);
  if (p1pts > 0) {
    score += p1pts;
    factors.push({ text: `P1-critical: ${project.priorityCounts.P1} открытых`, points: p1pts });
  }

  // Monitor status (0–25)
  if (monitor?.status === "down") {
    score += 25;
    factors.push({ text: "Сервис недоступен (down)", points: 25 });
  } else if (monitor?.status === "pending") {
    score += 8;
    factors.push({ text: "Мониторинг в ожидании", points: 8 });
  }

  // Stale project — no activity (0–20)
  const days = project.daysSinceActivity ?? 0;
  if (days > 30) {
    score += 20;
    factors.push({ text: `${days}д без активности`, points: 20 });
  } else if (days > 14) {
    score += 12;
    factors.push({ text: `${days}д без активности`, points: 12 });
  } else if (days > 7) {
    score += 5;
    factors.push({ text: `${days}д без активности`, points: 5 });
  }

  // Open bug ratio (0–15)
  // Caveat: `bugs` is computed from `project.issues` which only contains the
  // currently-paginated set. When `project.issues.length < project.openCount`
  // (large repos beyond the GraphQL page), this ratio under-estimates true
  // bug density. Acceptable trade-off — the dashboard's pagination usually
  // covers the meaningful subset.
  const bugs = project.issues.filter(
    (i) => i.labels.some((l) => l.toLowerCase() === "bug") && i.status !== "Done"
  ).length;
  const bugRatio = project.openCount > 0 ? bugs / project.openCount : 0;
  if (bugRatio >= 0.3) {
    score += 15;
    factors.push({ text: `${bugs} открытых багов (${Math.round(bugRatio * 100)}%)`, points: 15 });
  } else if (bugRatio >= 0.15) {
    score += 8;
    factors.push({ text: `${bugs} открытых багов (${Math.round(bugRatio * 100)}%)`, points: 8 });
  } else if (bugRatio > 0) {
    score += 4;
    factors.push({ text: `${bugs} открытых багов`, points: 4 });
  }

  // Cycle time (0–10): slow delivery signals risk
  if (project.cycleTimeDays !== null) {
    if (project.cycleTimeDays > 30) {
      score += 10;
      factors.push({ text: `Цикл закрытия: ${Math.round(project.cycleTimeDays)}д`, points: 10 });
    } else if (project.cycleTimeDays > 14) {
      score += 5;
      factors.push({ text: `Цикл закрытия: ${Math.round(project.cycleTimeDays)}д`, points: 5 });
    }
  }

  score = Math.min(100, score);

  let level: RiskResult["level"];
  let label: string;
  if (score >= HIGH_THRESHOLD) { level = "critical"; label = "Критичный"; }
  else if (score >= MEDIUM_THRESHOLD) { level = "high"; label = "Высокий"; }
  else if (score >= LOW_THRESHOLD) { level = "medium"; label = "Средний"; }
  else { level = "low"; label = "Низкий"; }

  return { score, level, label, factors };
}
