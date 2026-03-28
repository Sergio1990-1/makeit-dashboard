import type { Monitor, MonitorStatus } from "../types";
import { getWorkerUrl, setWorkerUrl } from "../utils/config";
import { useState } from "react";

const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "Online",
  down: "Down",
  paused: "Paused",
  pending: "Pending",
};

function MonitorRow({ monitor }: { monitor: Monitor }) {
  const uptime =
    monitor.uptimePct != null ? `${monitor.uptimePct.toFixed(2)}%` : "—";
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

interface UptimeBarProps {
  monitors: Monitor[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function UptimeBar({ monitors, loading, error, onRefresh }: UptimeBarProps) {
  const [urlInput, setUrlInput] = useState("");
  const [hasUrl, setHasUrl] = useState(!!getWorkerUrl());

  function handleSaveUrl() {
    const trimmed = urlInput.trim();
    if (trimmed) {
      setWorkerUrl(trimmed);
      setHasUrl(true);
      setUrlInput("");
    }
  }

  if (!hasUrl) {
    return (
      <div className="uptime-setup">
        <h3>Мониторинг Better Stack</h3>
        <p>
          Для работы нужен Cloudflare Worker, который проксирует запросы к Better Stack API.
          <br />
          <a
            href="https://github.com/Sergio1990-1/makeit-dashboard/blob/main/cloudflare-worker/betterstack-proxy.js"
            target="_blank"
            rel="noopener noreferrer"
          >
            Инструкция по настройке →
          </a>
        </p>
        <div className="uptime-token-form">
          <input
            type="url"
            placeholder="https://betterstack-proxy.YOUR-NAME.workers.dev"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveUrl()}
          />
          <button onClick={handleSaveUrl}>Сохранить</button>
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
          onClick={onRefresh}
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
