import type { ProjectResearch } from "../../../types";
import { totals } from "./utils";

interface Props {
  projects: ProjectResearch[];
  loading: boolean;
  pipelineAvailable: boolean | null;
  onRefresh: () => void;
  onStart: () => void;
}

export function ResearchHero({ projects, loading, pipelineAvailable, onRefresh, onStart }: Props) {
  const t = totals(projects);
  const offline = pipelineAvailable === false;

  const health: "ok" | "warn" | "danger" | "unknown" =
    offline ? "danger"
    : t.projects === 0 ? "unknown"
    : t.withResearch === 0 ? "warn"
    : "ok";

  const title = offline
    ? "Pipeline API офлайн"
    : t.projects === 0
      ? "Research / Discovery"
      : t.withResearch === 0
        ? "Анализ ещё не проводился"
        : `Проанализировано ${t.withResearch} из ${t.projects} проектов`;

  return (
    <div className={`v4-rsh-hero v4-rsh-hero--${health}`}>
      <div className="v4-rsh-hero-status">
        <span className={`v4-rsh-hero-dot v4-rsh-hero-dot--${health}`} aria-hidden="true" />
        <div>
          <div className="v4-rsh-hero-title">{title}</div>
          <div className="v4-rsh-hero-sub">
            {offline ? (
              <>Запуск research/discovery агентов невозможен. Проверьте makeit-pipeline.</>
            ) : t.projects === 0 ? (
              <>Анализ рынка, конкурентов и болевых точек. Research → RESEARCH.md, Discovery → DISCOVERY.md.</>
            ) : (
              <>
                <b>{t.competitors}</b> конкурентов
                <span className="v4-rsh-sep">·</span>
                <b>{t.painPoints}</b> болевых точек
                <span className="v4-rsh-sep">·</span>
                <b>{t.suggestions}</b> идей
                {t.quickWins > 0 && (
                  <>
                    <span className="v4-rsh-sep">·</span>
                    <b className="v4-rsh-text-success">{t.quickWins}</b> quick wins
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
        <button
          type="button"
          className="v4-btn v4-btn--pri"
          onClick={onStart}
          disabled={offline}
          title={offline ? "Pipeline API недоступен" : "Запустить Research агента"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Запустить Research
        </button>
      </div>
    </div>
  );
}
