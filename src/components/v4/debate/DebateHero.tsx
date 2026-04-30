import type { DebateListItem } from "../../../types/debate";

interface Props {
  debates: DebateListItem[];
  loading: boolean;
  onRefresh: () => void;
  onStart: () => void;
  /** Open the active debate's chat view. */
  onOpenActive: (id: string) => void;
}

export function DebateHero({ debates, loading, onRefresh, onStart, onOpenActive }: Props) {
  const active = debates.find((d) => d.status === "running");
  const queued = debates.filter((d) => d.status === "queued").length;
  const total = debates.length;

  const health: "ok" | "warn" | "danger" | "unknown" = active
    ? "warn"
    : total === 0
      ? "unknown"
      : "ok";

  const title = active
    ? "Идёт дебат"
    : queued > 0
      ? `${queued} в очереди`
      : total === 0
        ? "Дебатов ещё не было"
        : "Все дебаты завершены";

  return (
    <div className={`v4-db-hero v4-db-hero--${health}`}>
      <div className="v4-db-hero-status">
        <span className={`v4-db-hero-dot v4-db-hero-dot--${health}`} aria-hidden="true" />
        <div>
          <div className="v4-db-hero-title">{title}</div>
          <div className="v4-db-hero-sub">
            {active ? (
              <>
                <span className="v4-db-hero-topic" title={active.topic}>{active.topic}</span>
                {active.project && (
                  <>
                    <span className="v4-db-sep">·</span>
                    <span className="v4-pl-mono v4-db-text-muted">
                      {active.project.split("/").pop()}
                    </span>
                  </>
                )}
              </>
            ) : total === 0 ? (
              <>Multi-agent technical consilium для архитектурных решений</>
            ) : (
              <>Запустите новый дебат или откройте историю</>
            )}
          </div>
        </div>
      </div>
      <div className="v4-db-hero-actions">
        {active && (
          <button
            type="button"
            className="v4-btn"
            onClick={() => onOpenActive(active.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            Открыть
          </button>
        )}
        <button type="button" className="v4-btn" onClick={onRefresh} disabled={loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.22-8.56" />
            <path d="M21 3v6h-6" />
          </svg>
          {loading ? "Загрузка…" : "Обновить"}
        </button>
        <button type="button" className="v4-btn v4-btn--pri" onClick={onStart}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Запустить дебат
        </button>
      </div>
    </div>
  );
}
