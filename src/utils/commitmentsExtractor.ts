/**
 * Commitments extractor (Epic-011 Task-02, FR-27, FR-31).
 *
 * Pure merge layer: takes a BRIEF.md string and the parsed contents of
 * `docs/commitments.yaml`, produces a deduplicated `Commitment[]`.
 *
 * Two sources are merged:
 *   1. **Brief** — bullet items under a `## Commitments` /
 *      `commitments:` heading in the project's BRIEF.md. Each bullet
 *      carries the promise text plus an optional inline date and an
 *      optional client (see `parseBriefBullet`).
 *   2. **Yaml** — `docs/commitments.yaml`, the CRUD-managed / synced
 *      copy. The dashboard's CRUD table writes here.
 *
 * Dedup key is `text + client` (case-insensitive, whitespace-folded).
 * On a collision the **yaml entry wins** — it is the editable,
 * authoritative copy; the BRIEF bullet is the original capture.
 *
 * `status` is normalised but `overdue` is never persisted — callers
 * derive it from `due < now` at render time (`isOverdue`).
 *
 * Pure: no I/O, no globals, deterministic for the same inputs.
 */

import type { Commitment } from "../types/hub";

/**
 * Persisted status as stored in yaml. `overdue` is intentionally NOT
 * here — it is a derived render-time state, never written to the file.
 */
export type CommitmentStatus = "open" | "done";

/**
 * Raw row shape as it appears inside `docs/commitments.yaml`. Every
 * field is treated as untrusted (`unknown`-ish) — a hand-edited yaml
 * can contain anything, so `extractCommitments` coerces defensively.
 */
export interface CommitmentYamlRow {
  text?: unknown;
  due?: unknown;
  client?: unknown;
  status?: unknown;
}

/**
 * Top-level yaml document. We accept either a bare list or an object
 * with a `commitments:` key so a hand-authored file can use whichever
 * is more natural; the CRUD writer always emits the object form.
 */
export type CommitmentsYaml =
  | CommitmentYamlRow[]
  | { commitments?: CommitmentYamlRow[] }
  | null
  | undefined;

/**
 * Match the Commitments section heading in a BRIEF.md. Accepts `##`
 * and `###`, optional leading emoji/punctuation, optional trailing
 * colon — mirrors the Decision Log extractor's heading guard so the
 * two parsers behave consistently. Standalone keyword only: `##
 * Commitments` matches, `## Past commitments review` does not.
 */
const COMMITMENT_HEADING_RE =
  /^#{2,3}[^\S\n]+[^\w\n]*\s*commitments?\s*[:.]?\s*$/im;

/**
 * Also accept a `commitments:` YAML-ish key as a section start (some
 * BRIEF.md producers emit a flat `commitments:` block rather than a
 * markdown heading). Anchored to start-of-line.
 */
const COMMITMENT_KEY_RE = /^commitments?\s*:\s*$/im;

/** Match the next heading (any level) — used to bound the section. */
const NEXT_HEADING_RE = /^#{1,6}\s+/m;

/** Match a single bullet line (`-`, `*`, or numbered). */
const BULLET_RE = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/gm;

/** ISO-ish date token (YYYY-MM-DD) anywhere in a bullet. */
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

/**
 * Strict calendar check for a `YYYY-MM-DD` token. `Date.parse` rolls
 * invalid days over (`2026-02-30` → 2026-03-02), so a BRIEF typo would
 * silently become a real-but-wrong due date. Reject anything whose
 * parsed UTC components don't round-trip to the captured string.
 */
function isRealCalendarDate(token: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Inline client annotation in a bullet, e.g.
 * `Deliver report (client: Acme)` or `… [client: Acme]`. Case- and
 * bracket-insensitive; captures the client name up to the closing
 * bracket. Kept narrow so prose colons don't get misread as clients.
 */
const CLIENT_RE = /[([]\s*client\s*:\s*([^)\]]+?)\s*[)\]]/i;

/**
 * Locate the Commitments section body inside a BRIEF.md. Returns the
 * raw text between the heading/key and the next heading (or EOF), or
 * `null` when no section exists.
 */
function findCommitmentsSection(briefMd: string): string | null {
  const headingMatch = briefMd.match(COMMITMENT_HEADING_RE);
  const keyMatch = briefMd.match(COMMITMENT_KEY_RE);
  // Prefer whichever appears first in the document so a stray later
  // mention can't shadow the real section.
  let match: RegExpMatchArray | null = null;
  if (headingMatch?.index !== undefined && keyMatch?.index !== undefined) {
    match = headingMatch.index <= keyMatch.index ? headingMatch : keyMatch;
  } else {
    match = headingMatch ?? keyMatch;
  }
  if (match === null || match.index === undefined) return null;

  const startIdx = match.index + match[0].length;
  const after = briefMd.slice(startIdx);
  const nextMatch = after.match(NEXT_HEADING_RE);
  return nextMatch && nextMatch.index !== undefined
    ? after.slice(0, nextMatch.index)
    : after;
}

/**
 * Parse one BRIEF bullet into `{ text, due, client }`.
 *
 * Recognised shapes (best-effort, order-independent within the line):
 *   - `Ship invoice — 2026-06-01 (client: Acme)`
 *   - `2026-06-01: Send report [client: Beta]`
 *   - `Follow up with Gamma` (no date, no client)
 *
 * The date and client annotations are stripped from the resulting
 * `text` so the table doesn't show the machine markers twice. An
 * unparseable date yields `due = ""` (caller treats it as undated,
 * never `overdue`).
 */
function parseBriefBullet(bullet: string): {
  text: string;
  due: string;
  client: string;
} {
  let rest = bullet;

  const clientM = rest.match(CLIENT_RE);
  const client = clientM ? clientM[1].trim() : "";
  if (clientM) rest = rest.replace(clientM[0], " ");

  const dateM = rest.match(DATE_RE);
  // Accept only real calendar dates; a rolled-over token (2026-02-30)
  // is treated as undated rather than a silently-shifted due date.
  const due = dateM && isRealCalendarDate(dateM[1]) ? dateM[1] : "";
  if (dateM) rest = rest.replace(dateM[0], " ");

  // Collapse leftover separators/whitespace produced by the strips
  // above (`— 2026-06-01` → `—`, dangling colons, double spaces).
  const text = rest
    .replace(/\s+/g, " ")
    .replace(/^[\s—\-:•]+|[\s—\-:•]+$/g, "")
    .trim();

  return { text, due, client };
}

/**
 * Field separator for composite dedup keys: U+001F (unit separator),
 * built via `String.fromCharCode` so the source stays plain ASCII — a
 * literal control byte here was the #393 regression that made git flag
 * this file binary. `norm` collapses every whitespace run to a single
 * space, so this char can never occur inside a normalised field; that
 * keeps the parts unambiguous, whereas a plain-space join would let
 * text "a b" / client "c" collide with text "a" / client "b c".
 */
const KEY_SEP = String.fromCharCode(31);

/** Fold text for the dedup key — lowercase + collapsed whitespace. */
function dedupKey(text: string, client: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(text)}${KEY_SEP}${norm(client)}`;
}

/**
 * Intra-BRIEF dedup key: the same text+client fold as `dedupKey` plus a
 * coarse `due` token so two promises to the same client with identical
 * text but DIFFERENT due dates are kept as distinct rows instead of the
 * first silently shadowing the second. The token is the trimmed/folded
 * `due` string (empty when undated) - deliberately coarse: it only has
 * to separate distinct dates, not validate them. BRIEF-vs-BRIEF only;
 * cross-BRIEF / yaml dedup still keys on `dedupKey` (text+client) so the
 * editable yaml row keeps replacing its originating BRIEF bullet even
 * after a due-date tweak (yaml stays the single authoritative copy).
 */
function intraBriefKey(text: string, client: string, due: string): string {
  const dueToken = due.trim().toLowerCase().replace(/\s+/g, " ");
  return `${dedupKey(text, client)}${KEY_SEP}${dueToken}`;
}

/**
 * Single owner of the "persisted status" invariant: collapse a
 * commitment's status to the on-disk union (`open` | `done`). The
 * derived `overdue` and any unexpected value become `open`; only an
 * explicit `done` survives. Idempotent. Both the extractor's yaml
 * serialiser and the CRUD table's pre-persist mapper call this so the
 * rule has exactly one definition and can't drift.
 */
export function persistedStatus(
  status: Commitment["status"],
): CommitmentStatus {
  return status === "done" ? "done" : "open";
}

/**
 * Coerce an untrusted yaml `status` to the persisted union. Anything
 * that isn't an explicit `done` falls back to `open` — a typo should
 * never silently mark a promise complete.
 */
function coerceStatus(raw: unknown): CommitmentStatus {
  return typeof raw === "string" && raw.trim().toLowerCase() === "done"
    ? "done"
    : "open";
}

/** Safe string coercion for untrusted yaml scalars. */
function coerceStr(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return "";
}

/** Pull the row array out of either supported yaml shape. */
function yamlRows(yaml: CommitmentsYaml): CommitmentYamlRow[] {
  if (Array.isArray(yaml)) return yaml;
  if (yaml && typeof yaml === "object" && Array.isArray(yaml.commitments)) {
    return yaml.commitments;
  }
  return [];
}

/**
 * True when a commitment's due date is in the past relative to `now`.
 * Done commitments are never overdue. Undated / malformed dates are
 * never overdue (we can't prove they're late). Exported because the
 * CRUD table needs the exact same rule for its row badges.
 */
export function isOverdue(
  c: Pick<Commitment, "due" | "status">,
  now: number = Date.now(),
): boolean {
  if (c.status === "done") return false;
  const t = Date.parse(c.due);
  if (Number.isNaN(t)) return false;
  return t < now;
}

/**
 * Apply the derived `overdue` status. Persisted status stays
 * `open` / `done`; this only affects the in-memory value the UI sees.
 */
function withDerivedStatus(c: Commitment, now: number): Commitment {
  if (c.status === "done") return c;
  return isOverdue(c, now) ? { ...c, status: "overdue" } : c;
}

/**
 * Merge BRIEF.md commitments with `docs/commitments.yaml`.
 *
 * Algorithm:
 *   1. Parse BRIEF bullets → provisional commitments (status `open`),
 *      deduped intra-BRIEF by `text+client+due` so two promises to the
 *      same client with the same text but DIFFERENT due dates are both
 *      kept (the first no longer silently shadows the second).
 *   2. Walk yaml rows; for a `text+client` collision the yaml row
 *      REPLACES the BRIEF entry (yaml is the editable source of truth —
 *      and if several different-due BRIEF bullets share that text+client
 *      the single authoritative yaml row supersedes all of them, exactly
 *      as before), for a new key the yaml row is appended.
 *   3. Derive `overdue` from `due < now` (never persisted).
 *   4. Sort: overdue → open (by `due` asc) → done (by `due` asc),
 *      undated last within each group. Stable for equal keys.
 *
 * Both inputs are optional; passing `null`/`undefined` for either is
 * the documented empty state (no BRIEF section / no yaml file).
 */
export function extractCommitments(
  briefMd: string | null | undefined,
  yaml: CommitmentsYaml,
  now: number = Date.now(),
): Commitment[] {
  // Stage 1 — BRIEF bullets, deduped intra-BRIEF by `text+client+due`
  // (insertion-ordered). Keying on the coarse due token means two
  // promises to the same client with identical text but different dates
  // are BOTH kept; an exact text+client+due repeat still collapses.
  const briefByIntraKey = new Map<string, Commitment>();

  if (typeof briefMd === "string" && briefMd.length > 0) {
    const section = findCommitmentsSection(briefMd);
    if (section !== null) {
      BULLET_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BULLET_RE.exec(section)) !== null) {
        const { text, due, client } = parseBriefBullet(m[1].trim());
        if (text.length === 0) continue;
        const key = intraBriefKey(text, client, due);
        // First bullet wins on an exact intra-BRIEF dupe — keep order.
        if (!briefByIntraKey.has(key)) {
          briefByIntraKey.set(key, { text, due, client, status: "open" });
        }
      }
    }
  }

  // Stage 2 — fold in yaml. Group the deduped BRIEF rows by the
  // cross-source key (`text+client`, unchanged). A yaml row for a given
  // text+client is the single editable source of truth: it REPLACES the
  // whole BRIEF group for that text+client (same "yaml wins on
  // text+client" rule as before — it just now supersedes the possibly
  // several different-due BRIEF captures with the one authoritative yaml
  // copy). A yaml row with a new text+client is appended. Output order:
  // first BRIEF appearance of each text+client, then brand-new yaml rows
  // — identical to the previous single-map insertion order.
  const groups = new Map<string, Commitment[]>();
  for (const c of briefByIntraKey.values()) {
    const k = dedupKey(c.text, c.client);
    const g = groups.get(k);
    if (g === undefined) groups.set(k, [c]);
    else g.push(c);
  }

  for (const row of yamlRows(yaml)) {
    if (row === null || typeof row !== "object") continue;
    const text = coerceStr(row.text);
    if (text.length === 0) continue; // a textless row is unusable
    const client = coerceStr(row.client);
    const commitment: Commitment = {
      text,
      due: coerceStr(row.due),
      client,
      status: coerceStatus(row.status),
    };
    // yaml wins: collapse the entire BRIEF group for this text+client to
    // the single authoritative yaml row (keeps the original insertion
    // slot when the group already existed, else appends a new group).
    groups.set(dedupKey(text, client), [commitment]);
  }

  const out: Commitment[] = [];
  for (const g of groups.values()) {
    for (const c of g) out.push(withDerivedStatus(c, now));
  }

  const rank = (s: Commitment["status"]) =>
    s === "overdue" ? 0 : s === "open" ? 1 : 2;

  out.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    const ad = Date.parse(a.due);
    const bd = Date.parse(b.due);
    const aValid = !Number.isNaN(ad);
    const bValid = !Number.isNaN(bd);
    if (aValid && bValid) return ad - bd;
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });

  return out;
}

/**
 * Serialise commitments back to the yaml document shape the CRUD
 * writer persists. The derived `overdue` status is downgraded to
 * `open` so it never leaks into the file (FR-31: only open/done are
 * persisted). Pure — no I/O.
 */
export function toCommitmentsYaml(commitments: Commitment[]): {
  commitments: { text: string; due: string; client: string; status: CommitmentStatus }[];
} {
  return {
    commitments: commitments.map((c) => ({
      text: c.text,
      due: c.due,
      client: c.client,
      status: persistedStatus(c.status),
    })),
  };
}
