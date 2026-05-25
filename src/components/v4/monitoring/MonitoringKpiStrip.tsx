import type { Monitor } from "../../../types";

interface Props {
  monitors: Monitor[];
}

export function MonitoringKpiStrip({ monitors }: Props) {
  const total = monitors.length;
  const up = monitors.filter((m) => m.status === "up").length;
  const down = monitors.filter((m) => m.status === "down").length;
  const paused = monitors.filter((m) => m.status === "paused").length;
  const pending = monitors.filter((m) => m.status === "pending").length;

  const uptimes = monitors
    .map((m) => m.uptimePct)
    .filter((u): u is number => u !== null && isFinite(u));
  const avgUptime = uptimes.length > 0
    ? uptimes.reduce((s, u) => s + u, 0) / uptimes.length
    : null;

  return (
    <div className="v4-projects-toolbar v4-pl-kpi-strip">
      <div className="v4-projects-agg">
        <div className="v4-projects-agg-cell" title="Всего мониторов">
          <div className="v4-projects-agg-n num">{total}</div>
          <div className="v4-projects-agg-l">всего</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сервисы со статусом up">
          <div
            className="v4-projects-agg-n num"
            style={{ color: up > 0 ? "var(--mk-success-strong)" : undefined }}
          >
            {up}
          </div>
          <div className="v4-projects-agg-l">онлайн</div>
        </div>
        <div className="v4-projects-agg-cell" title="Сервисы со статусом down">
          <div
            className="v4-projects-agg-n num"
            style={{ color: down > 0 ? "var(--mk-danger-strong)" : undefined }}
          >
            {down}
          </div>
          <div className="v4-projects-agg-l">не отвечает</div>
        </div>
        {paused > 0 && (
          <div className="v4-projects-agg-cell" title="Мониторы на паузе">
            <div className="v4-projects-agg-n num">{paused}</div>
            <div className="v4-projects-agg-l">на паузе</div>
          </div>
        )}
        {pending > 0 && (
          <div className="v4-projects-agg-cell" title="Мониторы в статусе pending">
            <div className="v4-projects-agg-n num">{pending}</div>
            <div className="v4-projects-agg-l">проверяется</div>
          </div>
        )}
        <div className="v4-projects-agg-cell" title="Средний uptime по всем мониторам">
          <div
            className="v4-projects-agg-n num"
            style={{
              color: avgUptime === null
                ? undefined
                : avgUptime >= 99.9
                  ? "var(--mk-success-strong)"
                  : avgUptime >= 99
                    ? undefined
                    : "var(--mk-warn-strong)",
            }}
          >
            {avgUptime !== null ? `${avgUptime.toFixed(2)}%` : "—"}
          </div>
          <div className="v4-projects-agg-l">средний uptime</div>
        </div>
      </div>
    </div>
  );
}
