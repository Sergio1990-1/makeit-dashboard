import { useEffect, useMemo, useState } from "react";
import type { HealthFinding, HealthReport } from "../../../types/health";
import { Icon } from "./Icon";
import { FancySpark } from "./FancySpark";
import { pluralize, useCountUp } from "./utils";

interface RowProps {
  report: HealthReport;
}

export function KpiRow({ report }: RowProps) {
  const fails = report.findings.filter((f) => f.status === "fail");
  const unknowns = report.findings.filter((f) => f.status === "unknown");
  const passes = report.findings.filter((f) => f.status === "pass");
  const critHigh = fails.filter((f) => f.severity === "critical" || f.severity === "high").length;
  return (
    <div className="ph-kpi-row">
      <ScoreTile
        score={report.score.raw}
        grade={report.score.grade}
        passes={passes.length}
        fails={fails.length}
        unknowns={unknowns.length}
      />
      <ActionTile fails={fails.length} critHigh={critHigh} fail_findings={fails} />
      <TrendTile report={report} />
    </div>
  );
}

interface ScoreProps {
  score: number;
  grade: string;
  passes: number;
  fails: number;
  unknowns: number;
}

function ScoreTile({ score, grade, passes, fails, unknowns }: ScoreProps) {
  const C = 2 * Math.PI * 52;
  const targetOffset = C - (score / 100) * C;
  const [offset, setOffset] = useState(C);
  const animScore = useCountUp(score, 1100, 250);
  const animPasses = useCountUp(passes, 800, 350);
  const animFails = useCountUp(fails, 800, 450);
  const animUnknowns = useCountUp(unknowns, 800, 550);

  useEffect(() => {
    const t = window.setTimeout(() => setOffset(targetOffset), 80);
    return () => window.clearTimeout(t);
  }, [targetOffset]);

  return (
    <div className="ph-tile ph-tile--main">
      <div className="ph-tile-lbl">
        <span className="ph-tile-lbl-ic"><Icon name="shield" /></span>
        HEALTH SCORE
      </div>
      <div className="ph-tile-main-body">
        <div className="ph-ring">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" />
            <circle
              className="ph-ring-fg"
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="#fff"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="ph-ring-center">
            <div className={`ph-ring-grade ph-ring-grade--${grade}`}>{grade}</div>
            <div className="ph-ring-num v4-mono">
              {Math.round(animScore)}
              <span>/100</span>
            </div>
          </div>
        </div>
        <div className="ph-tile-side">
          <div className="ph-tile-row">
            <span className="ph-sw ph-sw--pass" />
            <span className="ph-tile-row-l">прошли</span>
            <b>{Math.round(animPasses)}</b>
          </div>
          <div className="ph-tile-row">
            <span className="ph-sw ph-sw--fail" />
            <span className="ph-tile-row-l">нарушений</span>
            <b>{Math.round(animFails)}</b>
          </div>
          <div className="ph-tile-row">
            <span className="ph-sw ph-sw--unknown" />
            <span className="ph-tile-row-l">ждут drift</span>
            <b>{Math.round(animUnknowns)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActionProps {
  fails: number;
  critHigh: number;
  fail_findings: HealthFinding[];
}

function ActionTile({ fails, critHigh, fail_findings }: ActionProps) {
  const sevCounts = useMemo(() => {
    const c: Record<HealthFinding["severity"], number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of fail_findings) c[f.severity]++;
    return c;
  }, [fail_findings]);
  const max = Math.max(1, ...Object.values(sevCounts));
  const animFails = useCountUp(fails, 800, 200);
  return (
    <div className="ph-tile">
      <div className="ph-tile-lbl">
        <span className="ph-tile-lbl-ic"><Icon name="alert" /></span>
        ЧТО ЧИНИТЬ
      </div>
      <div className="ph-tile-num-row">
        <div className="ph-tile-num v4-mono">{Math.round(animFails)}</div>
        <div className="ph-tile-num-u">{pluralize(fails, "нарушение", "нарушения", "нарушений")}</div>
        {critHigh > 0 && <div className="ph-tile-chip ph-tile-chip--neg">{critHigh} crit/high</div>}
        {fails === 0 && <div className="ph-tile-chip ph-tile-chip--pos">всё ок</div>}
      </div>
      <div className="ph-sev-bars">
        {(["critical", "high", "medium", "low"] as const).map((sev, i) => (
          <div className="ph-sev-bar-row" key={sev}>
            <div className={`ph-sev-bar-l ph-sev-bar-l--${sev}`}>{sev}</div>
            <div className="ph-sev-bar-track">
              <div
                className={`ph-sev-bar-fill ph-sev-bar-fill--${sev}`}
                style={{
                  width: `${(sevCounts[sev] / max) * 100}%`,
                  animationDelay: `${300 + i * 80}ms`,
                }}
              />
            </div>
            <div className="ph-sev-bar-n v4-mono">{sevCounts[sev]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TrendProps {
  report: HealthReport;
}

function TrendTile({ report }: TrendProps) {
  const trend = report.trend;
  const score = report.score.raw;
  const dirChip = trend.direction === "up" ? "pos" : trend.direction === "down" ? "neg" : "neu";
  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
  const deltaSign = trend.delta > 0 ? "+" : "";
  const animScore = useCountUp(score, 1000, 250);
  const oldest = trend.points[0] ?? score;
  const isFirst = trend.points.length < 2;
  return (
    <div className="ph-tile">
      <div className="ph-tile-lbl">
        <span className="ph-tile-lbl-ic"><Icon name="trend" /></span>
        HEALTH-SCORE · ИСТОРИЯ
      </div>
      <div className="ph-tile-num-row">
        <div className="ph-tile-num v4-mono">{Math.round(animScore)}</div>
        <div className="ph-tile-num-u">/100</div>
        <div className={`ph-tile-chip ph-tile-chip--${dirChip}`}>
          {arrow} {deltaSign}{trend.delta}
        </div>
      </div>
      <FancySpark trend={trend} />
      <div className="ph-tile-meta">
        {isFirst ? (
          <span>первый скан · история нарастёт</span>
        ) : (
          <span>
            было <b className="v4-mono">{oldest}</b> · {trend.points.length} скан
            {trend.points.length > 4 ? "ов" : trend.points.length > 1 ? "а" : ""} назад
          </span>
        )}
      </div>
    </div>
  );
}
