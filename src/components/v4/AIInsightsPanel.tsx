import { useMemo } from "react";
import type { ReactElement } from "react";
import type { ProjectData, Issue } from "../../types";

type InsightKind = "an" | "gr" | "rk" | "fc";

interface Insight {
  kind: InsightKind;
  code: string;
  title: string;
  description: string;
  /** 0..1 — confidence */
  prob: number;
}

interface Props {
  projects: ProjectData[];
  blockedIssues: Issue[];
}

/**
 * Heuristic placeholder insights, derived locally from dashboard data.
 * Replaced by a real LLM-driven advisor in a follow-up task — see
 * the linked GitHub issue tagged `feature` in makeit-dashboard.
 */
function generateInsights(projects: ProjectData[], blockedIssues: Issue[]): Insight[] {
  const out: Insight[] = [];

  // Slowing-down project (high open count, very low velocity)
  const slowing = projects
    .filter((p) => p.openCount >= 5 && p.velocity7d < 0.5)
    .sort((a, b) => b.openCount - a.openCount)[0];
  if (slowing) {
    out.push({
      kind: "rk",
      code: "RSK-VEL",
      title: `${slowing.repo} замедляется`,
      description: `${slowing.openCount} открытых, velocity ${slowing.velocity7d.toFixed(2)}/д. Стоит провести debate-сессию или разблокировать.`,
      prob: 0.82,
    });
  }

  // Almost-done project (>=85% progress)
  const nearlyDone = projects
    .filter((p) => p.totalCount >= 5 && p.doneCount / p.totalCount >= 0.85)
    .sort((a, b) => b.doneCount / b.totalCount - a.doneCount / a.totalCount)[0];
  if (nearlyDone) {
    const pct = Math.round((nearlyDone.doneCount / nearlyDone.totalCount) * 100);
    out.push({
      kind: "gr",
      code: "GRO-CLS",
      title: `${nearlyDone.repo} готов к закрытию фазы`,
      description: `${pct}% задач закрыто. Можно переводить в support и фокусировать ресурсы на других проектах.`,
      prob: 0.88,
    });
  }

  // Stale P1 anomaly
  if (blockedIssues.length > 0) {
    const p1Blocked = blockedIssues.filter((i) => i.priority === "P1").length;
    if (p1Blocked > 0) {
      out.push({
        kind: "an",
        code: "ANO-P1B",
        title: `${p1Blocked} P1-задач заблокировано`,
        description: `Есть критичные задачи без движения. Возможно, требуется внешнее решение или переключение приоритета.`,
        prob: 0.91,
      });
    }
  }

  // Forecast: portfolio progress trend
  const totalIssues = projects.reduce((s, p) => s + p.totalCount, 0);
  const totalDone = projects.reduce((s, p) => s + p.doneCount, 0);
  if (totalIssues > 0) {
    const pctDone = Math.round((totalDone / totalIssues) * 100);
    const totalVelocity = projects.reduce((s, p) => s + p.velocity7d, 0);
    if (totalVelocity > 0) {
      const open = totalIssues - totalDone;
      const daysToFinish = Math.round(open / totalVelocity);
      const targetDate = new Date(Date.now() + daysToFinish * 86400000);
      out.push({
        kind: "fc",
        code: "FCT-ETA",
        title: `Прогноз: портфель ${pctDone}% → 100% к ${targetDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`,
        description: `При сохранении velocity ${totalVelocity.toFixed(1)}/день и без новых backlogged задач. Эвристика — не учитывает приоритеты.`,
        prob: 0.74,
      });
    }
  }

  // Fallback if nothing actionable
  if (out.length === 0) {
    out.push({
      kind: "fc",
      code: "FCT-OK",
      title: "Портфель в норме",
      description: "Нет критических аномалий в данных. AI-анализ будет включён в следующем релизе.",
      prob: 0.6,
    });
  }

  return out.slice(0, 4);
}

const KIND_ICONS: Record<InsightKind, ReactElement> = {
  rk: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
    </svg>
  ),
  gr: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l6-6 4 4 8-9" />
    </svg>
  ),
  an: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
    </svg>
  ),
  fc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
    </svg>
  ),
};

export function AIInsightsPanel({ projects, blockedIssues }: Props) {
  const insights = useMemo(
    () => generateInsights(projects, blockedIssues),
    [projects, blockedIssues]
  );

  const time = new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          <svg
            style={{ width: 14, height: 14, color: "var(--v4-purple-500)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a3 3 0 00-3 3v1.27A4 4 0 005 10v1.5a3.5 3.5 0 00-1 6.66V20a2 2 0 002 2h12a2 2 0 002-2v-1.84a3.5 3.5 0 00-1-6.66V10a4 4 0 00-4-3.73V5a3 3 0 00-3-3z" />
          </svg>
          AI-инсайты по портфелю
          <span className="v4-tag">эвристика · MVP</span>
        </div>
        <div className="v4-panel-meta">{time}</div>
      </div>
      <div className="v4-ai-list">
        {insights.map((it, idx) => (
          <div key={idx} className={`v4-ai-item v4-ai-item--${it.kind}`}>
            <div className="v4-ai-item-ic">{KIND_ICONS[it.kind]}</div>
            <div>
              <div className="v4-ai-item-ttl">{it.title}</div>
              <div className="v4-ai-item-ds">{it.description}</div>
            </div>
            <div className="v4-ai-item-meta">
              {it.code}
              <br />
              P {it.prob.toFixed(2).replace(".", ",")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
