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
  /** Drift scan handler (Layer 4). When omitted the button is hidden. */
  onScanDrift?: () => void;
  /** True while a drift scan is in flight — disables the button + shows progress. */
  driftScanning?: boolean;
  /** Progress emitted by `runDriftScan`. null when idle. */
  driftProgress?: { done: number; total: number; currentRule?: string } | null;
  /** True when a Claude API key is configured. Drives disabled-with-tooltip. */
  hasClaudeKey?: boolean;
}

// Header of the report — repo name with classification chips, sub-row with
// scan time and rules-version link, action buttons (drift scan placeholder
// + rescan), and the 3-tile KPI row. Navigation back to the projects list
// happens via the topbar breadcrumb.
export function Hero({
  report,
  onRescan,
  refreshing,
  rulesCount,
  onBulkCreate,
  onScanDrift,
  driftScanning = false,
  driftProgress = null,
  hasClaudeKey = false,
}: Props) {
  const cls = report.classification;
  // Bulk-create only makes sense when there's something to file. Hiding the
  // button (rather than disabling) keeps the toolbar visually clean for
  // healthy projects.
  const hasFails = report.findings.some((f) => f.status === "fail");

  // Drift button label / progress logic. We render the same button whether
  // we're idle, scanning, or disabled-without-key — only the title attribute
  // and the inner content change.
  const driftDisabled = !hasClaudeKey || driftScanning || !onScanDrift;
  const driftTitle = !hasClaudeKey
    ? "Нужен Claude API key — настрой в шапке"
    : driftScanning
      ? "Drift-скан в процессе…"
      : !onScanDrift
        ? "Drift-скан недоступен на этой странице"
        : "Layer 4 — AI drift-проверки";

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
          <button
            type="button"
            className={`v4-btn ${driftScanning ? "is-spin" : ""}`}
            disabled={driftDisabled}
            onClick={driftDisabled ? undefined : onScanDrift}
            title={driftTitle}
            aria-label={
              driftScanning && driftProgress
                ? `Drift ${driftProgress.done}/${driftProgress.total}${
                    driftProgress.currentRule ? ` · ${driftProgress.currentRule}` : ""
                  }`
                : "Просканировать drift"
            }
          >
            <Icon name="zap" />
            {driftScanning && driftProgress
              ? `Drift ${driftProgress.done}/${driftProgress.total}`
              : "Просканировать drift"}
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
