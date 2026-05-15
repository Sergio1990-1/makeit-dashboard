/**
 * Renewals scanner (Epic-011 Task-04, FR-32).
 *
 * Pure merge of two sources into one `Renewal[]`:
 *   1. Manual entries from `docs/renewals.yaml` (`source: "manual"`),
 *      CRUD-editable, persisted back via the Contents API.
 *   2. Virtual entries auto-derived from a project's `package.json`
 *      dependencies (`source: "auto-scan"`) — flagged here by a static
 *      deprecation heuristic, NEVER written back to the yaml.
 *
 * Deliberately offline: there is no `npm audit` / registry call. The
 * dashboard is browser-side and a per-render network fan-out to the npm
 * registry would be slow, rate-limited and CORS-blocked. Instead we
 * mark a dependency as a renewal candidate from a small static list of
 * well-known deprecated/EOL packages plus the universally-deprecated
 * `request` family. This is intentionally conservative: a false
 * negative (a deprecated dep we don't flag) is acceptable, a false
 * positive (nagging about a healthy dep) is not.
 *
 * Everything in this module is a pure function — no I/O, no `Date.now()`
 * coupling — so it's trivially testable and safe to call from render.
 */

import type { Renewal, RenewalSource, RenewalType } from "../types/hub";

const RENEWAL_TYPES: readonly RenewalType[] = [
  "ssl",
  "domain",
  "contract",
  "license",
  "dep",
];

/**
 * Static list of npm package names that are well-known deprecated or
 * end-of-life. Lower-cased exact matches only — we never guess from a
 * substring (`request` must not also flag `request-promise` unless it
 * is itself listed). Kept small and high-signal on purpose.
 */
const DEPRECATED_PACKAGES: ReadonlySet<string> = new Set([
  "request",
  "request-promise",
  "request-promise-native",
  "left-pad",
  "tslint",
  "node-sass",
  "babel-eslint",
  "@hapi/joi",
  "circular-json",
  "gulp-util",
  "istanbul",
  "phantomjs",
  "phantomjs-prebuilt",
  "har-validator",
]);

/** Coerce an arbitrary yaml value to a valid `RenewalType`. */
function coerceType(value: unknown): RenewalType {
  return typeof value === "string" &&
    (RENEWAL_TYPES as readonly string[]).includes(value)
    ? (value as RenewalType)
    : "dep";
}

/** Trim to string, tolerating null/number/boolean yaml scalars. */
function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Normalise `expires_at`: keep a non-empty string verbatim (display
 * layer decides if it's a valid date — we don't silently drop a
 * malformed value the user typed), map empty/missing to `null`.
 */
function normaliseExpiry(value: unknown): string | null {
  const s = asString(value).trim();
  return s === "" ? null : s;
}

/**
 * Normalise one raw yaml row into a valid manual `Renewal`. A
 * hand-edited file can carry a bad `type`, a numeric `expires_at`, a
 * missing `name`, etc. — we repair rather than trust so the table and
 * scanner can't crash on bad input. `source` is forced to `"manual"`:
 * the yaml is, by definition, the manual store; an auto-scan value
 * sneaking into the file must never be treated as virtual.
 */
function normaliseManual(raw: unknown): Renewal {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    type: coerceType(r.type),
    name: asString(r.name).trim(),
    expires_at: normaliseExpiry(r.expires_at),
    notes: asString(r.notes).trim(),
    source: "manual" as RenewalSource,
  };
}

/**
 * Pull a manual `Renewal[]` out of whatever `readYaml` returned.
 * Accepts both `{ renewals: [...] }` (the documented schema) and a
 * bare top-level array (a hand-rolled file). Anything else → `[]`.
 */
export function parseRenewalsYaml(data: unknown): Renewal[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { renewals?: unknown[] } | null)?.renewals)
      ? ((data as { renewals: unknown[] }).renewals)
      : [];
  return list.map(normaliseManual);
}

/** On-disk shape of `docs/renewals.yaml`. */
export interface RenewalsYaml {
  renewals: Renewal[];
}

/** Strip any derived/virtual rows and wrap manual ones for writing. */
export function toRenewalsYaml(renewals: Renewal[]): RenewalsYaml {
  return {
    renewals: renewals
      .filter((r) => r.source === "manual")
      .map((r) => ({
        type: r.type,
        name: r.name,
        expires_at: r.expires_at,
        notes: r.notes,
        source: "manual" as RenewalSource,
      })),
  };
}

/** Minimal shape we read out of a parsed `package.json`. */
interface PackageJsonShape {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

/**
 * Parse raw `package.json` text and return the names of dependencies
 * that match the static deprecated list. Never throws — malformed
 * JSON yields `[]` (a project without a parseable manifest simply has
 * no auto-scan rows; that is not an error worth surfacing).
 */
function findDeprecatedDeps(packageJson: string | null): string[] {
  if (!packageJson) return [];
  let parsed: PackageJsonShape;
  try {
    parsed = JSON.parse(packageJson) as PackageJsonShape;
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const names = new Set<string>();
  for (const bucket of [
    parsed.dependencies,
    parsed.devDependencies,
    parsed.optionalDependencies,
    parsed.peerDependencies,
  ]) {
    if (bucket && typeof bucket === "object") {
      for (const name of Object.keys(bucket)) {
        if (DEPRECATED_PACKAGES.has(name.toLowerCase())) names.add(name);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Build virtual auto-scan `Renewal`s from `package.json`. `expires_at`
 * is `null` (a deprecated dep has no calendar date — the urgency is
 * "fix whenever", surfaced as a renewal so it stays visible).
 */
function scanDeprecatedDeps(packageJson: string | null): Renewal[] {
  return findDeprecatedDeps(packageJson).map((name) => ({
    type: "dep" as RenewalType,
    name,
    expires_at: null,
    notes: "Deprecated/EOL dependency — replace in package.json",
    source: "auto-scan" as RenewalSource,
  }));
}

/**
 * Stable identity for dedup: a manual row hides an auto-scan row for
 * the same dependency (the human note wins). Keyed by `type + name`
 * lower-cased so `dep:Moment` and `dep:moment` collapse.
 */
function dedupKey(r: Renewal): string {
  return `${r.type}::${r.name.trim().toLowerCase()}`;
}

/**
 * Merge manual yaml entries with virtual auto-scan dep entries into a
 * single `Renewal[]`.
 *
 * Pure: no network, no clock. `yamlData` is the already-parsed
 * `readYaml` payload (or `null` when the file doesn't exist);
 * `packageJson` is raw manifest text (or `null` when absent).
 *
 * Dedup rule: a manual entry always wins over an auto-scan entry with
 * the same `type + name` — if the user has written a note about a
 * deprecated dep, we don't also nag with the generic auto row. Manual
 * entries keep their yaml order; non-shadowed auto-scan rows are
 * appended after. Sorting by `expires_at` is the table's concern, not
 * the scanner's (kept here as raw merged data).
 *
 * @param _repo  Accepted for signature stability with the task spec
 *               (callers pass the repo); the merge itself needs no I/O.
 */
export function scanRenewals(
  _repo: string,
  yamlData: unknown,
  packageJson: string | null,
): Renewal[] {
  const manual = parseRenewalsYaml(yamlData);
  const manualKeys = new Set(manual.map(dedupKey));
  const auto = scanDeprecatedDeps(packageJson).filter(
    (r) => !manualKeys.has(dedupKey(r)),
  );
  return [...manual, ...auto];
}

/**
 * Sort by `expires_at` ascending (soonest expiry first); rows with no
 * date (`null` — typically auto-scan deps) sink to the bottom. An
 * unparseable date string is treated as "no date" so a typo can't jump
 * a row to the top. Stable tie-break by name keeps render order
 * deterministic across reloads.
 */
export function sortByExpiry(renewals: Renewal[]): Renewal[] {
  return [...renewals].sort((a, b) => {
    const ta = a.expires_at ? Date.parse(a.expires_at) : NaN;
    const tb = b.expires_at ? Date.parse(b.expires_at) : NaN;
    const aHas = !Number.isNaN(ta);
    const bHas = !Number.isNaN(tb);
    if (aHas && bHas) {
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
    }
    if (aHas) return -1;
    if (bHas) return 1;
    return a.name.localeCompare(b.name);
  });
}
