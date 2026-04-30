import {
  PHASE_ORDER,
  PHASE_LABEL,
  type PipelineStageEntry,
} from "../../../utils/pipeline";

type PhaseStateKind =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failure"
  | "terminal_failure";

interface PhaseState {
  kind: PhaseStateKind;
  entry?: PipelineStageEntry;
}

const warnedUnknownPhases = new Set<string>();

function buildPhaseList(stages?: PipelineStageEntry[]): string[] {
  if (!stages?.length) return [...PHASE_ORDER];
  const known = new Set<string>(PHASE_ORDER);
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const s of stages) {
    if (known.has(s.phase) || seen.has(s.phase)) continue;
    seen.add(s.phase);
    unknown.push(s.phase);
    if (!warnedUnknownPhases.has(s.phase)) {
      warnedUnknownPhases.add(s.phase);
      console.warn(`[pipeline] unknown phase '${s.phase}' — append to PHASE_ORDER`);
    }
  }
  return unknown.length ? [...PHASE_ORDER, ...unknown] : [...PHASE_ORDER];
}

function getPhaseState(stages: PipelineStageEntry[] | undefined, phase: string): PhaseState {
  if (!stages?.length) return { kind: "pending" };
  let last: PipelineStageEntry | undefined;
  for (const s of stages) if (s.phase === phase) last = s;
  if (!last) return { kind: "pending" };
  return { kind: last.status, entry: last };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}с`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 60) return `${m}м ${s}с`;
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м`;
}

interface Props {
  stages?: PipelineStageEntry[];
  /** Compact mode hides labels, shows only dots */
  compact?: boolean;
}

export function PhaseDots({ stages, compact = false }: Props) {
  const phases = buildPhaseList(stages);
  return (
    <div className={`v4-pl-phases ${compact ? "v4-pl-phases--compact" : ""}`}>
      {phases.map((phase, i) => {
        const state = getPhaseState(stages, phase);
        const dotCls =
          state.kind === "success" || state.kind === "partial"
            ? "v4-pl-dot--ok"
            : state.kind === "failure" || state.kind === "terminal_failure"
            ? "v4-pl-dot--fail"
            : state.kind === "running"
            ? "v4-pl-dot--running"
            : "v4-pl-dot--pending";

        let tooltip: string | undefined;
        if (state.entry) {
          const e = state.entry;
          const parts: string[] = [PHASE_LABEL[phase] ?? phase];
          if (e.duration_seconds > 0) parts.push(formatDuration(e.duration_seconds));
          if (e.cost_usd > 0) parts.push(`$${e.cost_usd.toFixed(2)}`);
          if (e.summary) parts.push(e.summary);
          tooltip = parts.join(" · ");
        }

        return (
          <div key={phase} className="v4-pl-phase-cell" title={tooltip}>
            {i > 0 && <span className={`v4-pl-phase-link ${dotCls}`} />}
            <span className={`v4-pl-dot ${dotCls}`} />
            {!compact && (
              <span className="v4-pl-phase-label">
                {PHASE_LABEL[phase] ?? phase}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
