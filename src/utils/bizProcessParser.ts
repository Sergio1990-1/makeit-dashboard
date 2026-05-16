// Read model over `docs/business_process.yaml` (the canonical, layout-free
// business-process contract). Mirrors the risksRegister.ts philosophy:
// NEVER trust the file — a hand-edited or generator-produced YAML may carry
// an invalid node `type`, a `col` that isn't a number, a flow pointing at a
// deleted node, or a node in an unknown lane. We repair every row so the
// diagram can't crash on bad input, and drop only what is unrenderable.
//
// The (future) `makeit-bizproc` Claude Code skill is the producer; this
// module + docs/business_process.schema.json are the consumer-side contract
// it must satisfy. Golden example: docs/examples/business_process.example.yaml
// (kept byte-equivalent to EXAMPLE_BUSINESS_PROCESS below for the in-app
// "показать пример" preview).

import { readYaml } from "./github-contents";
import { BP_NODE_TYPES } from "../types/bizProcess";
import type {
  BpFlow,
  BpLane,
  BpNode,
  BpNodeType,
  BpProcess,
  BusinessProcessDoc,
} from "../types/bizProcess";

export const BIZPROC_PATH = "docs/business_process.yaml";

/** Trim to a string, tolerating `null`/`number`/missing yaml values. */
function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/** Coerce an arbitrary yaml value to a member of `allowed`, else `fallback`. */
function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Non-negative integer column index; anything bad → 0. */
function asCol(value: unknown): number {
  const n = typeof value === "number" ? value : Number(asString(value));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function normaliseLane(raw: unknown, index: number): BpLane {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id).trim() || `lane-${index + 1}`;
  return { id, name: asString(r.name).trim() || id };
}

function normaliseNode(
  raw: unknown,
  index: number,
  laneIds: Set<string>,
  fallbackLane: string,
): BpNode {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id).trim() || `n${index + 1}`;
  const laneRaw = asString(r.lane).trim();
  const sub = asString(r.sub).trim();
  return {
    id,
    type: coerceEnum<BpNodeType>(r.type, BP_NODE_TYPES, "task"),
    // Unknown lane → first lane, so the node still renders somewhere
    // visible instead of vanishing on a typo'd lane id.
    lane: laneIds.has(laneRaw) ? laneRaw : fallbackLane,
    col: asCol(r.col),
    name: asString(r.name).trim() || id,
    ...(sub ? { sub } : {}),
  };
}

function normaliseProcess(raw: unknown, index: number): BpProcess {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id).trim() || `process-${index + 1}`;

  const rawLanes = Array.isArray(r.lanes) ? r.lanes : [];
  const lanes = rawLanes.map(normaliseLane);
  // A process with no lanes still needs one band to place nodes into.
  if (lanes.length === 0) lanes.push({ id: "lane-1", name: "Процесс" });
  const laneIds = new Set(lanes.map((l) => l.id));
  const fallbackLane = lanes[0].id;

  const rawNodes = Array.isArray(r.nodes) ? r.nodes : [];
  const nodes = rawNodes.map((n, i) =>
    normaliseNode(n, i, laneIds, fallbackLane),
  );
  const nodeIds = new Set(nodes.map((n) => n.id));

  const rawFlows = Array.isArray(r.flows) ? r.flows : [];
  const flows: BpFlow[] = [];
  for (const f of rawFlows) {
    const fr = (f ?? {}) as Record<string, unknown>;
    const from = asString(fr.from).trim();
    const to = asString(fr.to).trim();
    // Drop dangling edges — an arrow to a node that doesn't exist is
    // unrenderable and would otherwise NaN the path geometry.
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    const label = asString(fr.label).trim();
    flows.push({ from, to, ...(label ? { label } : {}) });
  }

  return {
    id,
    name: asString(r.name).trim() || id,
    lanes,
    nodes,
    flows,
  };
}

/** Pull a sanitised `BusinessProcessDoc` out of whatever `readYaml` returned. */
export function parseBizProcessDoc(data: unknown): BusinessProcessDoc {
  const d = (data ?? {}) as Record<string, unknown>;
  const versionNum =
    typeof d.version === "number" ? d.version : Number(asString(d.version));
  const rawProcesses = Array.isArray(d.processes) ? d.processes : [];
  return {
    version: Number.isFinite(versionNum) ? versionNum : 1,
    project: asString(d.project).trim(),
    processes: rawProcesses
      .map(normaliseProcess)
      // A process with no nodes can't be drawn — hide it rather than
      // render an empty canvas with just swimlane bands.
      .filter((p) => p.nodes.length > 0),
  };
}

export interface LoadedBizProcess {
  doc: BusinessProcessDoc;
  sha: string;
}

/**
 * Load + parse `docs/business_process.yaml` for `repo`.
 *
 * Returns `null` when the file does not exist yet (404) — the caller
 * renders the "сгенерируй через скилл" empty state. A corrupt YAML throws
 * (via `readYaml`) so the user actually sees that the file is broken,
 * rather than a silent empty state hiding a real problem.
 */
export async function loadBizProcess(
  repo: string,
): Promise<LoadedBizProcess | null> {
  const res = await readYaml<unknown>(repo, BIZPROC_PATH);
  if (res === null) return null;
  return { doc: parseBizProcessDoc(res.data), sha: res.sha };
}

/**
 * In-app preview for the empty state AND the golden example the future
 * generator is benchmarked against. Kept byte-equivalent to
 * docs/examples/business_process.example.yaml.
 */
export const EXAMPLE_BUSINESS_PROCESS: BusinessProcessDoc = {
  version: 1,
  project: "example",
  processes: [
    {
      id: "order-fulfillment",
      name: "Выполнение заказа",
      lanes: [
        { id: "client", name: "Клиент" },
        { id: "manager", name: "Менеджер" },
        { id: "prod", name: "Производство" },
        { id: "qc", name: "ОТК" },
        { id: "wh", name: "Склад / Отгрузка" },
      ],
      nodes: [
        { id: "s", type: "start", lane: "client", col: 0, name: "Заявка на пошив" },
        { id: "order", type: "task", lane: "manager", col: 1, name: "Оформить заказ", sub: "order_service" },
        { id: "gStock", type: "gateway", lane: "manager", col: 2, name: "Ткань на складе?" },
        { id: "reserve", type: "task", lane: "wh", col: 3, name: "Зарезервировать ткань" },
        { id: "purchase", type: "task", lane: "manager", col: 3, name: "Закупка у поставщика", sub: "purchase_order" },
        { id: "plan", type: "task", lane: "prod", col: 4, name: "План раскроя" },
        { id: "cut", type: "task", lane: "prod", col: 5, name: "Раскрой" },
        { id: "sew", type: "task", lane: "prod", col: 6, name: "Пошив" },
        { id: "qcCheck", type: "task", lane: "qc", col: 7, name: "Контроль качества", sub: "qc_workflow" },
        { id: "gQc", type: "gateway", lane: "qc", col: 8, name: "Брак?" },
        { id: "ship", type: "task", lane: "wh", col: 9, name: "Упаковка и отгрузка" },
        { id: "e", type: "end", lane: "client", col: 10, name: "Заказ выдан" },
      ],
      flows: [
        { from: "s", to: "order" },
        { from: "order", to: "gStock" },
        { from: "gStock", to: "reserve", label: "да" },
        { from: "gStock", to: "purchase", label: "нет" },
        { from: "reserve", to: "plan" },
        { from: "purchase", to: "plan" },
        { from: "plan", to: "cut" },
        { from: "cut", to: "sew" },
        { from: "sew", to: "qcCheck" },
        { from: "qcCheck", to: "gQc" },
        { from: "gQc", to: "sew", label: "да · переделка" },
        { from: "gQc", to: "ship", label: "нет" },
        { from: "ship", to: "e" },
      ],
    },
    {
      id: "qc-workflow",
      name: "Цикл контроля качества",
      lanes: [
        { id: "prod", name: "Производство" },
        { id: "qc", name: "Контролёр ОТК" },
        { id: "mgr", name: "Начальник цеха" },
      ],
      nodes: [
        { id: "s", type: "start", lane: "prod", col: 0, name: "Партия готова" },
        { id: "sample", type: "task", lane: "qc", col: 1, name: "Отбор выборки" },
        { id: "insp", type: "task", lane: "qc", col: 2, name: "Инспекция по чек-листу", sub: "qc_checklist" },
        { id: "gDef", type: "gateway", lane: "qc", col: 3, name: "Дефекты?" },
        { id: "grade", type: "gateway", lane: "mgr", col: 4, name: "Уровень брака" },
        { id: "rework", type: "task", lane: "prod", col: 5, name: "Доработка" },
        { id: "reject", type: "task", lane: "mgr", col: 5, name: "Списание партии" },
        { id: "pass", type: "task", lane: "qc", col: 5, name: "Акт приёмки" },
        { id: "e", type: "end", lane: "qc", col: 6, name: "Партия принята" },
      ],
      flows: [
        { from: "s", to: "sample" },
        { from: "sample", to: "insp" },
        { from: "insp", to: "gDef" },
        { from: "gDef", to: "pass", label: "нет" },
        { from: "gDef", to: "grade", label: "да" },
        { from: "grade", to: "rework", label: "≤ 5%" },
        { from: "grade", to: "reject", label: "> 5%" },
        { from: "rework", to: "insp", label: "повтор" },
        { from: "pass", to: "e" },
      ],
    },
  ],
};
