// localStorage-backed cache for LLM-driven drift findings (Epic-007).
// Key format: `makeit_drift_cache:{repo}:{treeSha}:{ruleId}` — the treeSha
// component invalidates entries automatically when the repo's tree changes.

import type { HealthFinding } from "../types/health";

const KEY_PREFIX = "makeit_drift_cache";

function buildKey(repo: string, treeSha: string, ruleId: string): string {
  return `${KEY_PREFIX}:${repo}:${treeSha}:${ruleId}`;
}

/** Read a cached finding. Returns `null` on miss or corrupted entry. */
export function getCached(
  repo: string,
  treeSha: string,
  ruleId: string,
): HealthFinding | null {
  try {
    const raw = localStorage.getItem(buildKey(repo, treeSha, ruleId));
    if (raw == null) return null;
    return JSON.parse(raw) as HealthFinding;
  } catch {
    return null;
  }
}

/** Store a finding. Silently swallows quota/serialization errors — cache is best-effort. */
export function setCached(
  repo: string,
  treeSha: string,
  ruleId: string,
  finding: HealthFinding,
): void {
  try {
    localStorage.setItem(buildKey(repo, treeSha, ruleId), JSON.stringify(finding));
  } catch {
    // QuotaExceededError or serialization failure — cache writes are non-critical.
  }
}

/** Drop all cached entries for `repo` (any treeSha, any ruleId). */
export function clearCacheForRepo(repo: string): void {
  const prefix = `${KEY_PREFIX}:${repo}:`;
  // Collect keys first — removeItem during iteration shifts indices.
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // localStorage unavailable (private mode quirks) — nothing to clear.
  }
}
