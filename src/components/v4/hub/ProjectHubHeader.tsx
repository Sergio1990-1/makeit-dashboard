import type { ProjectHubData } from "../../../types/hub";

interface Props {
  data: ProjectHubData;
}

const PHASE_LABELS: Record<string, string> = {
  "pre-dev": "предразработка",
  development: "разработка",
  support: "поддержка",
};

function formatLastActivity(iso: string | null): string {
  if (!iso) return "—";
  // Use date-only ISO slice; matches the v4 monospace meta style elsewhere
  // (no relative formatting yet — that lands with the Pulse aggregator in
  // Epic-011).
  return iso.slice(0, 10);
}

/**
 * Header for ProjectHubPage. Composes data from useProjectHub: project
 * identity on the left, health KPI on the right, NBA strip in the middle.
 * The "Регенерировать" button is wired to a no-op stub today — Epic-012
 * (Task-05 NBA engine) replaces it with a real action.
 *
 * Visuals reuse existing v4 tokens via `v4-hub-*` classes defined in
 * v4.css; tier pills reuse the `ph-tag` family for parity with the Health
 * Hero so the same project shows the same chip across surfaces.
 */
export function ProjectHubHeader({ data }: Props) {
  const repo = data.project?.repo ?? data.health?.repo ?? "";
  const tier = data.health?.classification.tier ?? null;
  const phase = data.project?.phase ?? null;
  const client = data.project?.client ?? null;
  const lastActivity = data.project?.lastActivityDate ?? null;
  const grade = data.health?.score.grade ?? "—";
  const hasGrade = data.health !== null;
  const scorePct = data.health?.score.raw ?? null;
  const nbaText = data.nba[0]?.text ?? "—";

  return (
    <header className="v4-hub-header">
      <div className="v4-hub-header-id">
        <h1 className="v4-hub-title">
          <span className="v4-mono">{repo}</span>
        </h1>
        <div className="v4-hub-header-tags">
          {tier !== null && (
            <span className={`ph-tag ph-tag--tier${tier}`}>tier {tier}</span>
          )}
          {phase && (
            <span className="v4-hub-phase" title={PHASE_LABELS[phase] ?? phase}>
              {PHASE_LABELS[phase] ?? phase}
            </span>
          )}
          {client && <span className="v4-hub-client">{client}</span>}
          <span className="v4-hub-meta">last activity: {formatLastActivity(lastActivity)}</span>
        </div>
      </div>
      <div className="v4-hub-header-health" aria-label="Health summary">
        <div
          className={hasGrade ? `v4-hub-grade v4-hub-grade--${grade.toLowerCase()}` : "v4-hub-grade"}
          aria-label={hasGrade ? `Grade ${grade}` : "Grade not yet available"}
        >
          {grade}
        </div>
        <div className="v4-hub-score">{scorePct !== null ? `${scorePct}%` : "—"}</div>
        <div className="v4-sparkline-placeholder" aria-hidden="true" />
      </div>
      <div className="v4-hub-nba-row">
        <span className="v4-hub-nba-label">Next Best Action:</span>
        <span className="v4-hub-nba-text">{nbaText}</span>
        <button
          type="button"
          className="v4-btn"
          disabled
          title="Будет в Epic-012 (NBA engine)"
          aria-label="Регенерировать NBA — будет доступно в Epic-012"
        >
          Регенерировать
        </button>
      </div>
    </header>
  );
}
