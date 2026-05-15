// Per-device "when did the user last open Activity for this repo" tracking.
//
// Backed by `sessionStorage` *by design* (PRD-008 FR-43, Epic-011 §lastVisitedStore):
// a reload keeps the value (same session), but closing the tab drops it — a
// fresh session intentionally means "everything is fresh again", so the inbox
// badge does not flood after a real return visit.
//
// Per-device, never synced: opening the Hub on two machines yields two
// independent unread counters. All storage access is defensive — Safari
// private mode / disabled storage / quota errors degrade to "no data"
// (null / no-op) rather than throwing into React render.

import type { PulseEvent } from "../types/hub";

/** sessionStorage key prefix; the repo name is appended verbatim. */
const KEY_PREFIX = "makeit_hub_last_visited:";

/**
 * ISO-8601 timestamp of the last Activity visit for `repo`, or `null` when
 * the repo has not been visited this session (or storage is unavailable).
 * Never throws.
 */
export function getLastVisited(repo: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(KEY_PREFIX + repo);
  } catch {
    // SecurityError (private mode) / disabled storage: treat as never visited.
    return null;
  }
}

/**
 * Record "Activity for `repo` was just opened" as the current time (ISO).
 * Best-effort — a disabled or full store is non-fatal (the badge simply
 * keeps showing its count; nothing breaks).
 */
export function markVisited(repo: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY_PREFIX + repo, new Date().toISOString());
  } catch {
    // QuotaExceededError / SecurityError (private mode): skip silently.
  }
}

/**
 * Number of `events` newer than the last recorded visit for `repo`.
 *
 * When the repo has never been visited this session (`getLastVisited` is
 * `null`) this returns `0`, NOT `events.length` — the first open must not
 * flood the badge with the project's entire history.
 *
 * Comparison is on ISO-8601 timestamps parsed to epoch millis; events whose
 * `timestamp` is missing or unparseable are not counted (cannot prove they
 * are newer than the visit).
 */
export function unreadCount(events: PulseEvent[], repo: string): number {
  const lastVisited = getLastVisited(repo);
  if (lastVisited === null) return 0;
  const lastVisitedMs = Date.parse(lastVisited);
  if (Number.isNaN(lastVisitedMs)) return 0;
  let count = 0;
  for (const event of events) {
    const eventMs = Date.parse(event.timestamp);
    if (!Number.isNaN(eventMs) && eventMs > lastVisitedMs) count += 1;
  }
  return count;
}
