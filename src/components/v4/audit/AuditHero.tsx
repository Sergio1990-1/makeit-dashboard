import type { AuditProjectStatus } from "../../../types";
import {
  poolHealth,
  totalFindingsBySeverity,
  type AuditHealth,
} from "./utils";

interface Props {
  projects: AuditProjectStatus[];
  loading: boolean;
  onRefresh: () => void;
  /** Optional title override — defaults to "Аудит кода" / "UX аудит" set by parent. */
  title?: string;
}

const HEALTH_TITLE: Record<AuditHealth, string> = {
  ok: "Критических находок нет",
  warn: "Есть высокоприоритетные находки",
  danger: "Есть критические находки",
  unknown: "Аудит не проводился",
};

export function AuditHero({ projects, loading, onRefresh }: Props) {
  const health = poolHealth(projects);
  const totals = totalFindingsBySeverity(projects);
  const audited = projects.filter((p) => p.last_run).length;
  const needsVerify = projects.filter((p) => p.last_run && !p.last_run.verification).length;

  return (
    <div className={`v4-au-hero v4-au-hero--${health}`}>
      <div className="v4-au-hero-status">
        <span className={`v4-au-hero-dot v4-au-hero-dot--${health}`} aria-hidden="true" />
        <div>
          <div className="v4-au-hero-title">{HEALTH_TITLE[health]}</div>
          <div className="v4-au-hero-sub">
            {audited > 0 ? (
              <>
                {totals.critical > 0 && (
                  <>
                    <b className="v4-au-text-danger">{totals.critical}</b> критических
                    <span className="v4-au-sep">·</span>
                  </>
                )}
                {totals.high > 0 && (
                  <>
                    <b className="v4-au-text-warn">{totals.high}</b> высоких
                    <span className="v4-au-sep">·</span>
                  </>
                )}
                {totals.medium > 0 && (
                  <>
                    <b>{totals.medium}</b> средних
                    <span className="v4-au-sep">·</span>
                  </>
                )}
                <span>проаудированы <b>{audited}</b> из <b>{projects.length}</b></span>
                {needsVerify > 0 && (
                  <>
                    <span className="v4-au-sep">·</span>
                    <b className="v4-au-text-warn">{needsVerify}</b> ждут верификации
                  </>
                )}
              </>
            ) : (
              <>Аудит не запускался ни для одного проекта. Выберите проект и нажмите «Аудит».</>
            )}
          </div>
        </div>
      </div>
      <div className="v4-au-hero-actions">
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
