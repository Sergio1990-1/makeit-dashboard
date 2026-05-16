/**
 * usePortfolioRenewals — cross-project renewals fetch + cache layer for
 * the portfolio Renewals widget (Epic-010 Task-04, #346).
 *
 * Epic-011 Task-04 (#353) shipped the pure `scanRenewals(repo, yaml,
 * packageJson) → Renewal[]` merge layer plus the `github-contents` REST
 * wrapper, but no cross-repo hook. So this hook does the portfolio-wide
 * collection itself, exactly as the issue body describes — a `Promise.all`
 * fan-out over `PROJECTS` (config-driven, not a hardcoded repo list),
 * reading each repo's `docs/renewals.yaml` + `package.json` via
 * `readYaml` / `readMarkdown` and merging through `scanRenewals`.
 *
 * Failure model: per-repo `Promise.allSettled` + inner try/catch. One repo
 * 500ing / missing files / corrupt yaml degrades to "no renewals for that
 * repo", never a widget-wide crash. github-contents maps a missing file to
 * `null`, so the empty-state path is the common case for repos that
 * haven't adopted `docs/renewals.yaml` yet. A corrupt yaml DOES throw in
 * `readYaml`; we catch it per-repo and fall back to a `package.json`-only
 * scan rather than dropping the whole repo.
 *
 * Cache: sessionStorage `makeit_portfolio_renewals`, 1-hour TTL (renewals
 * are slow-moving data — SSL/domain/contract dates change on the order of
 * months; re-opening the surface inside the window does zero network I/O).
 * sessionStorage can be disabled (Safari private mode) or quota-full —
 * every access is guarded so the widget still works fetch-only then.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PROJECTS } from "../utils/config";
import { readMarkdown, readYaml } from "../utils/github-contents";
import { scanRenewals } from "../utils/renewalsScanner";
import type { Renewal } from "../types/hub";

/** sessionStorage key for the cached cross-repo snapshot. */
export const PORTFOLIO_RENEWALS_CACHE_KEY = "makeit_portfolio_renewals";

/**
 * Cache freshness window — 1 hour. Renewals are slow-moving (expiry dates
 * shift on the order of months, deprecated deps change per release), so a
 * generous TTL keeps the surface instant on re-open without going stale.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Repo-relative paths the scanner's two inputs live at. */
const RENEWALS_YAML_PATH = "docs/renewals.yaml";
const PACKAGE_JSON_PATH = "package.json";

/**
 * One renewal plus the repo + client it came from. The widget needs
 * `repo` for navigation and `client` for the display row; `Renewal`
 * itself carries neither.
 */
export interface PortfolioRenewal {
  repo: string;
  /** Display name of the owning client (from the project config). */
  client: string;
  type: Renewal["type"];
  name: string;
  /** ISO-8601 expiry date as captured, or `null` when undated. */
  expires_at: string | null;
  notes: string;
  source: Renewal["source"];
}

/** Envelope persisted in sessionStorage. */
interface CacheEnvelope {
  savedAt: number;
  items: PortfolioRenewal[];
}

export interface UsePortfolioRenewalsState {
  /** All renewals across the portfolio (unsorted; the widget sorts). */
  items: PortfolioRenewal[];
  /** True while the cross-repo fan-out is in flight (cold load only). */
  loading: boolean;
  /** User-facing error, or null. Set only when the whole fan-out threw. */
  error: string | null;
  /** Drop the cache and re-fetch all repos. */
  refresh: () => void;
}

/** Read a non-expired cached snapshot, or null. Never throws. */
function readCache(): PortfolioRenewal[] | null {
  if (typeof sessionStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PORTFOLIO_RENEWALS_CACHE_KEY);
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
function writeCache(items: PortfolioRenewal[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const env: CacheEnvelope = { savedAt: Date.now(), items };
    sessionStorage.setItem(
      PORTFOLIO_RENEWALS_CACHE_KEY,
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
    sessionStorage.removeItem(PORTFOLIO_RENEWALS_CACHE_KEY);
  } catch {
    // ignore — a disabled store has nothing to clear
  }
}

/**
 * Collect renewals for a single repo. Resolves to `[]` on any failure
 * (auth, network, parse) so one bad repo can't reject the portfolio-wide
 * `Promise.allSettled`.
 *
 * `readYaml` THROWS on a corrupt yaml (the Hub surfaces that as an error);
 * here we don't want one malformed file to blank a portfolio row, so we
 * catch it and still run the `package.json` auto-scan. `readMarkdown`
 * already returns `null` for a missing/oversized manifest.
 */
async function collectRepo(
  repo: string,
  client: string,
): Promise<PortfolioRenewal[]> {
  try {
    const [yamlRes, pkgRes] = await Promise.all([
      readYaml<unknown>(repo, RENEWALS_YAML_PATH).catch(() => null),
      readMarkdown(repo, PACKAGE_JSON_PATH).catch(() => null),
    ]);
    const merged = scanRenewals(
      repo,
      yamlRes?.data ?? null,
      pkgRes?.content ?? null,
    );
    return merged.map((r) => ({
      repo,
      client,
      type: r.type,
      name: r.name,
      expires_at: r.expires_at,
      notes: r.notes,
      source: r.source,
    }));
  } catch {
    return [];
  }
}

/**
 * Fan out across every configured project. `allSettled` so a single
 * rejecting repo (shouldn't happen — `collectRepo` swallows) still yields
 * the rest. Returns the flattened renewal list.
 */
async function collectAll(): Promise<PortfolioRenewal[]> {
  const results = await Promise.allSettled(
    PROJECTS.map((p) => collectRepo(p.repo, p.client)),
  );
  const out: PortfolioRenewal[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

export function usePortfolioRenewals(): UsePortfolioRenewalsState {
  // Read sessionStorage once (lazy initializer) — not on every render.
  // The result only seeds the initial state + mount effect.
  const [cached] = useState(readCache);

  const [items, setItems] = useState<PortfolioRenewal[]>(
    () => cached ?? [],
  );
  const [loading, setLoading] = useState<boolean>(cached === null);
  const [error, setError] = useState<string | null>(null);

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
        const collected = await collectAll();
        if (!mountedRef.current) return;
        setItems(collected);
        writeCache(collected);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(
          e instanceof Error
            ? e.message
            : "Не удалось загрузить обновления по портфелю.",
        );
      } finally {
        if (mountedRef.current) setLoading(false);
        inFlightRef.current = false;
      }
    })();
  }, []);

  // Cold load only — a fresh cache satisfies the first render with zero
  // network I/O (the issue's "re-open within 1h → no requests" rule).
  useEffect(() => {
    if (cached === null) load(false);
    // `cached` is read once at mount; `load` is stable. Intentionally a
    // mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  return { items, loading, error, refresh };
}
