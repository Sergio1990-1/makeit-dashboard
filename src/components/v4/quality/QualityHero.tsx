import type { QualitySnapshot } from "../../../types";
import { healthColor, healthOf, pct, type Health } from "./utils";

interface Props {
  snapshot: QualitySnapshot | null;
  pendingCount: number;
  retroRunning: boolean;
  onRunRetro: () => void;
  onRefresh: () => void;
}

const HEALTH_LABEL: Record<Health, string> = {
  ok: "Здоровая система",
  warn: "Есть замечания",
  danger: "Требуется внимание",
  unknown: "Нет данных",
};

const HEALTH_DESC: Record<Health, string> = {
  ok: "Pipeline работает в зелёной зоне",
  warn: "Метрики в жёлтой зоне — стоит присмотреться",
  danger: "Метрики в красной зоне — нужен retro",
  unknown: "Запустите pipeline для генерации метрик",
};

export function QualityHero({
  snapshot,
  pendingCount,
  retroRunning,
  onRunRetro,
  onRefresh,
}: Props) {
  // Aggregate health: worst of FPR, retry, recovery
  const health: Health = !snapshot
    ? "unknown"
    : worstHealth([
        healthOf(snapshot.first_pass_success_rate, 0.8, 0.6),
        healthOf(snapshot.retry_rate, 0.1, 0.25, false),
        healthOf(snapshot.error_recovery_rate, 0.7, 0.4),
      ]);

  return (
    <div className={`v4-qa-hero v4-qa-hero--${health}`}>
      <div className="v4-qa-hero-status">
        <span className={`v4-qa-hero-dot v4-qa-hero-dot--${health}`} />
        <div>
          <div className="v4-qa-hero-title">{HEALTH_LABEL[health]}</div>
          <div className="v4-qa-hero-sub">
            {snapshot ? (
              <>
                С первой попытки{" "}
                <b style={{ color: healthColor(healthOf(snapshot.first_pass_success_rate, 0.8, 0.6)) }}>
                  {pct(snapshot.first_pass_success_rate, 0)}
                </b>
                <span className="v4-qa-sep">·</span>
                Повторы{" "}
                <b style={{ color: healthColor(healthOf(snapshot.retry_rate, 0.1, 0.25, false)) }}>
                  {pct(snapshot.retry_rate, 0)}
                </b>
                <span className="v4-qa-sep">·</span>
                Восстановление{" "}
                <b style={{ color: healthColor(healthOf(snapshot.error_recovery_rate, 0.7, 0.4)) }}>
                  {pct(snapshot.error_recovery_rate, 0)}
                </b>
                <span className="v4-qa-sep">·</span>
                <span className="v4-pl-mono">
                  {snapshot.merged_count}/{snapshot.total_issues}
                </span>{" "}
                замержено
                {pendingCount > 0 && (
                  <>
                    <span className="v4-qa-sep">·</span>
                    <b className="v4-qa-text-warn">{pendingCount}</b> в очереди
                  </>
                )}
              </>
            ) : (
              HEALTH_DESC[health]
            )}
          </div>
        </div>
      </div>
      <div className="v4-qa-hero-actions">
        <button type="button" className="v4-btn" onClick={onRefresh}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.22-8.56" />
            <path d="M21 3v6h-6" />
          </svg>
          Обновить
        </button>
        <button
          type="button"
          className="v4-btn v4-btn--pri"
          onClick={onRunRetro}
          disabled={retroRunning}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {retroRunning ? "Запуск…" : "Провести ретро"}
        </button>
      </div>
    </div>
  );
}

function worstHealth(items: Health[]): Health {
  const order: Health[] = ["danger", "warn", "ok", "unknown"];
  for (const h of order) if (items.includes(h)) return h;
  return "unknown";
}
