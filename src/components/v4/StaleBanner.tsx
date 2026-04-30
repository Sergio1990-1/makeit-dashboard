import { useState } from "react";
import type { ProjectData } from "../../types";

interface Props {
  projects: ProjectData[];
  onOpenList?: () => void;
  /** Days since activity threshold; default 2 */
  threshold?: number;
}

export function StaleBanner({ projects, onOpenList, threshold = 2 }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const stale = projects.filter(
    (p) =>
      p.daysSinceActivity !== null &&
      p.daysSinceActivity >= threshold &&
      p.openCount > 0
  );

  if (stale.length === 0 || dismissed) return null;

  const repos = stale.slice(0, 5).map((p) => p.repo).join(" · ");
  const more = stale.length > 5 ? ` (+${stale.length - 5})` : "";

  return (
    <div className="v4-banner" style={{ marginTop: 14 }}>
      <div className="v4-banner-bi">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </div>
      <div className="v4-banner-bt">
        <b>
          {stale.length} проект{stale.length === 1 ? "" : stale.length < 5 ? "а" : "ов"} без активности более {threshold} дней
        </b>
        <span>
          {repos}{more} — стоит обсудить статус и разблокировать
        </span>
      </div>
      <div className="v4-banner-bact">
        <button type="button" className="v4-btn" onClick={() => setDismissed(true)}>
          Отложить
        </button>
        {onOpenList && (
          <button type="button" className="v4-btn v4-btn--pri" onClick={onOpenList}>
            Открыть список
          </button>
        )}
      </div>
    </div>
  );
}
