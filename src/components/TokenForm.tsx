import { useState } from "react";
import { getToken, setToken, clearToken } from "../utils/config";

interface Props {
  onTokenSet: () => void;
}

export function TokenForm({ onTokenSet }: Props) {
  const [value, setValue] = useState("");
  const hasToken = !!getToken();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      setToken(value.trim());
      setValue("");
      onTokenSet();
    }
  };

  if (hasToken) {
    return (
      <div className="token-status">
        <span>GitHub token: ✓ настроен</span>
        <button
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
          className="btn btn-sm btn-danger"
        >
          Сбросить
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="token-form">
      <h2>Настройка GitHub Token</h2>
      <p>Нужен Personal Access Token с правами: <code>repo</code>, <code>read:project</code></p>
      <div className="token-input-row">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ghp_..."
          className="input"
        />
        <button type="submit" className="btn btn-primary">
          Сохранить
        </button>
      </div>
    </form>
  );
}
