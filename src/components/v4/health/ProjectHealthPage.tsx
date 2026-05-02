import { useMemo } from "react";
import { useProjectHealth } from "../../../hooks/useProjectHealth";
import type { HealthFinding, HealthLayer, HealthReport } from "../../../types/health";
import type { ProjectData } from "../../../types";

interface Props {
  repo: string;
  project?: ProjectData;
  onBack: () => void;
}

const LAYER_TITLES: Record<HealthLayer, string> = {
  1: "Гигиена",
  2: "Документация",
  3: "Свежесть и операционка",
  4: "Drift (AI)",
};

const STATUS_ICON: Record<HealthFinding["status"], string> = {
  pass: "✓",
  fail: "✗",
  unknown: "?",
  skipped: "—",
};

const SEVERITY_LABEL: Record<HealthFinding["severity"], string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function FindingsLayer({
  layer,
  findings,
}: {
  layer: HealthLayer;
  findings: HealthFinding[];
}) {
  const items = findings.filter((f) => f.layer === layer);
  if (items.length === 0) return null;

  // Sort: fail → unknown → pass → skipped, then by severity weight.
  const order: Record<HealthFinding["status"], number> = {
    fail: 0,
    unknown: 1,
    pass: 2,
    skipped: 3,
  };
  const sevOrder: Record<HealthFinding["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const sorted = [...items].sort((a, b) => {
    const s = order[a.status] - order[b.status];
    if (s !== 0) return s;
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  const summary = items.reduce(
    (acc, f) => {
      acc[f.status]++;
      return acc;
    },
    { pass: 0, fail: 0, unknown: 0, skipped: 0 } as Record<HealthFinding["status"], number>,
  );

  return (
    <details className="v4-health-layer" open>
      <summary>
        <strong>Слой {layer}: {LAYER_TITLES[layer]}</strong>
        {" — "}
        <span style={{ color: "var(--v4-good-700)" }}>{summary.pass} ok</span>
        {" / "}
        <span style={{ color: "var(--v4-p1)" }}>{summary.fail} провалено</span>
        {summary.unknown > 0 && <> {" / "} <span style={{ opacity: 0.7 }}>{summary.unknown} не определено</span></>}
        {summary.skipped > 0 && <> {" / "} <span style={{ opacity: 0.5 }}>{summary.skipped} пропущено</span></>}
      </summary>
      <div className="v4-health-list">
        {sorted.map((f) => (
          <div key={f.rule_id} className={`v4-health-item v4-health-item--${f.status}`}>
            <span className="v4-health-item-icon">{STATUS_ICON[f.status]}</span>
            <div className="v4-health-item-body">
              <div className="v4-health-item-title">
                {f.title}
                {f.status === "fail" && (
                  <span className={`v4-health-item-sev v4-health-item-sev--${f.severity}`}>
                    {SEVERITY_LABEL[f.severity]}
                  </span>
                )}
              </div>
              {f.detail && <div className="v4-health-item-detail">{f.detail}</div>}
              {f.status === "fail" && f.remediation && (
                <div className="v4-health-item-remediation">{f.remediation}</div>
              )}
              <div className="v4-health-item-meta">
                <code>{f.rule_id}</code>
                {f.source && <> · источник: {f.source}</>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function ProjectHealthPage({ repo, project, onBack }: Props) {
  const { report, loading, error, refresh } = useProjectHealth(repo);

  const failedCount = useMemo(
    () => (report ? report.findings.filter((f) => f.status === "fail").length : 0),
    [report],
  );

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <button type="button" className="v4-btn" onClick={onBack} style={{ marginBottom: 6 }}>
            ← Все проекты
          </button>
          <h1>{repo} — Health</h1>
          <div className="v4-sub">
            {project && (
              <>
                {project.client} · фаза {project.phase}
                {" · "}
              </>
            )}
            {report && (
              <>
                tier {report.classification.tier}
                {report.classification.complex ? " · complex" : ""}
                {report.classification.client ? " · client" : ""}
                {report.in_grace_period && " · grace period"}
              </>
            )}
          </div>
        </div>
        <div className="v4-ph-right">
          <button type="button" className="v4-btn" onClick={refresh} disabled={loading}>
            {loading ? "Сканирую…" : "Пересканировать"}
          </button>
        </div>
      </div>

      <div style={{ height: 10 }} />

      {error && (
        <div className="v4-panel">
          <div className="v4-empty" style={{ color: "var(--v4-p1)" }}>{error}</div>
        </div>
      )}

      {loading && !report && (
        <div className="v4-panel">
          <div className="v4-empty">Сканирую {repo}…</div>
        </div>
      )}

      {report && <ReportBody report={report} failedCount={failedCount} />}
    </div>
  );
}

function ReportBody({ report, failedCount }: { report: HealthReport; failedCount: number }) {
  return (
    <>
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">Health-score</div>
          <div className="v4-panel-meta">
            обновлено {new Date(report.generated_at).toLocaleTimeString("ru-RU")}
          </div>
        </div>
        <div className="v4-health-score">
          <div className={`v4-health-grade v4-health-grade--${report.score.grade}`}>
            {report.score.grade}
          </div>
          <div className="v4-health-score-num num">{report.score.raw}</div>
          <div className="v4-health-score-label">
            <div>{failedCount} нарушений</div>
            <div style={{ opacity: 0.6, fontSize: 12 }}>
              из {report.findings.filter((f) => f.status !== "skipped").length} применимых правил
            </div>
          </div>
        </div>

        <div className="v4-health-layers-summary">
          {([1, 2, 3, 4] as HealthLayer[]).map((layer) => {
            const s = report.by_layer[layer];
            const applied = s.total - s.skipped;
            if (applied === 0) return null;
            return (
              <div key={layer} className="v4-health-layer-stat">
                <div className="v4-health-layer-stat-title">Слой {layer}</div>
                <div className="v4-health-layer-stat-bar">
                  <span style={{ flex: s.pass, background: "var(--v4-good-500)" }} />
                  <span style={{ flex: s.fail, background: "var(--v4-p1)" }} />
                  <span style={{ flex: s.unknown, background: "var(--v4-warn-500, #d4a017)" }} />
                </div>
                <div className="v4-health-layer-stat-meta">
                  {s.pass}/{applied}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">Чек-лист</div>
        </div>
        {([1, 2, 3, 4] as HealthLayer[]).map((layer) => (
          <FindingsLayer key={layer} layer={layer} findings={report.findings} />
        ))}
      </div>
    </>
  );
}
