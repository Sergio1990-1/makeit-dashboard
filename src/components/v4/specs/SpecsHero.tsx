import type { SpecsProject } from "../../../types";
import { totals } from "./utils";

interface Props {
  projects: SpecsProject[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function SpecsHero({ projects, loading, error, onRefresh }: Props) {
  const t = totals(projects);

  const health: "ok" | "warn" | "danger" | "unknown" =
    error ? "danger"
    : t.prds === 0 ? "unknown"
    : t.inDevelopment > 0 ? "ok"
    : t.specReady > 0 ? "warn"
    : "unknown";

  const title = error
    ? "Ошибка загрузки спецификаций"
    : t.prds === 0
      ? "Specs Tracking"
      : t.inDevelopment > 0
        ? `${t.inDevelopment} ${t.inDevelopment === 1 ? "PRD" : "PRD"} в разработке`
        : t.specReady > 0
          ? `${t.specReady} ${t.specReady === 1 ? "спека готова" : "спек готовы"} к запуску`
          : `${t.prds} ${t.prds === 1 ? "спецификация" : "спецификаций"}`;

  return (
    <div className={`v4-rsh-hero v4-rsh-hero--${health}`}>
      <div className="v4-rsh-hero-status">
        <span className={`v4-rsh-hero-dot v4-rsh-hero-dot--${health}`} aria-hidden="true" />
        <div>
          <div className="v4-rsh-hero-title">{title}</div>
          <div className="v4-rsh-hero-sub">
            {error ? (
              <>{error}</>
            ) : t.prds === 0 ? (
              <>PRD → Epic → Tasks из <span className="v4-pl-mono">makeit-pipeline</span>. Запустите <span className="v4-pl-mono">makeit-plan</span> для генерации спецификаций.</>
            ) : (
              <>
                <b>{t.prds}</b> PRD
                <span className="v4-rsh-sep">·</span>
                <b>{t.epics}</b> {t.epics === 1 ? "epic" : "epics"}
                <span className="v4-rsh-sep">·</span>
                <b>{t.tasks}</b> {t.tasks === 1 ? "задача" : "задач"}
                {t.completed > 0 && (
                  <>
                    <span className="v4-rsh-sep">·</span>
                    <b className="v4-rsh-text-success">{t.completed}</b> завершено
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="v4-rsh-hero-actions">
        <button type="button" className="v4-btn" onClick={onRefresh} disabled={loading}>
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
