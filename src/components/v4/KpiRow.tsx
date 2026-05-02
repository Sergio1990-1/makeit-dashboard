import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { ProjectData, SummaryMetrics } from "../../types";
import {
  calcPortfolioVelocity,
  calcOpenDelta,
  calcProgressDelta,
  sumOpenPriorities,
} from "../../utils/dashboardMetrics";
import { TweenedNumber } from "./TweenedNumber";

interface IndexedStyle extends CSSProperties {
  "--i"?: number;
}

interface Props {
  projects: ProjectData[];
  summary: SummaryMetrics;
  onFinanceClick?: () => void;
}

function compactUSD(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k.toFixed(k % 1 === 0 ? 0 : 1).replace(".", ",")}k`;
  }
  return `$${n}`;
}

function buildSparkPath(values: number[], width: number, height: number): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 2) - 1;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L0,${height} Z`;
  return { line, area };
}

export function KpiRow({ projects, summary, onFinanceClick }: Props) {
  const velocity = useMemo(() => calcPortfolioVelocity(projects), [projects]);
  const openDelta = useMemo(() => calcOpenDelta(projects), [projects]);
  const progressDelta = useMemo(() => calcProgressDelta(projects), [projects]);
  const priorityTotals = useMemo(() => sumOpenPriorities(projects), [projects]);

  const pctDone = summary.totalIssues > 0
    ? Math.round((summary.doneCount / summary.totalIssues) * 100)
    : 0;

  const spark = buildSparkPath(velocity.daily28d, 200, 42);

  const hasFinances = summary.totalBudget > 0;
  const paidPct = hasFinances ? Math.round((summary.totalPaid / summary.totalBudget) * 100) : 0;
  const remainingPct = hasFinances ? 100 - paidPct : 0;

  const monthName = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  const velocityDeltaSign = velocity.delta7dVsPrev >= 0 ? "↑" : "↓";
  const velocityDeltaAbs = Math.abs(velocity.delta7dVsPrev);

  const openDeltaSign = openDelta.netDelta7d > 0 ? "↑" : openDelta.netDelta7d < 0 ? "↓" : "→";
  const openDeltaClass =
    openDelta.netDelta7d > 0 ? "v4-kpi-delta--neg" : "v4-kpi-delta--pos";

  return (
    <div className="v4-kpi-row">
      {/* 1. Прогресс портфеля (accent) */}
      <div className="v4-kpi v4-kpi--acc" style={{ "--i": 0 } as IndexedStyle}>
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </span>
          Прогресс портфеля
        </div>
        <div className="v4-kpi-val num">
          <TweenedNumber value={pctDone} />
          <span className="v4-u">%</span>
        </div>
        <div className="v4-kpi-meta">
          {progressDelta.pointsDelta7d !== 0 ? (
            <>
              <span className={progressDelta.pointsDelta7d >= 0 ? "v4-kpi-delta--pos" : "v4-kpi-delta--neg"}>
                {progressDelta.pointsDelta7d >= 0 ? "↑" : "↓"}{" "}
                {Math.abs(progressDelta.pointsDelta7d).toString().replace(".", ",")} п.п.
              </span>
              <span className="v4-kpi-vs">за 7 дней</span>
            </>
          ) : (
            <span className="v4-kpi-vs">без изменений за 7 дней</span>
          )}
        </div>
        <div className="v4-kpi-splits">
          <div className="v4-kpi-split">
            <div className="v4-kpi-split-n"><TweenedNumber value={summary.totalIssues} /></div>
            <div className="v4-kpi-split-l">Всего</div>
          </div>
          <div className="v4-kpi-split">
            <div className="v4-kpi-split-n"><TweenedNumber value={summary.doneCount} /></div>
            <div className="v4-kpi-split-l">Сделано</div>
          </div>
          <div className="v4-kpi-split">
            <div className="v4-kpi-split-n"><TweenedNumber value={summary.openCount} /></div>
            <div className="v4-kpi-split-l">Открыто</div>
          </div>
        </div>
      </div>

      {/* 2. Открытые задачи */}
      <div className="v4-kpi" style={{ "--i": 1 } as IndexedStyle}>
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic v4-kpi-ic--b">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4M12 22a10 10 0 110-20 10 10 0 010 20z" />
            </svg>
          </span>
          Открытые задачи
        </div>
        <div className="v4-kpi-val num"><TweenedNumber value={summary.openCount} /></div>
        <div className="v4-kpi-meta">
          {openDelta.netDelta7d !== 0 ? (
            <>
              <span className={openDeltaClass}>
                {openDeltaSign} {Math.abs(openDelta.netDelta7d)}
              </span>
              <span className="v4-kpi-vs">net за 7 дней</span>
            </>
          ) : (
            <span className="v4-kpi-vs">без изменений за 7 дней</span>
          )}
        </div>
        <div className="v4-kpi-splits">
          <div className="v4-kpi-split">
            <div className="v4-kpi-split-n" style={{ color: "var(--v4-p1)" }}><TweenedNumber value={priorityTotals.P1} /></div>
            <div className="v4-kpi-split-l">P1</div>
          </div>
          <div className="v4-kpi-split">
            <div className="v4-kpi-split-n" style={{ color: "var(--v4-p2)" }}><TweenedNumber value={priorityTotals.P2} /></div>
            <div className="v4-kpi-split-l">P2</div>
          </div>
          <div className="v4-kpi-split">
            <div className="v4-kpi-split-n" style={{ color: "var(--v4-p3)" }}><TweenedNumber value={priorityTotals.P3} /></div>
            <div className="v4-kpi-split-l">P3</div>
          </div>
        </div>
      </div>

      {/* 3. Velocity 7д + sparkline */}
      <div className="v4-kpi" style={{ "--i": 2 } as IndexedStyle}>
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic v4-kpi-ic--p">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </span>
          Velocity · 7 дней
        </div>
        <div className="v4-kpi-val num">
          <TweenedNumber value={velocity.perDay7d} decimals={1} decimalSeparator="," />
          <span className="v4-u">/день</span>
        </div>
        <div className="v4-kpi-meta">
          {velocity.delta7dVsPrev !== 0 ? (
            <>
              <span className={velocity.delta7dVsPrev >= 0 ? "v4-kpi-delta--pos" : "v4-kpi-delta--neg"}>
                {velocityDeltaSign} {velocityDeltaAbs}%
              </span>
              <span className="v4-kpi-vs">vs. предыдущая неделя</span>
            </>
          ) : (
            <span className="v4-kpi-vs">28-дн. ритм закрытия</span>
          )}
        </div>
        <div className="v4-kpi-spark">
          <svg viewBox="0 0 200 42" preserveAspectRatio="none">
            {spark.area && <path d={spark.area} fill="rgba(18,183,106,0.12)" />}
            {spark.line && (
              <path d={spark.line} fill="none" stroke="var(--v4-success-500)" strokeWidth="2" />
            )}
          </svg>
        </div>
      </div>

      {/* 4. Бюджет */}
      <div
        className="v4-kpi"
        style={{ "--i": 3, ...(onFinanceClick ? { cursor: "pointer" } : null) } as IndexedStyle}
        onClick={onFinanceClick}
        role={onFinanceClick ? "button" : undefined}
        tabIndex={onFinanceClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onFinanceClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onFinanceClick();
          }
        }}
        aria-label={onFinanceClick ? "Открыть редактор финансов" : undefined}
      >
        <div className="v4-kpi-lbl">
          <span className="v4-kpi-ic v4-kpi-ic--g">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </span>
          Бюджет портфеля
        </div>
        <div className="v4-kpi-val num">{compactUSD(summary.totalBudget)}</div>
        <div className="v4-kpi-meta">
          <span className="v4-kpi-vs">
            {monthName} · оплачено {paidPct}%
          </span>
        </div>
        {hasFinances ? (
          <div className="v4-fin-bar">
            <div className="v4-fin-bar-stk">
              <div className="v4-pp" style={{ width: `${paidPct}%` }} />
              <div className="v4-ip" style={{ width: `${remainingPct}%`, background: "var(--v4-surface-3)" }} />
            </div>
            <div className="v4-fin-lg">
              <span className="v4-fin-lg-i">
                <span className="v4-fin-lg-sw" style={{ background: "var(--v4-success-500)" }} />
                Оплачено <b>{compactUSD(summary.totalPaid)}</b>
              </span>
              <span className="v4-fin-lg-i">
                <span className="v4-fin-lg-sw" style={{ background: "var(--v4-surface-3)" }} />
                Остаток <b>{compactUSD(summary.totalRemaining)}</b>
              </span>
            </div>
          </div>
        ) : (
          <div className="v4-kpi-splits">
            <div className="v4-kpi-split">
              <div className="v4-kpi-split-n" style={{ color: "var(--v4-success-700)" }}>{compactUSD(summary.totalPaid)}</div>
              <div className="v4-kpi-split-l">Оплачено</div>
            </div>
            <div className="v4-kpi-split">
              <div className="v4-kpi-split-n">{compactUSD(summary.totalRemaining)}</div>
              <div className="v4-kpi-split-l">Остаток</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
