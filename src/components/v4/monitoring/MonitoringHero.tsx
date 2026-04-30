import type { Monitor } from "../../../types";
import { fmtAge, poolHealth, type MonitorHealth } from "./utils";

interface Props {
  monitors: Monitor[];
  loading: boolean;
  onRefresh: () => void;
  /** Render-once timestamp (frozen via useState in parent) so we don't tick on every render. */
  nowMs: number;
}

const HEALTH_TITLE: Record<MonitorHealth, string> = {
  ok: "Все сервисы онлайн",
  warn: "Есть замечания",
  danger: "Сервисы недоступны",
  unknown: "Нет данных",
};

const HEALTH_DESC: Record<MonitorHealth, string> = {
  ok: "Все мониторы возвращают 2xx",
  warn: "Один или несколько uptime ниже 99% или ждут проверки",
  danger: "Один или несколько сервисов не отвечают — нужен incident-response",
  unknown: "Подключите Cloudflare Worker для получения данных",
};

export function MonitoringHero({ monitors, loading, onRefresh, nowMs }: Props) {
  const health = poolHealth(monitors);
  const downCount = monitors.filter((m) => m.status === "down").length;
  const upCount = monitors.filter((m) => m.status === "up").length;
  const pausedCount = monitors.filter((m) => m.status === "paused").length;
  const lastChecked = monitors.reduce<number | null>((acc, m) => {
    if (!m.lastCheckedAt) return acc;
    const t = new Date(m.lastCheckedAt).getTime();
    if (isNaN(t)) return acc;
    return acc === null || t > acc ? t : acc;
  }, null);

  return (
    <div className={`v4-mon-hero v4-mon-hero--${health}`}>
      <div className="v4-mon-hero-status">
        <span className={`v4-mon-hero-dot v4-mon-hero-dot--${health}`} aria-hidden="true" />
        <div>
          <div className="v4-mon-hero-title">{HEALTH_TITLE[health]}</div>
          <div className="v4-mon-hero-sub">
            {monitors.length > 0 ? (
              <>
                {downCount > 0 && (
                  <>
                    <b className="v4-mon-text-danger">{downCount}</b> не отвечает
                    <span className="v4-mon-sep">·</span>
                  </>
                )}
                <b className="v4-mon-text-success">{upCount}</b> онлайн
                {pausedCount > 0 && (
                  <>
                    <span className="v4-mon-sep">·</span>
                    <b className="v4-mon-text-muted">{pausedCount}</b> на паузе
                  </>
                )}
                <span className="v4-mon-sep">·</span>
                всего <b>{monitors.length}</b>
                {lastChecked !== null && (
                  <>
                    <span className="v4-mon-sep">·</span>
                    обновлено <span className="v4-pl-mono v4-mon-text-muted">{fmtAge(new Date(lastChecked).toISOString(), nowMs)}</span>
                  </>
                )}
              </>
            ) : (
              HEALTH_DESC[health]
            )}
          </div>
        </div>
      </div>
      <div className="v4-mon-hero-actions">
        <button type="button" className="v4-btn v4-btn--pri" onClick={onRefresh} disabled={loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.22-8.56" />
            <path d="M21 3v6h-6" />
          </svg>
          {loading ? "Загрузка…" : "Обновить"}
        </button>
      </div>
    </div>
  );
}
