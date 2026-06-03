import { useMemo } from "react";
import type { Milestone } from "../../../types";
import { daysUntil } from "../../../utils/date";
import { classifyMilestone, type MilestoneStatusKind } from "./classifyMilestone";

interface Props {
  milestones: Milestone[];
  now: Date;
}

// Labels MUST match the canonical deadline-tier headers used by the card
// grouping (utils.deadlineBucket): week → "Эта неделя" (≤7), month →
// "Этот месяц" (≤30), later → "Дальше" (>30). Keeping them in sync means a
// milestone never appears under "≤ 3 дн" here while sitting in "Эта неделя"
// on the cards below.
const ORDER: {
  k: MilestoneStatusKind;
  l: string;
  c: string;
}[] = [
  { k: "overdue", l: "Просрочено", c: "var(--mk-danger)" },
  { k: "warn", l: "Эта неделя", c: "var(--mk-warn)" },
  { k: "soon", l: "Этот месяц", c: "var(--mk-brand-500)" },
  { k: "norm", l: "Дальше", c: "var(--mk-ink-400)" },
  { k: "noeta", l: "Без дедлайна", c: "var(--mk-ink-300)" },
  { k: "done", l: "Завершено", c: "var(--mk-success)" },
];

export function MilestonesStatusBar({ milestones, now }: Props) {
  const { buckets, total } = useMemo(() => {
    const b: Record<MilestoneStatusKind, number> = {
      overdue: 0,
      warn: 0,
      soon: 0,
      norm: 0,
      noeta: 0,
      done: 0,
    };
    for (const m of milestones) {
      const days = m.dueOn ? daysUntil(m.dueOn, now) : null;
      b[classifyMilestone(m, days)]++;
    }
    return { buckets: b, total: Math.max(1, milestones.length) };
  }, [milestones, now]);

  if (milestones.length === 0) return null;

  return (
    <div className="v4-msstatus">
      <div className="v4-msstatus-h">
        <div className="v4-msstatus-t">
          Распределение по статусам
          <span className="v4-msstatus-tag num">
            {milestones.length} milestone
          </span>
        </div>
      </div>
      <div className="v4-msstatus-bar">
        {ORDER.filter((o) => buckets[o.k] > 0).map((o) => {
          const w = (buckets[o.k] / total) * 100;
          return (
            <div
              key={o.k}
              className="v4-msstatus-seg"
              style={{ width: `${w}%`, background: o.c }}
              title={`${o.l}: ${buckets[o.k]}`}
            >
              <span className="v4-msstatus-seg-n num">{buckets[o.k]}</span>
              {w >= 15 && <span className="v4-msstatus-seg-l">{o.l}</span>}
            </div>
          );
        })}
      </div>
      <div className="v4-msstatus-legend">
        {ORDER.map((o) => (
          <div key={o.k} className="v4-msstatus-legend-it">
            <span className="v4-msstatus-sw" style={{ background: o.c }} />
            <span>{o.l}</span>
            <b className="num">{buckets[o.k]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
