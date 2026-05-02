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
  /** ISO date for the user-set start. Local-only (never sent to GitHub). */
  start?: string;
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
 * Drop expired due-date overrides. Called on read so stale overrides clean
 * themselves out without needing a background timer.
 */
function pruneExpired(map: OverrideMap): OverrideMap {
  const now = Date.now();
  let mutated = false;
  for (const [url, entry] of Object.entries(map)) {
    if (entry.dueExpiresAt !== undefined && entry.dueExpiresAt < now) {
      delete entry.dueOn;
      delete entry.dueExpiresAt;
      mutated = true;
      if (entry.start === undefined) {
        delete map[url];
      }
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
  } else {
    entry.start = start;
  }
  if (
    entry.start === undefined &&
    entry.dueOn === undefined &&
    entry.dueExpiresAt === undefined
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
