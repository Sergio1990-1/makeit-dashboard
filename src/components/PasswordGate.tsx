import { useState } from "react";
import { setAuth } from "../utils/config";

const PASSWORD_HASH = "251ce4de986affc2b9dde5930c4c2e0fb58e640643d19e1ab829ba31c3045230";

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Props {
  onAuth: () => void;
}

export function PasswordGate({ onAuth }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || checking) return;

    setChecking(true);
    setError(false);

    const hash = await sha256(password.trim());
    if (hash === PASSWORD_HASH) {
      setAuth();
      onAuth();
    } else {
      setError(true);
      setChecking(false);
    }
  };

  return (
    <div className="password-gate">
      <div className="password-gate-card">
        <h1 className="password-gate-title">MakeIT Dashboard</h1>
        <p className="password-gate-subtitle">Введите пароль для доступа</p>

        <form onSubmit={handleSubmit} className="password-gate-form">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Пароль"
            className={`input ${error ? "input-error" : ""}`}
            autoFocus
            disabled={checking}
          />
          {error && <span className="password-gate-error">Неверный пароль</span>}
          <button type="submit" className="btn btn-primary" disabled={checking || !password.trim()}>
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
