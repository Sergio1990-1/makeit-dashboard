import type { Monitor } from "../../../types";
import {
  fmtAge,
  getProjectName,
  isStale,
  monitorHealth,
  STATUS_LABEL,
  uptimeColor,
} from "./utils";

interface Props {
  monitor: Monitor;
  /** Render-once timestamp, frozen via parent useState. */
  nowMs: number;
}

export function MonitorCard({ monitor, nowMs }: Props) {
  const project = getProjectName(monitor);
  const health = monitorHealth(monitor);
  const stale = isStale(monitor.lastCheckedAt, nowMs);
  const uptime = monitor.uptimePct;
  const upBarPct = uptime !== null ? Math.max(0, Math.min(100, uptime)) : 0;
  const uColor = uptimeColor(uptime);

  // Strip protocol for display brevity, keep full URL on the link itself.
  const displayUrl = monitor.url.replace(/^https?:\/\//, "");

  return (
    <div className={`v4-mon-card v4-mon-card--${health}`}>
      <div className="v4-mon-card-h">
        <div className="v4-mon-card-name">
          <span className={`v4-mon-card-dot v4-mon-card-dot--${health}`} aria-hidden="true" />
          <span className="v4-mon-card-title" title={monitor.name}>
            {monitor.name}
          </span>
        </div>
        <span className={`v4-tag v4-mon-status v4-mon-status--${monitor.status}`}>
          {STATUS_LABEL[monitor.status]}
        </span>
      </div>

      <a
        className="v4-mon-card-url v4-pl-mono"
        href={monitor.url}
        target="_blank"
        rel="noopener noreferrer"
        title={monitor.url}
      >
        {displayUrl}
      </a>

      <div className="v4-mon-card-uptime">
        <div className="v4-mon-card-uptime-row">
          <span className="v4-mon-text-muted">Uptime</span>
          <span className="v4-pl-mono v4-mon-card-uptime-val" style={{ color: uColor }}>
            {uptime !== null ? `${uptime.toFixed(2)}%` : "—"}
          </span>
        </div>
        {uptime !== null && (
          <div className="v4-mon-card-uptime-bar">
            <div
              className="v4-mon-card-uptime-fill"
              style={{ width: `${upBarPct}%`, background: uColor }}
            />
          </div>
        )}
      </div>

      <div className="v4-mon-card-foot">
        {project && (
          <span className="v4-tag v4-mon-card-project" title={`Проект: ${project}`}>
            {project}
          </span>
        )}
        <span
          className={`v4-pl-mono v4-mon-card-checked${stale ? " is-stale" : ""}`}
          title={monitor.lastCheckedAt ?? "Никогда не проверялся"}
        >
          {stale && "⚠ "}{fmtAge(monitor.lastCheckedAt, nowMs)}
        </span>
      </div>
    </div>
  );
}
