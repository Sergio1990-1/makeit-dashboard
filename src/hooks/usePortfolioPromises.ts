/**
 * usePortfolioPromises — cross-project commitments fetch + cache layer for
 * the portfolio Promise Tracker widget (Epic-010 Task-03, #345).
 *
 * The issue's stated dependency ("commitments per-project hook from
 * Epic-011 #02") never shipped as a hook: #351 delivered only the pure
 * `extractCommitments(briefMd, yaml, now?)` merge layer plus the
 * `github-contents` REST wrapper. So this hook does the cross-repo
 * collection itself, exactly as the issue body describes — a `Promise.all`
 * fan-out over `PROJECTS` (config-driven, not hardcoded), reading each
 * repo's `BRIEF.md` + `docs/commitments.yaml` via `readMarkdown` /
 * `readYaml` and merging through `extractCommitments`.
 *
 * Failure model: per-repo `Promise.allSettled` + inner try/catch. One repo
 * 500ing / missing files / corrupt yaml degrades to "no commitments for
 * that repo", never a widget-wide crash. github-contents already maps a
 * missing file to `null`, so the empty-state path is the common case for
 * repos that haven't adopted commitments yet.
 *
 * Cache: sessionStorage `makeit_portfolio_promises`, 5-min TTL (commitments
 * change rarely; re-opening the surface inside the window does zero network
 * I/O). sessionStorage can be disabled (Safari private mode) or quota-full
 * — every access is guarded so the widget still works fetch-only then.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PROJECTS } from "../utils/config";
import {
  extractCommitments,
  type CommitmentsYaml,
} from "../utils/commitmentsExtractor";
import { readMarkdown, readYaml } from "../utils/github-contents";
import type { Commitment } from "../types/hub";

/** sessionStorage key for the cached cross-repo snapshot. */
export const PORTFOLIO_PROMISES_CACHE_KEY = "makeit_portfolio_promises";

/** Cache freshness window — commitments rarely change intra-session. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Repo-relative paths the extractor's two inputs live at. */
const BRIEF_PATH = "BRIEF.md";
const COMMITMENTS_YAML_PATH = "docs/commitments.yaml";

/**
 * One open commitment plus the repo it came from. The widget needs `repo`
 * for grouping/navigation; `Commitment` itself has no repo field.
 */
export interface PortfolioCommitment {
  repo: string;
  client: string;
  text: string;
  /** ISO-8601 due date as captured (may be "" / malformed → undated). */
  due: string;
  /** `open` or derived `overdue` — only `done` is filtered out upstream. */
  status: Commitment["status"];
}

/** Envelope persisted in sessionStorage. */
interface CacheEnvelope {
  savedAt: number;
  items: PortfolioCommitment[];
}

export interface UsePortfolioPromisesState {
  /** All OPEN commitments across the portfolio (unsorted; widget groups). */
  items: PortfolioCommitment[];
  /** True while the cross-repo fan-out is in flight (cold load only). */
  loading: boolean;
  /** User-facing error, or null. Set only when every repo failed. */
  error: string | null;
  /** True when the initial render was served from a fresh cache. */
  fromCache: boolean;
  /** Drop the cache and re-fetch all repos. */
  refresh: () => void;
}

/** Read a non-expired cached snapshot, or null. Never throws. */
function readCache(): PortfolioCommitment[] | null {
  if (typeof sessionStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PORTFOLIO_PROMISES_CACHE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const env = JSON.parse(raw) as CacheEnvelope;
    if (
      env === null ||
      typeof env !== "object" ||
      typeof env.savedAt !== "number" ||
      !Array.isArray(env.items)
    ) {
      return null;
    }
    if (Date.now() - env.savedAt > CACHE_TTL_MS) return null;
    return env.items;
  } catch {
    return null;
  }
}

/** Persist a snapshot. Best-effort — disabled storage / quota is non-fatal. */
function writeCache(items: PortfolioCommitment[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const env: CacheEnvelope = { savedAt: Date.now(), items };
    sessionStorage.setItem(
      PORTFOLIO_PROMISES_CACHE_KEY,
      JSON.stringify(env),
    );
  } catch {
    // QuotaExceededError / SecurityError (private mode): skip caching.
  }
}

/** Clear the cached snapshot so the next load goes to the network. */
function clearCache(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PORTFOLIO_PROMISES_CACHE_KEY);
  } catch {
    // ignore — a disabled store has nothing to clear
  }
}

/**
 * Collect OPEN commitments for a single repo. Resolves to `[]` on any
 * failure (auth, network, parse) so one bad repo can't reject the
 * portfolio-wide `Promise.allSettled`.
 */
async function collectRepo(
  repo: string,
  now: number,
): Promise<PortfolioCommitment[]> {
  try {
    const [brief, yaml] = await Promise.all([
      readMarkdown(repo, BRIEF_PATH).catch(() => null),
      readYaml<CommitmentsYaml>(repo, COMMITMENTS_YAML_PATH).catch(
        () => null,
      ),
    ]);
    const commitments = extractCommitments(
      brief?.content ?? null,
      yaml?.data ?? null,
      now,
    );
    // Persisted-open only. `extractCommitments` derives `overdue` from
    // `due < now` but keeps the original-open subset under that label,
    // so "open" here means open OR overdue (both are unresolved); `done`
    // is the only thing we drop.
    return commitments
      .filter((c) => c.status !== "done")
      .map((c) => ({
        repo,
        client: c.client,
        text: c.text,
        due: c.due,
        status: c.status,
      }));
  } catch {
    return [];
  }
}

/**
 * Fan out across every configured project. `allSettled` so a single
 * rejecting repo (shouldn't happen — `collectRepo` swallows) still yields
 * the rest. Returns the flattened open-commitment list.
 */
async function collectAll(now: number): Promise<PortfolioCommitment[]> {
  const results = await Promise.allSettled(
    PROJECTS.map((p) => collectRepo(p.repo, now)),
  );
  const out: PortfolioCommitment[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

export function usePortfolioPromises(): UsePortfolioPromisesState {
  // Read sessionStorage once (lazy initializer) — not on every render.
  // The result only seeds the initial state + mount effect.
  const [cached] = useState(readCache);

  const [items, setItems] = useState<PortfolioCommitment[]>(
    () => cached ?? [],
  );
  const [loading, setLoading] = useState<boolean>(cached === null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache] = useState<boolean>(cached !== null);

  // Guard a late state-set after unmount and a double-fire (Strict Mode
  // double-invoke / rapid refresh clicks).
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback((skipCache: boolean) => {
    if (inFlightRef.current) return;
    if (skipCache) clearCache();
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const collected = await collectAll(Date.now());
        if (!mountedRef.current) return;
        setItems(collected);
        writeCache(collected);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(
          e instanceof Error
            ? e.message
            : "Не удалось загрузить обещания по портфелю.",
        );
      } finally {
        if (mountedRef.current) setLoading(false);
        inFlightRef.current = false;
      }
    })();
  }, []);

  // Cold load only — a fresh cache satisfies the first render with zero
  // network I/O (the issue's "re-open within 5 min → no requests" rule).
  useEffect(() => {
    if (cached === null) load(false);
    // `cached` is read once at mount; `load` is stable. Intentionally a
    // mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  return { items, loading, error, fromCache, refresh };
}
