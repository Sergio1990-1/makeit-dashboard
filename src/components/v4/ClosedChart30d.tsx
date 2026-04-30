import { useMemo } from "react";
import type { ProjectData } from "../../types";
import { dailyClosedLastN, movingAverage } from "../../utils/dashboardMetrics";

interface Props {
  projects: ProjectData[];
}

const W = 600;
const H = 200;
const PAD_TOP = 20;
const PAD_BOT = 20;
const BAR_AREA = H - PAD_TOP - PAD_BOT; // 160

export function ClosedChart30d({ projects }: Props) {
  const { daily, total, peak, peakIdx, ma } = useMemo(() => {
    const daily = dailyClosedLastN(projects, 30);
    const total = daily.reduce((s, d) => s + d.count, 0);
    let peak = 0;
    let peakIdx = 0;
    daily.forEach((d, i) => {
      if (d.count > peak) {
        peak = d.count;
        peakIdx = i;
      }
    });
    const ma = movingAverage(
      daily.map((d) => d.count),
      10
    );
    return { daily, total, peak, peakIdx, ma };
  }, [projects]);

  const max = Math.max(peak, ...ma, 1);
  const colW = W / daily.length;
  const barW = Math.max(8, colW - 6);

  const trendPath = ma
    .map((v, i) => {
      const x = i * colW + colW / 2;
      const y = PAD_TOP + BAR_AREA - (v / max) * BAR_AREA;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const peakDate = daily[peakIdx]
    ? new Date(daily[peakIdx].day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : "—";

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Закрыто за 30 дней <span className="v4-tag">по дням</span>
        </div>
        <div className="v4-panel-meta">всего {total}</div>
      </div>
      <div className="v4-closed-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {/* gridlines */}
          <g stroke="var(--v4-line-soft)" strokeWidth="1">
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1="0" y1={PAD_TOP + BAR_AREA * (1 - f)} x2={W} y2={PAD_TOP + BAR_AREA * (1 - f)} />
            ))}
          </g>
          {/* bars */}
          <g fill="var(--v4-accent-500)">
            {daily.map((d, i) => {
              const h = (d.count / max) * BAR_AREA;
              const y = PAD_TOP + BAR_AREA - h;
              const x = i * colW + (colW - barW) / 2;
              return (
                <rect
                  key={d.day}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(2, h)}
                  rx="2"
                >
                  <title>{`${d.day}: ${d.count}`}</title>
                </rect>
              );
            })}
          </g>
          {/* trend (moving average) */}
          {trendPath && (
            <path
              d={trendPath}
              fill="none"
              stroke="var(--v4-success-500)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}
        </svg>
      </div>
      <div className="v4-cc-legend">
        <span className="v4-cc-lg">
          <span className="v4-cc-sw" style={{ background: "var(--v4-accent-500)" }} />
          Закрыто (шт.)
        </span>
        <span className="v4-cc-lg">
          <span
            className="v4-cc-sw"
            style={{ background: "var(--v4-success-500)", height: 2, width: 14, borderRadius: 0 }}
          />
          Тренд (10-дн скользящее)
        </span>
        <span className="v4-cc-peak">
          пик: <b>{peakDate} · {peak} шт.</b>
        </span>
      </div>
    </div>
  );
}
