// Business-process model — read view over `docs/business_process.yaml`.
//
// One canonical, layout-free schema per repo: lanes + nodes (with a lane
// and a column index) + sequence flows. Pixel geometry is NOT part of the
// contract — the diagram derives all coordinates deterministically from
// `lane` + `col`, so the (future) generator stays cheap and the file stays
// diffable/reviewable. JSON Schema for the same contract lives at
// docs/business_process.schema.json.

/** BPMN-lite element kind. `task` may carry an optional `sub` (system). */
export type BpNodeType = "start" | "end" | "task" | "gateway";

/** One swimlane (a participant/role). Rendered as a horizontal band. */
export interface BpLane {
  id: string;
  name: string;
}

/**
 * One process element. `lane` references a `BpLane.id`; `col` is the
 * left→right column index used for deterministic layout (no pixels).
 * `sub` (e.g. a service/module name) styles the task as a system/artifact.
 */
export interface BpNode {
  id: string;
  type: BpNodeType;
  lane: string;
  col: number;
  name: string;
  sub?: string;
}

/** A sequence flow `from`→`to`; `label` annotates gateway branches. */
export interface BpFlow {
  from: string;
  to: string;
  label?: string;
}

/** One business process (swimlane diagram). */
export interface BpProcess {
  id: string;
  name: string;
  lanes: BpLane[];
  nodes: BpNode[];
  flows: BpFlow[];
}

/** Top-level shape of `docs/business_process.yaml`. */
export interface BusinessProcessDoc {
  version: number;
  project: string;
  processes: BpProcess[];
}

export const BP_NODE_TYPES: readonly BpNodeType[] = [
  "start",
  "end",
  "task",
  "gateway",
] as const;
