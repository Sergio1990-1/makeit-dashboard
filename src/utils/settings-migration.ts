/**
 * One-time migration of legacy `localStorage` secrets → server-side Pipeline
 * settings store (Epic-004 Task-05).
 *
 * Why:
 *  Before Epic-004 the dashboard kept its API tokens (`github_token`,
 *  `claude_api_key`) in `localStorage`. That made every browser an island —
 *  a fresh device required re-pasting every secret, and there was no audit
 *  trail. Task-03 introduced a server-side store; this module ports any
 *  existing local values up to the server on the next page load, then wipes
 *  them from `localStorage`.
 *
 * LEGACY_KEYS:
 *  Keys are determined from the actual codebase (`grep -rn "localStorage"
 *  src/`), NOT guessed. Currently:
 *    - `github_token`     → `github_token`        (same name, see config.ts)
 *    - `claude_api_key`   → `anthropic_api_key`   (renamed; see config.ts)
 *
 *  Excluded on purpose:
 *    - `pipeline_settings_token` — bootstrap token, MUST stay in localStorage
 *      (it's how settings.ts authenticates against the pipeline).
 *    - `betterstack_worker_url`  — a Cloudflare Worker proxy URL, not a
 *      BetterStack API token. Different concept from the server-side
 *      `betterstack_token` setting; not safe to map.
 *    - `makeit_auth`, `makeit_finances`, `makeit.activeTab`, `makeit_health_*`,
 *      `pipeline_*` (project/labels/limit/complexity/configOpen),
 *      `transcripts_*`, `monitoring_*`, view filter / sort / sub-tab
 *      preferences, transcript drafts — pure UI/preference/cache state,
 *      not secrets.
 *
 * Algorithm (single pass, idempotent):
 *  1. If `settings_migration_v1_done` flag is present → no-op.
 *  2. If no bootstrap token → no-op (we can't talk to the settings server,
 *     and we'd just throw `SettingsAuthError` from listSettingsKeys()).
 *  3. Snapshot the keys already on the server.
 *  4. For each legacy entry that has a value in localStorage:
 *       - Already on server → don't overwrite, just remove from localStorage.
 *       - Otherwise → PUT to server; on success remove from localStorage; on
 *         failure capture per-key error (network / 5xx / etc) and continue
 *         with the rest. Failed keys stay in localStorage so a future load
 *         can retry.
 *  5. Set the `_v1_done` flag ONLY when no per-key failure occurred. A
 *     partial-success run does NOT set the flag — the next page load will
 *     pick up the still-failed keys.
 *
 * Why no test runner: this repo has no vitest/jest configured. The behaviour
 * documented above is the contract — when a runner lands the test cases
 * should cover:
 *   - flag present → returns empty result, no I/O.
 *   - server already has key → localStorage cleared, server NOT overwritten.
 *   - setSetting throws → key stays in localStorage, flag not set.
 *   - bootstrap token absent → no-op (no listSettingsKeys call).
 *   - bootstrap token & UI prefs untouched after migration.
 */

import {
  getBootstrapToken,
  listSettingsKeys,
  setSetting,
} from "./settings";

interface LegacyEntry {
  /** Key as stored in `localStorage` historically. */
  legacyKey: string;
  /** Key on the pipeline settings server. */
  serverKey: string;
}

const LEGACY_KEYS: readonly LegacyEntry[] = [
  // Same name on both sides — see src/utils/config.ts:getToken/setToken.
  { legacyKey: "github_token", serverKey: "github_token" },
  // Renamed: client called it "claude" historically; server-side schema uses
  // the canonical Anthropic name. See src/utils/config.ts:getClaudeKey/setClaudeKey
  // and docs/epics/epic-004/task-04.md.
  { legacyKey: "claude_api_key", serverKey: "anthropic_api_key" },
];

const MIGRATION_FLAG = "settings_migration_v1_done";

export interface MigrationResult {
  /** Legacy keys that were successfully written to the server. */
  migrated: string[];
  /** Legacy keys whose server-side counterpart already existed (LS cleared, server preserved). */
  skipped: string[];
  /** Legacy keys whose `setSetting` call failed (LS NOT cleared so a retry can succeed). */
  failed: Array<{ key: string; error: string }>;
}

const EMPTY_RESULT: MigrationResult = { migrated: [], skipped: [], failed: [] };

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore — quota / private mode; the next migration attempt will retry.
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — flag write failure is non-fatal: next load will simply re-run
    // the migration (which is no-op if everything's already on the server).
  }
}

/**
 * Run the one-time legacy → server migration. Safe to call on every app boot;
 * the `_v1` flag short-circuits subsequent runs.
 */
export async function runOneTimeMigration(): Promise<MigrationResult> {
  // Already ran successfully (or skipped because nothing to do).
  if (safeGetItem(MIGRATION_FLAG)) {
    return { ...EMPTY_RESULT };
  }

  // Without a bootstrap token we can't talk to /settings — bail out silently.
  // Don't set the flag: when the user finally logs in we want to migrate.
  if (!getBootstrapToken()) {
    return { ...EMPTY_RESULT };
  }

  // Grab the server-side key list up front so we don't have to re-list per
  // entry. If this throws (auth lost / 5xx) we surface the error to the
  // caller — callers should swallow it and let the next load retry.
  let serverKeys: string[];
  try {
    serverKeys = await listSettingsKeys();
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[settings-migration] listSettingsKeys failed, deferring:", e);
    }
    return { ...EMPTY_RESULT };
  }
  const serverKeySet = new Set(serverKeys);

  const result: MigrationResult = { migrated: [], skipped: [], failed: [] };

  for (const { legacyKey, serverKey } of LEGACY_KEYS) {
    const value = safeGetItem(legacyKey);
    if (value === null || value === "") continue; // nothing to migrate

    if (serverKeySet.has(serverKey)) {
      // Server is the source of truth — never overwrite with local. But the
      // local copy is now redundant (and a leak risk), so wipe it.
      safeRemoveItem(legacyKey);
      result.skipped.push(legacyKey);
      continue;
    }

    try {
      await setSetting(serverKey, value);
      // Only delete the local copy AFTER the server has confirmed the write,
      // so a transient failure doesn't lose the secret.
      safeRemoveItem(legacyKey);
      result.migrated.push(legacyKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      result.failed.push({ key: legacyKey, error: msg });
      // Intentionally keep the value in localStorage so the next page load
      // can retry. Don't break — other keys may still succeed.
    }
  }

  // Only mark the migration done if everything either succeeded or was
  // already on the server. A partial failure leaves the flag unset so the
  // next boot tries again automatically.
  if (result.failed.length === 0) {
    safeSetItem(MIGRATION_FLAG, new Date().toISOString());
  }

  return result;
}

/* ────────────────────────────────────────
   Test/debug helpers (not part of public API)
   ──────────────────────────────────────── */

/** For tests only. Removes the migration flag so the next call re-runs. */
export function _resetMigrationFlagForTests(): void {
  safeRemoveItem(MIGRATION_FLAG);
}

/** For tests only. The full legacy→server map. */
export const _LEGACY_KEYS_FOR_TESTS = LEGACY_KEYS;
