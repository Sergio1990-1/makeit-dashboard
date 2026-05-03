import type { Milestone } from "../types";

/**
 * Editable-milestone helpers. Two concerns:
 *  1. Push due-date changes to GitHub (REST PATCH) and prod the cache backend.
 *  2. Persist user-set overrides locally so the UI reflects the edit instantly,
 *     even before the cache catches up. `start` is local-only (GitHub has no
 *     start date — our Gantt computes it heuristically), `dueOn` is mirrored to
 *     GitHub but kept locally too as a transient optimistic value.
 */

const GITHUB_REST = "https://api.github.com";
const OVERRIDE_KEY = "makeit.milestoneOverrides.v1";
const DUE_OVERRIDE_TTL_MS = 30 * 60 * 1000; // 30 min — long enough for a sync cycle
const START_OVERRIDE_TTL_MS = 30 * 60 * 1000;

// HTML comment marker in milestone descriptions — invisible in GitHub's
// rendered Markdown, but parseable for cross-device sync of start dates.
// GitHub has no native start field on milestones, so we tunnel it here.
const START_TAG_RE = /<!--\s*makeit-start:\s*(\d{4}-\d{2}-\d{2})\s*-->/i;

/** Read the embedded start date (YYYY-MM-DD) from a milestone description, or null if absent. */
export function parseStartFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = START_TAG_RE.exec(description);
  return m ? m[1] : null;
}

/**
 * Embed (or replace, or remove) the start-date marker in a description string.
 * - `start` is "YYYY-MM-DD" → marker added/updated
 * - `start` is null → marker stripped, leaving the rest of the description intact
 * Returns the new description string.
 */
export function injectStartIntoDescription(
  description: string | null | undefined,
  start: string | null,
): string {
  const base = (description ?? "").replace(START_TAG_RE, "").trimEnd();
  if (!start) return base;
  // Append on a fresh line so the human-readable description above stays clean.
  return base ? `${base}\n\n<!-- makeit-start: ${start} -->` : `<!-- makeit-start: ${start} -->`;
}

export interface MilestoneRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parse `https://github.com/<owner>/<repo>/milestone/<number>` into parts.
 * Returns null for malformed URLs so callers can no-op safely.
 */
export function parseMilestoneUrl(url: string): MilestoneRef | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // expected: [owner, repo, "milestone", number]
    const idx = parts.indexOf("milestone");
    if (idx < 1 || idx >= parts.length - 1) return null;
    const owner = parts[0];
    const repo = parts[1];
    const number = parseInt(parts[idx + 1], 10);
    if (!owner || !repo || !Number.isFinite(number)) return null;
    return { owner, repo, number };
  } catch {
    return null;
  }
}

/**
 * PATCH the milestone on GitHub. Returns the updated milestone payload, or
 * null on any failure (network, 4xx, 5xx). Caller decides whether to surface
 * the error to the user.
 */
export async function patchMilestoneDueOn(
  token: string,
  ref: MilestoneRef,
  dueOn: string | null,
): Promise<unknown | null> {
  try {
    const res = await fetch(
      `${GITHUB_REST}/repos/${ref.owner}/${ref.repo}/milestones/${ref.number}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        // GitHub accepts `null` to clear the due date.
        body: JSON.stringify({ due_on: dueOn }),
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * PATCH the milestone description on GitHub. Used to tunnel the start date
 * via an HTML comment marker — see injectStartIntoDescription().
 */
export async function patchMilestoneDescription(
  token: string,
  ref: MilestoneRef,
  description: string,
): Promise<unknown | null> {
  try {
    const res = await fetch(
      `${GITHUB_REST}/repos/${ref.owner}/${ref.repo}/milestones/${ref.number}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Best-effort: nudge the makeit-cache backend to refresh from GitHub. Fire and
 * forget — we never block the UI on this. The backend's full sync is heavy
 * (~30s); we trigger it but don't await completion.
 */
export function triggerCacheSync(): void {
  const cacheUrl = (window as unknown as { __MAKEIT_CONFIG__?: { CACHE_URL?: string } })
    .__MAKEIT_CONFIG__?.CACHE_URL;
  if (!cacheUrl) return;
  void fetch(`${cacheUrl}/api/sync`, {
    method: "POST",
    signal: AbortSignal.timeout(2000),
  }).catch(() => undefined);
}

// ────────────────────────────────────────────────────────────────────────────
// Local override store
// ────────────────────────────────────────────────────────────────────────────

interface OverrideEntry {
  /** ISO date for due_on; null means "explicitly cleared". undefined = no override. */
  dueOn?: string | null;
  /** When the dueOn override should self-expire (server is the source of truth). */
  dueExpiresAt?: number;
  /** YYYY-MM-DD optimistic start. The authoritative copy lives in the milestone
   *  description as a `<!-- makeit-start: ... -->` tag; this entry is just a
   *  short-lived optimistic value for instant UI feedback before the next
   *  cache sync pulls the updated description back. */
  start?: string;
  startExpiresAt?: number;
}

type OverrideMap = Record<string, OverrideEntry>;

function readAll(): OverrideMap {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as OverrideMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: OverrideMap): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded — ignore, the UI will just lose the optimistic value */
  }
}

/**
 * Drop expired overrides on read so stale optimistic values clean themselves
 * out without needing a background timer. Both due and start overrides have
 * their own TTL.
 */
function pruneExpired(map: OverrideMap): OverrideMap {
  const now = Date.now();
  let mutated = false;
  for (const [url, entry] of Object.entries(map)) {
    if (entry.dueExpiresAt !== undefined && entry.dueExpiresAt < now) {
      delete entry.dueOn;
      delete entry.dueExpiresAt;
      mutated = true;
    }
    if (entry.startExpiresAt !== undefined && entry.startExpiresAt < now) {
      delete entry.start;
      delete entry.startExpiresAt;
      mutated = true;
    }
    if (
      entry.start === undefined &&
      entry.dueOn === undefined &&
      entry.dueExpiresAt === undefined &&
      entry.startExpiresAt === undefined
    ) {
      delete map[url];
    }
  }
  if (mutated) writeAll(map);
  return map;
}

export function getMilestoneOverrides(): OverrideMap {
  return pruneExpired(readAll());
}

export function setDueOverride(url: string, dueOn: string | null): void {
  const map = readAll();
  const entry = map[url] ?? {};
  entry.dueOn = dueOn;
  entry.dueExpiresAt = Date.now() + DUE_OVERRIDE_TTL_MS;
  map[url] = entry;
  writeAll(map);
}

export function setStartOverride(url: string, start: string | null): void {
  const map = readAll();
  const entry = map[url] ?? {};
  if (start === null) {
    delete entry.start;
    delete entry.startExpiresAt;
  } else {
    entry.start = start;
    entry.startExpiresAt = Date.now() + START_OVERRIDE_TTL_MS;
  }
  if (
    entry.start === undefined &&
    entry.dueOn === undefined &&
    entry.dueExpiresAt === undefined &&
    entry.startExpiresAt === undefined
  ) {
    delete map[url];
  } else {
    map[url] = entry;
  }
  writeAll(map);
}

export function clearDueOverride(url: string): void {
  const map = readAll();
  const entry = map[url];
  if (!entry) return;
  delete entry.dueOn;
  delete entry.dueExpiresAt;
  if (entry.start === undefined) delete map[url];
  else map[url] = entry;
  writeAll(map);
}

/**
 * Apply local overrides to a milestone array — used by the view layer so all
 * downstream renderers (Gantt, Hero, popup) see the same effective due dates.
 * Only `dueOn` is mirrored back to the milestone; `start` overrides are read
 * separately by the Gantt.
 */
export function applyDueOverrides(milestones: Milestone[]): Milestone[] {
  const overrides = getMilestoneOverrides();
  if (Object.keys(overrides).length === 0) return milestones;
  return milestones.map((m) => {
    const o = overrides[m.url];
    if (!o || o.dueOn === undefined) return m;
    return { ...m, dueOn: o.dueOn };
  });
}

export function getStartOverride(url: string): string | undefined {
  const map = getMilestoneOverrides();
  return map[url]?.start;
}

/**
 * Resolve the effective start date for a milestone.
 *  1. Local optimistic override (very recent edit, not yet in cache) wins.
 *  2. Description tag (`<!-- makeit-start: ... -->`) — shared via GitHub.
 *  3. null → caller falls back to its heuristic.
 */
export function getEffectiveStart(milestone: Milestone): string | null {
  const opt = getStartOverride(milestone.url);
  if (opt) return opt;
  return parseStartFromDescription(milestone.description);
}

/**
 * High-level: persist a start-date change. Patches the milestone description
 * on GitHub (so other devices see it) and writes a short-lived optimistic
 * value locally so the current UI reflects the change instantly.
 *
 * Returns true on success, false if the GitHub PATCH failed (caller decides
 * how to surface the error). The local override is only written on success.
 */
export async function commitStartChange(
  token: string,
  milestone: Milestone,
  start: string | null,
): Promise<boolean> {
  const ref = parseMilestoneUrl(milestone.url);
  if (!ref) return false;
  const newDescription = injectStartIntoDescription(milestone.description, start);
  const result = await patchMilestoneDescription(token, ref, newDescription);
  if (!result) return false;
  setStartOverride(milestone.url, start);
  return true;
}
