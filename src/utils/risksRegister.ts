import type {
  Risk,
  RiskProbability,
  RiskSeverity,
  RiskSource,
  RiskStatus,
} from "../types/hub";

/**
 * Shared risk-register read model over `docs/risks.yaml` (Epic-011
 * Task-03). The normalise/parse/sort helpers here are the single source
 * of truth for two consumers that MUST agree on row order:
 *  - `RiskRegisterTable` (DecisionsRisks tab) — the CRUD register, and
 *  - `useProjectHub` — the Overview "Риски — топ-3" card (#450), which
 *    must show exactly the first three rows the register renders.
 *
 * Previously each kept a private byte-faithful copy; editing one
 * silently desynced the Overview top-3 from the table (#467). Keep all
 * read-model logic in this module so the two can never drift again.
 */

export const RISKS_PATH = "docs/risks.yaml";

/** On-disk shape of `docs/risks.yaml`: `{ risks: Risk[] }`. */
export interface RisksFile {
  risks: Risk[];
}

export const SEVERITIES: RiskSeverity[] = ["low", "med", "high", "critical"];
export const PROBABILITIES: RiskProbability[] = ["low", "med", "high"];
export const STATUSES: RiskStatus[] = [
  "open",
  "mitigated",
  "accepted",
  "closed",
];
export const SOURCES: RiskSource[] = [
  "manual",
  "transcript-extracted",
  "audit-promoted",
];

/** Worst→best ordering so the default sort puts critical on top. */
export const SEVERITY_RANK: Record<RiskSeverity, number> = {
  critical: 3,
  high: 2,
  med: 1,
  low: 0,
};

/** Coerce an arbitrary yaml value to a valid member of `allowed`. */
export function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Strict `YYYY-MM-DD` calendar check for a risk `due`. `Date.parse`
 * rolls invalid days over (`2026-02-30` → Mar 2) and accepts loose
 * formats the `<input type="date">` can't render, so we require the
 * exact ISO shape AND a round-tripping UTC date.
 */
export function isIsoCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

/** Trim to a string, tolerating `null`/`number`/missing yaml values. */
export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Normalise one raw yaml row into a valid `Risk`. A hand-edited or
 * extractor-produced file can carry an invalid `severity`, a missing
 * `owner`, a numeric `due`, etc. — we never trust it, we repair it so
 * the table can't crash on bad input.
 */
export function normaliseRisk(raw: unknown, index: number): Risk {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id).trim() || `risk-${index + 1}`;
  const dueRaw = asString(r.due).trim();
  // Normalise `due` to either a real ISO `YYYY-MM-DD` or `null` at READ
  // time. A non-ISO value (e.g. "Q3") can't render in the `type="date"`
  // input — it would show blank and the first unrelated edit would
  // silently overwrite it with null. Coercing it to null here makes the
  // loss deterministic and visible (the row shows "—" immediately)
  // instead of a hidden data-loss path on the next edit.
  const due =
    dueRaw !== "" && isIsoCalendarDate(dueRaw) ? dueRaw : null;
  return {
    id,
    title: asString(r.title).trim(),
    severity: coerceEnum<RiskSeverity>(r.severity, SEVERITIES, "med"),
    probability: coerceEnum<RiskProbability>(
      r.probability,
      PROBABILITIES,
      "med",
    ),
    mitigation: asString(r.mitigation).trim(),
    owner: asString(r.owner).trim(),
    due,
    status: coerceEnum<RiskStatus>(r.status, STATUSES, "open"),
    source: coerceEnum<RiskSource>(r.source, SOURCES, "manual"),
  };
}

/** Pull a `Risk[]` out of whatever `readYaml` returned. */
export function parseRisksFile(data: unknown): Risk[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as RisksFile | null)?.risks)
      ? (data as RisksFile).risks
      : [];
  return list.map(normaliseRisk);
}

/** Stable severity-desc sort (tie-break by id) for deterministic rows. */
export function sortBySeverityDesc(risks: Risk[]): Risk[] {
  return [...risks].sort((a, b) => {
    const d = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}
