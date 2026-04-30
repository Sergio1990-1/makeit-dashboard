import { useState } from "react";
import { setWorkerUrl } from "../../../utils/config";

interface Props {
  onSaved: () => void;
}

export function MonitoringSetup({ onSaved }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setError("Введите URL воркера");
      return;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        setError("URL должен быть http(s)");
        return;
      }
    } catch {
      setError("Невалидный URL");
      return;
    }
    setError(null);
    setWorkerUrl(trimmed);
    onSaved();
  }

  return (
    <div className="v4-panel v4-mon-setup">
      <div className="v4-panel-h">
        <div className="v4-panel-t">Подключение Better Stack</div>
      </div>
      <div className="v4-mon-setup-body">
        <p className="v4-mon-setup-desc">
          Для работы нужен Cloudflare Worker, который проксирует запросы к Better Stack API
          (чтобы не светить токен в браузере).
        </p>
        <a
          className="v4-mon-setup-doc"
          href="https://github.com/Sergio1990-1/makeit-dashboard/blob/main/cloudflare-worker/betterstack-proxy.js"
          target="_blank"
          rel="noopener noreferrer"
        >
          📖 Инструкция по настройке воркера →
        </a>

        <label className="v4-mon-setup-field">
          <span className="v4-tpc-control-key">URL воркера</span>
          <input
            type="url"
            className="v4-pl-input"
            placeholder="https://betterstack-proxy.YOUR-NAME.workers.dev"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
        </label>

        {error && <div className="v4-error">{error}</div>}

        <div className="v4-mon-setup-actions">
          <button type="button" className="v4-btn v4-btn--pri" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
