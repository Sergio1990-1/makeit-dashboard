// Shared primitives for portfolio-wide scanners (health, orphans, future
// insights panels). Extracted from the duplicated bodies of usePortfolioHealth
// and usePortfolioOrphans — see issue #170.

// 30 minutes — long enough to feel "free" on tab re-open, short enough that
// a missing finding gets re-evaluated within the working hour.
export const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;

// 3 parallel scans. Each repo touches ~1-50 GitHub calls internally; 3
// concurrent kept us under the secondary rate-limit threshold in testing.
// Bumping this requires re-validating against secondary limits.
export const DEFAULT_SCAN_CONCURRENCY = 3;

// Defer the very first scan a bit so the rest of the dashboard finishes its
// own GraphQL warm-up before we hammer the REST API. Also keeps the initial
// render snappy.
export const DEFAULT_INITIAL_DELAY_MS = 1500;

// Bounded-concurrency runner. Mapper is called eagerly with `index`, so the
// caller can stash partial results in a fixed slot if needed; here we just
// collect them into an array preserving input order. Caller is responsible
// for try/catch inside the mapper if they want per-item error isolation —
// an unhandled rejection here will short-circuit the whole batch.
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Persisted-cache envelope. `generated_at` is the ISO timestamp of the write
// and is also re-used as `lastUpdated` in the hook state so the UI can show
// "обновлено N минут назад".
export interface PortfolioCacheEntry<T> {
  generated_at: string;
  payload: T;
}

export interface PortfolioCache<T> {
  // Returns the cached entry if present and parseable. Returns null on miss,
  // malformed JSON, missing fields, or storage exceptions. Freshness is the
  // caller's responsibility — see `isCacheFresh`.
  read(): PortfolioCacheEntry<T> | null;
  // Persists the payload with a fresh timestamp. Returns the timestamp it
  // wrote (callers use it for `lastUpdated`). Quota-exceeded / serialization
  // errors are swallowed — the next refresh will retry — and in that case the
  // returned timestamp is still valid (the in-memory state still gets the
  // current moment).
  write(payload: T): string;
  // Clears the cache. Used by the manual "Refresh" path to force a re-scan.
  clear(): void;
}

// Factory for a typed localStorage-backed cache. The key namespaces the
// payload; bump the suffix in the cache key when the payload shape changes
// incompatibly.
export function createPortfolioCache<T>(key: string): PortfolioCache<T> {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PortfolioCacheEntry<T>;
        // Minimal shape check — turns "Cannot read properties of undefined"
        // crashes into a clean cache miss after a manual edit / version skew.
        if (!parsed || typeof parsed !== "object") return null;
        if (typeof parsed.generated_at !== "string" || !parsed.generated_at) return null;
        if (!("payload" in parsed)) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    write(payload: T) {
      const generatedAt = new Date().toISOString();
      try {
        const entry: PortfolioCacheEntry<T> = { generated_at: generatedAt, payload };
        localStorage.setItem(key, JSON.stringify(entry));
      } catch (err) {
        // Quota exceeded / serialization error — drop silently in production:
        // the next refresh will retry and the in-memory state already has the
        // data. In DEV we log so a developer notices when the cache budget is
        // chronically exceeded (issue #165).
        if (import.meta.env.DEV) {
          console.warn(`[portfolio-scan] localStorage write failed for "${key}":`, err);
        }
      }
      return generatedAt;
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore — read() will treat any malformed entry as a miss anyway.
      }
    },
  };
}

// Freshness check for a cache entry. Defends against a clock skew or hand-
// edited timestamp by requiring a finite, non-negative age.
export function isCacheFresh<T>(entry: PortfolioCacheEntry<T>, ttlMs: number): boolean {
  const age = Date.now() - new Date(entry.generated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < ttlMs;
}
