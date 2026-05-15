/**
 * Per-project drift norms loader (Epic-012 Task-06, PRD-008 FR-40).
 *
 * Drift Detection (Customer Health / DriftDots, Epic-010) needs to know,
 * per project, how stale "stale" actually is: a tier-1 client app that
 * goes 14 days without a commit is a red flag, the same gap on a tier-3
 * side project is normal. Those thresholds live in two places:
 *
 *   1. `docs/project_norm.yaml` IN THE PROJECT REPO — per-project override,
 *      authored by whoever owns the project. Read via the GitHub Contents
 *      API (`github-contents.ts`).
 *   2. Tier defaults — applied when the per-project file is absent.
 *
 * Defaults source-of-truth note:
 *   FR-40 specifies the canonical tier defaults live in
 *   `makeit-knowledge/Skills/PROJECT_NORMS_DEFAULTS.yaml`. The worktree
 *   used to ship Epic-012 has no access to the makeit-knowledge repo, so
 *   — following the Epic-012 #380 precedent — the defaults are HARD-CODED
 *   here in `DEFAULT_NORMS` and a tech-debt issue tracks migrating them
 *   into makeit-knowledge (`PROJECT_NORMS_DEFAULTS.yaml` + a
 *   `Skills/templates/hub/project_norm.yaml` bootstrap template). Until
 *   that migration lands, `DEFAULT_NORMS` IS the source of truth.
 *
 * Caching:
 *   Resolved norms are cached in localStorage under
 *   `makeit_drift_norm:{repo}` with a 24h TTL. After expiry the next call
 *   re-fetches. A successful tier-default fallback is also cached so a
 *   missing file doesn't trigger a GitHub round-trip on every drift
 *   recompute. Corrupt/invalid YAML never poisons the cache: it is
 *   treated as "no usable override" and falls through to the tier
 *   default (which IS cached, so the bad file isn't re-fetched for 24h).
 */

import yaml from "js-yaml";
import { readMarkdown } from "./github-contents";

/** The four drift thresholds, all expressed in whole days. */
export interface ProjectNorm {
  /** Expected max gap between commits before "stale code" drift. */
  commit_cadence_days: number;
  /** Expected max gap between deploys before "stale deploy" drift. */
  deploy_freq_days: number;
  /** Expected max gap between audits before "stale audit" drift. */
  audit_freq_days: number;
  /** Expected max gap between client touchpoints before "cold client". */
  client_touch_interval_days: number;
}

/**
 * Tier this project belongs to. The dashboard models tier as the numeric
 * `1 | 2 | 3` from `ProjectClassification` (`src/types/health.ts`); we
 * also accept the string form (`"tier-1"` etc.) that the
 * makeit-knowledge YAML uses, so callers on either side of the migration
 * line work without a conversion shim.
 */
export type ProjectTier = 1 | 2 | 3 | "tier-1" | "tier-2" | "tier-3";

/**
 * Hard-coded tier defaults — FUTURE
 * `makeit-knowledge/Skills/PROJECT_NORMS_DEFAULTS.yaml`.
 *
 * tier-1 = client-facing / revenue-critical → strict (short intervals).
 * tier-2 = active but lower-stakes → medium.
 * tier-3 = side / experimental → lenient (long intervals).
 *
 * Keep the per-tier object literally mirror-able to YAML so the eventual
 * migration is a copy-paste, not a re-derivation.
 */
export const DEFAULT_NORMS: Record<1 | 2 | 3, ProjectNorm> = {
  1: {
    commit_cadence_days: 3,
    deploy_freq_days: 7,
    audit_freq_days: 30,
    client_touch_interval_days: 7,
  },
  2: {
    commit_cadence_days: 7,
    deploy_freq_days: 14,
    audit_freq_days: 60,
    client_touch_interval_days: 21,
  },
  3: {
    commit_cadence_days: 21,
    deploy_freq_days: 45,
    audit_freq_days: 120,
    client_touch_interval_days: 60,
  },
};

const NORM_PATH = "docs/project_norm.yaml";
const CACHE_PREFIX = "makeit_drift_norm:";
/** 24h in ms — norms change rarely; a daily refresh is plenty. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** The four required keys — used for both normalisation and validation. */
const NORM_KEYS = [
  "commit_cadence_days",
  "deploy_freq_days",
  "audit_freq_days",
  "client_touch_interval_days",
] as const;

interface CacheEntry {
  norm: ProjectNorm;
  cached_at: number;
}

/**
 * Collapse the tier (numeric or string form) to the `1 | 2 | 3` key used
 * by `DEFAULT_NORMS`. Unknown input falls back to the strictest tier (1):
 * over-reporting drift on a misconfigured project is safer than silently
 * treating it as a lenient side project.
 */
function tierKey(tier: ProjectTier): 1 | 2 | 3 {
  if (tier === 1 || tier === "tier-1") return 1;
  if (tier === 2 || tier === "tier-2") return 2;
  if (tier === 3 || tier === "tier-3") return 3;
  return 1;
}

/** A fresh copy of the tier default (never hand out the shared literal). */
function tierDefault(tier: ProjectTier): ProjectNorm {
  return { ...DEFAULT_NORMS[tierKey(tier)] };
}

/**
 * Coerce an unknown parsed-YAML value into a `ProjectNorm`, or `null` if
 * it can't be made into one. Every field must be a finite, positive
 * number — a zero/negative interval would make drift "always firing" or
 * "never firing", both worse than the tier default. Extra keys are
 * ignored; this is the runtime tripwire (cf. `checklist.ts` `validate`).
 */
function coerceNorm(parsed: unknown): ProjectNorm | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const src = parsed as Record<string, unknown>;
  const out = {} as ProjectNorm;
  for (const key of NORM_KEYS) {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return null;
    }
    out[key] = v;
  }
  return out;
}

/** Read a still-valid cache entry, or `null` if missing/expired/corrupt. */
function readCache(repo: string): ProjectNorm | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + repo);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<CacheEntry>;
    const age = typeof entry.cached_at === "number" ? Date.now() - entry.cached_at : NaN;
    // `age < 0` guards a clock moved backwards (or a future `cached_at`):
    // without it a negative age never satisfies `>= TTL` and the entry
    // would be served as "fresh" forever. NaN (missing cached_at) also fails.
    if (!(age >= 0 && age < CACHE_TTL_MS)) {
      return null;
    }
    // Re-validate the cached payload: a hand-edited or schema-drifted
    // localStorage entry must not be trusted just because it parsed.
    return coerceNorm(entry.norm);
  } catch {
    return null;
  }
}

/** Persist a resolved norm. Best-effort: a write failure is non-fatal. */
function writeCache(repo: string, norm: ProjectNorm): void {
  try {
    const entry: CacheEntry = { norm, cached_at: Date.now() };
    localStorage.setItem(CACHE_PREFIX + repo, JSON.stringify(entry));
  } catch {
    // Quota exceeded / storage disabled — drift just won't be cached.
  }
}

/**
 * Resolve the drift norms for `repo`.
 *
 * Order: fresh localStorage cache → per-project `docs/project_norm.yaml`
 * → tier default. The resolved value (override OR default) is cached for
 * 24h so a missing/invalid file doesn't cost a GitHub round-trip on
 * every drift recompute.
 *
 * Never throws: any failure (no token, network, 404, garbage YAML)
 * degrades to the tier default. `repo` may be `repo-name` or
 * `owner/repo` — `github-contents.ts` resolves the owner.
 */
export async function loadProjectNorm(
  repo: string,
  tier: ProjectTier,
): Promise<ProjectNorm> {
  const cached = readCache(repo);
  if (cached) return cached;

  let resolved: ProjectNorm | null = null;
  try {
    const file = await readMarkdown(repo, NORM_PATH);
    if (file !== null) {
      // Parse defensively: a corrupt override must fall through to the
      // tier default, not bubble a YAMLException up into the Hub render
      // boundary.
      let parsed: unknown;
      try {
        parsed = yaml.load(file.content);
      } catch {
        parsed = null;
      }
      resolved = coerceNorm(parsed);
    }
  } catch {
    // Auth/network/unexpected status — treat as "no override".
    resolved = null;
  }

  const norm = resolved ?? tierDefault(tier);
  // Cache the resolved value (override or default alike) so a missing
  // file is a once-a-day cost, not a per-call one.
  writeCache(repo, norm);
  return norm;
}

/** Drop the cached norm for one repo (e.g. after editing the YAML). */
export function clearProjectNormCache(repo: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + repo);
  } catch {
    // Storage disabled — nothing was cached anyway.
  }
}
