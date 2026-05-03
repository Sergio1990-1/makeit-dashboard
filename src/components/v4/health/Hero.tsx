import type { HealthReport } from "../../../types/health";
import { Icon } from "./Icon";
import { KpiRow } from "./KpiRow";
import { formatScanTime } from "./utils";

interface Props {
  report: HealthReport;
  onRescan: () => void;
  refreshing: boolean;
  rulesCount: number;
  /** Optional — wired from ProjectHealthPage to open the BulkCreateModal. */
  onBulkCreate?: () => void;
}

// Header of the report — repo name with classification chips, sub-row with
// scan time and rules-version link, action buttons (drift scan placeholder
// + rescan), and the 3-tile KPI row. Navigation back to the projects list
// happens via the topbar breadcrumb.
export function Hero({ report, onRescan, refreshing, rulesCount, onBulkCreate }: Props) {
  const cls = report.classification;
  // Bulk-create only makes sense when there's something to file. Hiding the
  // button (rather than disabling) keeps the toolbar visually clean for
  // healthy projects.
  const hasFails = report.findings.some((f) => f.status === "fail");
  return (
    <section className="ph-hero-block">
      <div className="ph-hero-top">
        <div className="ph-hero-id">
          <div className="ph-hero-titlerow">
            <h1>
              <span className="v4-mono">{report.repo}</span>
            </h1>
            <div className="ph-hero-tags">
              <span className={`ph-tag ph-tag--tier${cls.tier}`}>tier {cls.tier}</span>
              {cls.complex && <span className="ph-tag ph-tag--complex">complex</span>}
              {cls.client ? (
                <span className="ph-tag ph-tag--client">client</span>
              ) : (
                <span className="ph-tag ph-tag--internal">internal</span>
              )}
              {report.in_grace_period && (
                <span className="ph-tag ph-tag--grace">
                  <Icon name="seedling" /> grace · {report.grace_period_days}{" "}
                  {report.grace_period_days === 1 ? "день" : report.grace_period_days < 5 ? "дня" : "дней"}
                </span>
              )}
            </div>
          </div>
          <div className="ph-hero-sub">
            <span><Icon name="clock" /> Скан {formatScanTime(report.generated_at)}</span>
            <span className="v4-sep">·</span>
            <a
              href="https://github.com/Sergio1990-1/makeit-knowledge/blob/main/Skills/PROJECT_CHECKLIST.yaml"
              target="_blank"
              rel="noreferrer"
              className="ph-hero-link"
            >
              <Icon name="book" /> {rulesCount} правил · makeit-knowledge
            </a>
          </div>
        </div>
        <div className="ph-hero-actions">
          {hasFails && onBulkCreate && (
            <button
              type="button"
              className="v4-btn"
              onClick={onBulkCreate}
              title="Массово создать GitHub issues для всех нарушений"
            >
              <Icon name="git-branch" /> Создать issues по всем
            </button>
          )}
          <button type="button" className="v4-btn" disabled title="Layer 4 — следующая итерация">
            <Icon name="zap" /> Просканировать drift
          </button>
          <button
            type="button"
            className={`v4-btn v4-btn--pri ${refreshing ? "is-spin" : ""}`}
            disabled={refreshing}
            onClick={onRescan}
          >
            <Icon name="refresh" />
            {refreshing ? "Сканирую…" : "Пересканировать"}
          </button>
        </div>
      </div>

      <KpiRow report={report} />
    </section>
  );
}
