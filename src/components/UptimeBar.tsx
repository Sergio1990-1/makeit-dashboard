import type { Monitor, MonitorStatus } from "../types";
import { getBetterStackToken, setBetterStackToken } from "../utils/config";
import { useMonitors } from "../hooks/useMonitors";
import { useEffect, useState } from "react";

const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "Online",
  down: "Down",
  paused: "Paused",
  pending: "Pending",
};

function MonitorRow({ monitor }: { monitor: Monitor }) {
  const uptime =
    monitor.uptimePct !== null ? `${monitor.uptimePct.toFixed(2)}%` : "—";
  const checked = monitor.lastCheckedAt
    ? new Date(monitor.lastCheckedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className={`monitor-row monitor-row--${monitor.status}`}>
      <span className={`monitor-dot monitor-dot--${monitor.status}`} />
      <span className="monitor-name">{monitor.name}</span>
      <span className="monitor-url">{monitor.url}</span>
      <span className={`monitor-status monitor-status--${monitor.status}`}>
        {STATUS_LABEL[monitor.status]}
      </span>
      <span className="monitor-uptime">{uptime}</span>
      <span className="monitor-checked">{checked}</span>
    </div>
  );
}

export function UptimeBar() {
  const { monitors, loading, error, refresh } = useMonitors();
  const [tokenInput, setTokenInput] = useState("");
  const [hasToken, setHasToken] = useState(!!getBetterStackToken());

  useEffect(() => {
    if (hasToken) {
      refresh();
    }
  }, [hasToken, refresh]);

  function handleSaveToken() {
    if (tokenInput.trim()) {
      setBetterStackToken(tokenInput.trim());
      setHasToken(true);
      setTokenInput("");
    }
  }

  if (!hasToken) {
    return (
      <div className="uptime-setup">
        <h3>Мониторинг Better Stack</h3>
        <p>Введите API токен Better Stack для отображения статуса мониторов.</p>
        <div className="uptime-token-form">
          <input
            type="password"
            placeholder="Better Stack API token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
          />
          <button onClick={handleSaveToken}>Сохранить</button>
        </div>
      </div>
    );
  }

  const downCount = monitors.filter((m) => m.status === "down").length;
  const upCount = monitors.filter((m) => m.status === "up").length;

  return (
    <div className="uptime-bar">
      <div className="uptime-header">
        <div className="uptime-summary">
          <span className="uptime-summary__up">{upCount} online</span>
          {downCount > 0 && (
            <span className="uptime-summary__down">{downCount} down</span>
          )}
          <span className="uptime-summary__total">{monitors.length} monitors</span>
        </div>
        <button
          className="uptime-refresh"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {error && <div className="uptime-error">{error}</div>}

      {!loading && monitors.length > 0 && (
        <div className="monitor-list">
          <div className="monitor-list__header">
            <span />
            <span>Монитор</span>
            <span>URL</span>
            <span>Статус</span>
            <span>Uptime</span>
            <span>Проверен</span>
          </div>
          {monitors.map((m) => (
            <MonitorRow key={m.id} monitor={m} />
          ))}
        </div>
      )}

      {!loading && monitors.length === 0 && !error && (
        <div className="uptime-empty">Мониторы не найдены</div>
      )}
    </div>
  );
}
