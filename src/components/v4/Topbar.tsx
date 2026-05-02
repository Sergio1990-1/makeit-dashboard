import { useRef, useState } from "react";

interface Props {
  /** Crumb segments — last is bold (current page) */
  crumbs: string[];
  /** Show "GitHub API · live" pill */
  showLive?: boolean;
  /** Last refresh time */
  lastUpdated: Date | null;
  /** Refresh handler */
  onRefresh: () => void;
  /** Whether refresh is in flight */
  refreshing?: boolean;
  /** Logout handler */
  onLogout: () => void;
  /** Mobile sidebar toggle */
  onBurger?: () => void;
  /** Optional search submit. The ⌘K shortcut now opens the global Command
   *  Palette instead of focusing this input — it remains a passive search
   *  field for click-and-type usage. */
  onSearch?: (query: string) => void;
}

export function Topbar({
  crumbs,
  showLive = true,
  lastUpdated,
  onRefresh,
  refreshing,
  onLogout,
  onBurger,
  onSearch,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");

  return (
    <div className="v4-top">
      <div className="v4-crumbs">
        <button
          type="button"
          className="v4-ibtn v4-burger"
          onClick={onBurger}
          aria-label="Открыть меню"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span className="v4-sep">/</span>}
              {isLast ? <b>{c}</b> : <span>{c}</span>}
            </span>
          );
        })}
        {showLive && (
          <span className="v4-live" title={lastUpdated ? `Обновлено в ${lastUpdated.toLocaleTimeString("ru-RU")}` : "Нет данных"}>
            <span className="v4-live-dot" />
            GitHub API · live
          </span>
        )}
      </div>
      <div className="v4-top-right">
        <form
          className="v4-search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch?.(query);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по issues, milestones, проектам…"
            aria-label="Поиск"
          />
          <span className="v4-kbd">⌘K</span>
        </form>
        <button
          type="button"
          className={`v4-ibtn ${refreshing ? "is-spin" : ""}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Обновить"
          title="Обновить"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.22-8.56" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <button
          type="button"
          className="v4-ibtn"
          onClick={onLogout}
          aria-label="Выйти"
          title="Выйти и очистить токены"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
