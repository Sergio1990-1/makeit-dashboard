import type { QualitySnapshot, RetroSummary, PendingChange } from "../../../types";
import { duration, fmtAge } from "./utils";

interface Props {
  snapshot: QualitySnapshot | null;
  pendingChanges: PendingChange[];
  retros: RetroSummary[];
  // No tuning history needed in strip — it's already displayed in the
  // history panel itself with full context.
}

export function QualityKpiStrip({ snapshot, pendingChanges, retros }: Props) {
  const total = snapshot?.total_issues ?? 0;
  const pendingCount = pendingChanges.length;
  const retrosCount = retros.length;
  const lastRetro = retros.length > 0 ? retros[0] : null;
  // Retros come in reverse-chronological order from the API; the first item
  // is the most recent. Period strings like "2026-W17" don't carry a date,
  // so we just show count + age placeholder.

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div className="v4-projects-agg-cell" title="Задач за текущий период">
          <div className="v4-projects-agg-n num">{total}</div>
          <div className="v4-projects-agg-l">задач за период</div>
        </div>
        <div className="v4-projects-agg-cell" title="Среднее время выполнения">
          <div className="v4-projects-agg-n num">
            {snapshot ? duration(snapshot.avg_duration_sec) : "—"}
          </div>
          <div className="v4-projects-agg-l">ср. время</div>
        </div>
        <div
          className="v4-projects-agg-cell"
          title="Изменения от AutoTuner, ожидающие ревью"
        >
          <div
            className="v4-projects-agg-n num"
            style={{ color: pendingCount > 0 ? "var(--mk-warn-strong)" : undefined }}
          >
            {pendingCount}
          </div>
          <div className="v4-projects-agg-l">в очереди</div>
        </div>
        <div className="v4-projects-agg-cell" title="Проведённые ретроспективы">
          <div className="v4-projects-agg-n num">{retrosCount}</div>
          <div className="v4-projects-agg-l">ретроспектив</div>
        </div>
        <div
          className="v4-projects-agg-cell"
          title={lastRetro ? `Последняя ретроспектива: ${lastRetro.period}` : "Ретроспективы не проводились"}
        >
          <div className="v4-projects-agg-n num">
            {lastRetro?.period ?? "—"}
          </div>
          <div className="v4-projects-agg-l">последняя</div>
        </div>
        {snapshot?.period_end && (
          <div className="v4-projects-agg-cell" title={`Период: ${snapshot.period_start} — ${snapshot.period_end}`}>
            <div className="v4-projects-agg-n num">{fmtAge(snapshot.period_end)}</div>
            <div className="v4-projects-agg-l">возраст данных</div>
          </div>
        )}
      </div>
    </div>
  );
}
