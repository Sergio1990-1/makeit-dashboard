/**
 * Pipeline settings API client (Epic-004 Task-03).
 *
 * Wraps the makeit-pipeline `/settings` endpoints (Bearer-auth) so the
 * dashboard can read/write a single, server-side, cross-device source of
 * truth for secrets (github_token, anthropic_api_key, betterstack_token,
 * etc.). Existing token consumers are NOT touched in this task — that is
 * Task-04. Migration of legacy `localStorage` values is Task-05.
 *
 * Design notes:
 *  - Bootstrap token lives in `localStorage` under `pipeline_settings_token`.
 *    It is the only secret the dashboard still stores client-side; everything
 *    else is fetched on demand from the pipeline.
 *  - In-memory cache (`Map`) is module-scoped so a single page session pays
 *    for `loadAllSettings()` once. Cleared on 401 or `clearBootstrapToken()`.
 *  - 401 → server has rejected the bootstrap token → we drop it locally and
 *    surface `SettingsAuthError` so callers can re-prompt the user. NEVER
 *    drop the token on 5xx/network — those are transient and a retry must
 *    work without re-asking for the secret.
 */

import { PIPELINE_BASE_URL } from "./config";

const BOOTSTRAP_TOKEN_KEY = "pipeline_settings_token";

/**
 * Fired when a Pipeline request returns 401/403 mid-session — the bootstrap
 * token has been rejected by the server. `useSettings()` listens for this and
 * transitions the app back into the bootstrap UI so consumers calling sync
 * `getSetting()` aren't stuck reading `null` mid-render.
 *
 * Use a global window event (rather than a React-side pub/sub) so this works
 * from utils that aren't part of the component tree, with zero prop-drilling.
 */
export const SETTINGS_AUTH_LOST_EVENT = "settings:auth-lost";

/** 401 from the pipeline — bootstrap token is missing or invalid. */
export class SettingsAuthError extends Error {
  constructor(message = "Pipeline settings: unauthorized") {
    super(message);
    this.name = "SettingsAuthError";
  }
}

/** 5xx / network failure — pipeline is unreachable, transient. */
export class SettingsUnavailableError extends Error {
  constructor(message = "Pipeline settings: unavailable") {
    super(message);
    this.name = "SettingsUnavailableError";
  }
}

/* ────────────────────────────────────────
   Bootstrap token (localStorage)
   ──────────────────────────────────────── */

export function getBootstrapToken(): string | null {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_TOKEN_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export class SettingsStorageError extends Error {
  constructor() {
    super("Браузер блокирует localStorage (приватный режим / отключённое хранилище)");
    this.name = "SettingsStorageError";
  }
}

export function setBootstrapToken(token: string): void {
  try {
    localStorage.setItem(BOOTSTRAP_TOKEN_KEY, token.trim());
  } catch {
    // Storage may be disabled (private mode, quota). Surface a distinct error
    // so the bootstrap form can show a helpful message instead of the misleading
    // "token rejected" path that fires when the very next request reads back null.
    throw new SettingsStorageError();
  }
}

export function clearBootstrapToken(): void {
  try {
    localStorage.removeItem(BOOTSTRAP_TOKEN_KEY);
  } catch {
    // ignore
  }
  invalidateCache();
}

/* ────────────────────────────────────────
   In-memory cache (module-scoped)
   ──────────────────────────────────────── */

let cache: Map<string, string> | null = null;

function invalidateCache(): void {
  cache = null;
}

/** Sync read from the in-memory cache. Returns null if cache miss / not loaded. */
export function getSetting(key: string): string | null {
  if (!cache) return null;
  return cache.get(key) ?? null;
}

/* ────────────────────────────────────────
   HTTP helpers
   ──────────────────────────────────────── */

interface SettingsListItem {
  key: string;
  masked_value?: string;
  created_at?: string;
  updated_at?: string;
}

interface SettingsValueResponse {
  key: string;
  value: string;
}

function authHeaders(): Record<string, string> {
  const token = getBootstrapToken();
  if (!token) throw new SettingsAuthError("Bootstrap token is not set");
  return { Authorization: `Bearer ${token}` };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${PIPELINE_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    // Network / DNS / CORS — treat as transient.
    if (import.meta.env.DEV) console.error("[settings] network error:", e);
    throw new SettingsUnavailableError(
      `Pipeline settings: network error (${(e as Error)?.message ?? "unknown"})`,
    );
  }
  if (res.status === 401 || res.status === 403) {
    // Server rejected the bootstrap token. Drop it locally so the next mount
    // of useSettings() shows the bootstrap form instead of looping. Fire a
    // global event so any in-flight `useSettings()` instance can re-transition
    // to the auth-lost screen mid-session — without this, sync `getSetting()`
    // consumers (Task-04 wiring) would silently read `null` from the wiped
    // cache without any UI signal.
    clearBootstrapToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(SETTINGS_AUTH_LOST_EVENT));
    }
    throw new SettingsAuthError();
  }
  if (res.status >= 500) {
    throw new SettingsUnavailableError(`Pipeline settings: HTTP ${res.status}`);
  }
  if (!res.ok) {
    // 4xx other than 401/403 — surface as unavailable so retry is offered.
    // Real-world examples: 404 (route disabled), 422 (bad payload).
    throw new SettingsUnavailableError(`Pipeline settings: HTTP ${res.status}`);
  }
  return res;
}

/* ────────────────────────────────────────
   Public API
   ──────────────────────────────────────── */

/**
 * Populate the in-memory cache with every setting the bootstrap token can
 * read. Called once on app start by `useSettings()`. Subsequent
 * `getSetting()` calls are sync reads from the cache.
 *
 * Strategy:
 *  1. GET /settings → list of {key, masked_value, ...}.
 *  2. For each key, GET /settings/{key} → unmasked value.
 *
 * Two round-trips per setting is fine here (a handful of secrets, page
 * lifetime cache). If the list grows large we can switch to a bulk endpoint
 * later — but that's a pipeline-side change.
 */
export async function loadAllSettings(): Promise<void> {
  const listRes = await request("/settings");
  const items = (await listRes.json()) as SettingsListItem[];
  const next = new Map<string, string>();
  // Fetch values in parallel — bounded by the number of declared keys (small).
  const values = await Promise.all(
    items.map(async (item) => {
      const r = await request(`/settings/${encodeURIComponent(item.key)}`);
      const data = (await r.json()) as SettingsValueResponse;
      return [item.key, data.value] as const;
    }),
  );
  for (const [k, v] of values) next.set(k, v);
  cache = next;
}

/** PUT /settings/{key} — also updates the in-memory cache on success. */
export async function setSetting(key: string, value: string): Promise<void> {
  const res = await request(`/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  // Drain the body so the connection can be reused; we don't need the payload.
  await res.text().catch(() => "");
  if (!cache) cache = new Map();
  cache.set(key, value);
}

/** DELETE /settings/{key} — also removes from the in-memory cache on success. */
export async function deleteSetting(key: string): Promise<void> {
  const res = await request(`/settings/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  await res.text().catch(() => "");
  cache?.delete(key);
}

/** GET /settings/keys — list of declared/known keys. */
export async function listSettingsKeys(): Promise<string[]> {
  const res = await request("/settings/keys");
  return (await res.json()) as string[];
}

/* ────────────────────────────────────────
   Test/debug helpers (not exported via barrel)
   ──────────────────────────────────────── */

/**
 * Exported for tests only — production code must not depend on the cache
 * being empty across a page lifetime.
 */
export function _resetSettingsCacheForTests(): void {
  invalidateCache();
}
