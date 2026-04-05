import { useState } from "react";
import { setAuth } from "../utils/config";

// Access gate password. Same security level as the nginx Basic Auth it replaces.
// Real protection is API keys in localStorage — without them auditor won't start.
const ACCESS_PASSWORD = "makeit2026";

interface Props {
  onAuth: () => void;
}

export function PasswordGate({ onAuth }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    if (password.trim() === ACCESS_PASSWORD) {
      setAuth();
      onAuth();
    } else {
      setError(true);
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
          />
          {error && <span className="password-gate-error">Неверный пароль</span>}
          <button type="submit" className="btn btn-primary" disabled={!password.trim()}>
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
