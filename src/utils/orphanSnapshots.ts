const STORAGE_KEY = "makeit_orphan_snapshots_v1";
const MAX_DAYS = 30;
const DAY_MS = 86_400_000;

type SnapshotStore = Record<string, number>; // "YYYY-MM-DD" -> orphan count

function utcDateKey(msOrNow?: number): string {
  const d = msOrNow !== undefined ? new Date(msOrNow) : new Date();
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function pruned(store: SnapshotStore): SnapshotStore {
  const cutoff = Date.now() - MAX_DAYS * DAY_MS;
  return Object.fromEntries(
    Object.entries(store).filter(([key]) => new Date(key).getTime() >= cutoff),
  );
}

/** Save today's orphan-issue count. Prunes entries older than 30 days automatically. */
export function recordSnapshot(count: number): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const store: SnapshotStore = raw ? JSON.parse(raw) : {};
    store[utcDateKey()] = count;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned(store)));
  } catch {
    // localStorage unavailable (private mode / storage full) — silently skip
  }
}

/**
 * Returns stored snapshots as a Map keyed by "YYYY-MM-DD" (UTC).
 * Expired entries are pruned on read so the store never grows beyond 30 rows.
 */
export function getSnapshots(): Map<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(pruned(JSON.parse(raw) as SnapshotStore)));
  } catch {
    return new Map();
  }
}
