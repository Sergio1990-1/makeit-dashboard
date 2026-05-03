import { useEffect, useRef, useState } from "react";
import {
  loadAllSettings,
  setBootstrapToken,
  SettingsAuthError,
  SettingsUnavailableError,
} from "../../utils/settings";

interface Props {
  onSuccess: () => void;
}

/**
 * First-run / re-auth screen for the Pipeline settings store.
 *
 * Renders when the dashboard has no bootstrap token (or the token was
 * rejected). The user pastes a bootstrap token issued by the Pipeline admin;
 * on submit we save it, immediately try `loadAllSettings()`, and either
 * proceed (onSuccess) or show an inline error.
 *
 * Errors handled:
 *  - SettingsAuthError       → "Токен отклонён" (likely typo / wrong token)
 *  - SettingsUnavailableError → "Pipeline недоступен" (network/5xx)
 */
export function SettingsBootstrap({ onSuccess }: Props) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount so the user can paste immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc clears the input — no destructive action, so no confirm dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setValue("");
        setError(null);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = value.trim();
    if (!token || submitting) return;
    setSubmitting(true);
    setError(null);
    setBootstrapToken(token);
    try {
      await loadAllSettings();
      // Don't clear `value` — the form unmounts on success anyway, and
      // clearing first causes a brief blank-input flash.
      onSuccess();
    } catch (err) {
      if (err instanceof SettingsAuthError) {
        setError(
          "Токен отклонён. Проверьте, что вы скопировали значение целиком и без пробелов.",
        );
      } else if (err instanceof SettingsUnavailableError) {
        setError(
          "Pipeline API недоступен. Проверьте подключение и нажмите «Подключить» ещё раз.",
        );
      } else {
        setError(
          `Не удалось проверить токен: ${(err as Error)?.message ?? "неизвестная ошибка"}`,
        );
      }
      setSubmitting(false);
      // Refocus so the next attempt is one keystroke away.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div
      className="v4-app"
      style={{ gridTemplateColumns: "1fr", minHeight: "100vh" }}
    >
      <main className="v4-main">
        <div
          className="v4-content"
          style={{
            paddingTop: 80,
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>MakeIT Dashboard</h1>
          <p
            style={{
              color: "var(--v4-ink-500)",
              marginBottom: 24,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Подключитесь к серверному хранилищу настроек Pipeline.
            Bootstrap-токен выдаёт администратор Pipeline (один раз на
            устройство).
          </p>
          <form onSubmit={handleSubmit} className="token-form">
            <label
              htmlFor="settings-bootstrap-token"
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12,
                color: "var(--v4-ink-500)",
              }}
            >
              Bootstrap-токен
            </label>
            <div className="token-input-row" style={{ display: "flex", gap: 8 }}>
              <input
                id="settings-bootstrap-token"
                ref={inputRef}
                type="password"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Вставьте токен"
                className="input"
                autoComplete="off"
                disabled={submitting}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="v4-btn v4-btn--pri"
                disabled={!value.trim() || submitting}
              >
                {submitting ? "Подключение…" : "Подключить"}
              </button>
            </div>
            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--v4-danger-50, rgba(239,68,68,0.08))",
                  border: "1px solid var(--v4-danger-100, rgba(239,68,68,0.25))",
                  color: "var(--v4-danger-700, #b91c1c)",
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}
            <p
              style={{
                marginTop: 18,
                fontSize: 12,
                color: "var(--v4-ink-500)",
                lineHeight: 1.5,
              }}
            >
              Получите токен у администратора Pipeline. Токен сохраняется
              локально на этом устройстве и используется для запросов к
              Pipeline settings API.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

interface UnavailableProps {
  onRetry: () => void;
}

/**
 * Diagnostic screen shown when the Pipeline is reachable enough to fail with
 * 5xx / network. Lets the user retry without losing the bootstrap token.
 */
export function SettingsUnavailable({ onRetry }: UnavailableProps) {
  return (
    <div
      className="v4-app"
      style={{ gridTemplateColumns: "1fr", minHeight: "100vh" }}
    >
      <main className="v4-main">
        <div
          className="v4-content"
          style={{
            paddingTop: 80,
            maxWidth: 520,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>
            Pipeline API недоступен
          </h1>
          <p
            style={{
              color: "var(--v4-ink-500)",
              marginBottom: 24,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Не удалось загрузить настройки с Pipeline. Проверьте, что Pipeline
            запущен и доступен по сети, затем повторите попытку.
          </p>
          <button
            type="button"
            className="v4-btn v4-btn--pri"
            onClick={onRetry}
          >
            Повторить
          </button>
        </div>
      </main>
    </div>
  );
}
