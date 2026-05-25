import { useMemo } from "react";
import type { Milestone } from "../../../types";
import { daysUntil } from "../../../utils/date";
import { classifyMilestone, type MilestoneStatusKind } from "./classifyMilestone";

interface Props {
  milestones: Milestone[];
  now: Date;
}

const ORDER: {
  k: MilestoneStatusKind;
  l: string;
  c: string;
}[] = [
  { k: "overdue", l: "Просрочено", c: "var(--v4-danger-500)" },
  { k: "warn", l: "≤ 3 дн", c: "var(--v4-warn-500)" },
  { k: "soon", l: "≤ 14 дн", c: "var(--v4-accent-500)" },
  { k: "norm", l: "Дальше", c: "var(--v4-ink-400)" },
  { k: "noeta", l: "Без даты", c: "var(--v4-ink-300)" },
  { k: "done", l: "Завершено", c: "var(--v4-success-500)" },
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
