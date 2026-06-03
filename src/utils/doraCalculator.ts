/**
 * DORA metrics calculator (Epic-012 Task-03, FR-33..FR-35).
 *
 * Computes the four canonical DORA metrics for a single repo over a
 * sliding window (default 30 days) plus a per-metric tier
 * (`elite` / `high` / `medium` / `low`) using the DORA 2024 benchmark.
 *
 * Conventions (mirrored in docs/DELIVERY.md):
 *   1. **Deploy Frequency** — count of commits on the default branch
 *      whose subject starts with `feat:` or `release:`, divided by
 *      `windowDays`. Unit: deploys/day. Hotfixes (`fix:`) are NOT
 *      deploys (#527/D6) — they are only a failure signal (see CFR), so
 *      they neither inflate frequency nor count as their own failure.
 *   2. **Lead Time for Changes** — median(`merged_at - created_at`) over
 *      merged PRs in the window. Unit: hours.
 *   3. **MTTR** — median downtime per incident from BetterStack monitor
 *      matched by repo via `MONITOR_MATCH`. When no matching monitor or
 *      no incidents data is available, returns `n/a` (`null`). Unit:
 *      hours.
 *   4. **Change Failure Rate** — share of deploys (= `feat:`/`release:`
 *      commits) that were followed within 7 days by EITHER a `fix:`
 *      commit OR a critical audit finding. Value in `[0, 1]`. Only
 *      deploys whose full 7-day failure-lookahead window has already
 *      elapsed (`deployTime + 7d <= now`) are judged (#527/D7) — a
 *      deploy from the last 7 days is excluded from the denominator
 *      rather than presumed successful. If no deploy is judgeable yet,
 *      CFR is `n/a` (`null`), not 0%.
 *
 * Inputs are *injected* — the calculator is pure. The caller is
 * responsible for fetching commits, PRs, monitor incidents and audit
 * findings; this keeps the module easy to unit-reason about and avoids
 * coupling it to specific clients (GitHub REST / BetterStack worker /
 * Auditor REST).
 *
 * Failure model: every metric is computed independently. If the inputs
 * for one are empty/absent, that metric returns `null` ("n/a") rather
 * than throwing — the UI surfaces a dash in the corresponding card.
 */

import type { CommitInfo } from "./github-contents";

/** DORA performance tier per metric, from the 2024 State of DevOps report. */
export type DoraTier = "elite" | "high" | "medium" | "low" | "na";

/** Single PR observation used for Lead Time calculation. */
export interface DoraPullRequest {
  /** ISO-8601 timestamp the PR was opened. */
  createdAt: string;
  /** ISO-8601 timestamp the PR was merged (null PRs are filtered out). */
  mergedAt: string | null;
}

/** Single downtime incident used for MTTR calculation. */
export interface DoraIncident {
  /** ISO-8601 timestamp the incident started. */
  startedAt: string;
  /**
   * ISO-8601 timestamp the incident resolved. `null` means still open —
   * such incidents are excluded from the median (no resolved duration
   * yet, including them would skew MTTR toward 0 or +∞ depending on the
   * convention picked).
   */
  resolvedAt: string | null;
}

/** Single audit finding used for Change Failure Rate. */
export interface DoraAuditFinding {
  /** ISO-8601 timestamp of the audit run that produced the finding. */
  timestamp: string;
  severity: "critical" | "high" | "medium" | "low";
}

/** Inputs to `computeDora` — fetched by the caller. */
export interface DoraInputs {
  /** Commits on the default branch, newest first; subject + date used. */
  commits: CommitInfo[];
  /** Merged PRs covering the window (caller filters by `mergedAt`). */
  pullRequests: DoraPullRequest[];
  /**
   * Downtime incidents from the matched BetterStack monitor. Pass `null`
   * when there's no monitor for this repo (`MONITOR_MATCH` miss) — MTTR
   * becomes `n/a`. Pass `[]` if there is a monitor but no downtime in
   * the window — MTTR also becomes `n/a` (zero downtime means there
   * were no failures to recover from).
   */
  incidents: DoraIncident[] | null;
  /**
   * Audit findings produced by the auditor. Empty array means audit
   * either never ran or surfaced nothing — CFR falls back to the
   * fix-only signal.
   */
  auditFindings: DoraAuditFinding[];
}

/** Output of `computeDora`. `null` on any metric means "n/a" — the UI
 *  must render a dash, NOT a zero. */
export interface DoraMetricsResult {
  /** Deploys per day; `null` if windowDays ≤ 0 (defensive). */
  deployFreq: number | null;
  /** Median lead time in hours; `null` if no merged PRs in window. */
  leadTimeHours: number | null;
  /** Median MTTR in hours; `null` if no incidents data or no matched monitor. */
  mttrHours: number | null;
  /**
   * Change failure rate in `[0, 1]`; `null` ("n/a") if there is no
   * *judgeable* deploy — i.e. no deploy whose full 7-day failure window
   * has elapsed (#527/D7). Deploys from the last 7 days are excluded
   * from the denominator, never presumed successful.
   */
  cfr: number | null;
  /** Tier per metric — `na` when the metric is null. */
  tiers: {
    deployFreq: DoraTier;
    leadTime: DoraTier;
    mttr: DoraTier;
    cfr: DoraTier;
  };
}

/**
 * Conventional-commit prefixes that count as a "deploy". A merge on
 * `main` carrying one of these is a release-candidate change on a
 * micro-team — we don't gate deploys on git tags because the team
 * doesn't tag religiously.
 *
 * `fix:` is deliberately EXCLUDED (#527/D6): a hotfix is purely a
 * *failure signal* for CFR, not a deploy. Counting it as both inflated
 * deploy frequency with hotfixes AND made a deploy able to be its own
 * failure (circular). Deploys are now feat:/release: only.
 */
const DEPLOY_PREFIXES = ["feat:", "release:"] as const;
const FIX_PREFIX = "fix:";

/** Match the conventional-commit prefix at the start of a subject. */
function startsWithAny(subject: string, prefixes: readonly string[]): boolean {
  const s = subject.trimStart().toLowerCase();
  for (const p of prefixes) {
    if (s.startsWith(p)) return true;
  }
  return false;
}

/** Parse an ISO timestamp; returns NaN on invalid input. */
function ts(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NaN : t;
}

/** Median of a numeric array (returns null on empty). */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── DORA 2024 benchmark thresholds ─────────────────────────────────────
// Source: DORA "State of DevOps 2024" Accelerate report.
//
// Deploy Frequency tiers refer to the typical *cadence* — translated to
// deploys/day for a single repo:
//   elite  ≥ 1/day             → deploys/day ≥ 1
//   high   weekly..daily       → deploys/day ≥ 1/7
//   medium monthly..weekly     → deploys/day ≥ 1/30
//   low    < monthly           → deploys/day <  1/30
//
// Lead time / MTTR / CFR thresholds are the standard ones, converted to
// hours where needed.

const DF_ELITE = 1;          // ≥ 1 deploy/day
const DF_HIGH = 1 / 7;       // ≥ ~weekly
const DF_MEDIUM = 1 / 30;    // ≥ ~monthly

const LT_ELITE_H = 24;       // ≤ 1 day
const LT_HIGH_H = 24 * 7;    // ≤ 1 week
const LT_MEDIUM_H = 24 * 30; // ≤ 1 month

const MTTR_ELITE_H = 1;      // ≤ 1 hour
const MTTR_HIGH_H = 24;      // ≤ 1 day
const MTTR_MEDIUM_H = 24 * 7;// ≤ 1 week

const CFR_ELITE = 0.05;      // ≤ 5%
const CFR_HIGH = 0.10;       // ≤ 10%
const CFR_MEDIUM = 0.15;     // ≤ 15%

// Note: unlike the other tierFor* helpers, deployFreq is never null at the
// call site (it's `deploys.length / windowDays`, guarded by windowDays > 0),
// so the parameter is `number` and there is no `na` branch here.
function tierForDeployFreq(perDay: number): DoraTier {
  if (perDay >= DF_ELITE) return "elite";
  if (perDay >= DF_HIGH) return "high";
  if (perDay >= DF_MEDIUM) return "medium";
  return "low";
}

function tierForLeadTime(hours: number | null): DoraTier {
  if (hours === null) return "na";
  if (hours <= LT_ELITE_H) return "elite";
  if (hours <= LT_HIGH_H) return "high";
  if (hours <= LT_MEDIUM_H) return "medium";
  return "low";
}

function tierForMttr(hours: number | null): DoraTier {
  if (hours === null) return "na";
  if (hours <= MTTR_ELITE_H) return "elite";
  if (hours <= MTTR_HIGH_H) return "high";
  if (hours <= MTTR_MEDIUM_H) return "medium";
  return "low";
}

function tierForCfr(rate: number | null): DoraTier {
  if (rate === null) return "na";
  if (rate <= CFR_ELITE) return "elite";
  if (rate <= CFR_HIGH) return "high";
  if (rate <= CFR_MEDIUM) return "medium";
  return "low";
}

/** Internal: a parsed commit with a usable epoch ms timestamp. */
interface ParsedCommit {
  subject: string;
  time: number;
}

/** Filter and parse commits down to those that fall inside `[since, now]`. */
function commitsInWindow(commits: CommitInfo[], since: number, now: number): ParsedCommit[] {
  const out: ParsedCommit[] = [];
  for (const c of commits) {
    const time = ts(c.date);
    if (Number.isNaN(time)) continue;
    if (time < since || time > now) continue;
    out.push({ subject: c.subject ?? "", time });
  }
  return out;
}

/**
 * Compute DORA metrics for a single repo.
 *
 * @param inputs    Pre-fetched commits / PRs / incidents / audit findings.
 * @param windowDays  Sliding window in days. Default 30. Must be > 0.
 * @param now       Override for "now" (epoch ms) — exposed for tests/SSR.
 */
export function computeDora(
  inputs: DoraInputs,
  windowDays: number = 30,
  now: number = Date.now(),
): DoraMetricsResult {
  // Defensive: a non-positive window is nonsense — return all-null
  // rather than divide-by-zero or invert the time range. Callers
  // should never hit this path, but we keep the calculator total.
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    return {
      deployFreq: null,
      leadTimeHours: null,
      mttrHours: null,
      cfr: null,
      tiers: { deployFreq: "na", leadTime: "na", mttr: "na", cfr: "na" },
    };
  }

  const since = now - windowDays * 86_400_000;

  // ── Deploy Frequency ─────────────────────────────────────────────
  // Count commits whose subject starts with feat:/release: (NOT fix:).
  // Divide by windowDays so the unit is deploys/day regardless of
  // the chosen window. Returns 0 (not null) when there are zero
  // qualifying commits — a project with a configured repo but no
  // recent activity should be `low`, not `n/a`.
  const windowCommits = commitsInWindow(inputs.commits, since, now);
  const deploys = windowCommits.filter((c) => startsWithAny(c.subject, DEPLOY_PREFIXES));
  const deployFreq = deploys.length / windowDays;

  // ── Lead Time for Changes ────────────────────────────────────────
  // Median(mergedAt - createdAt) across merged PRs whose mergedAt
  // falls in the window. Skip PRs missing either timestamp.
  const leadTimes: number[] = [];
  for (const pr of inputs.pullRequests) {
    if (!pr.mergedAt) continue;
    const merged = ts(pr.mergedAt);
    const created = ts(pr.createdAt);
    if (Number.isNaN(merged) || Number.isNaN(created)) continue;
    if (merged < since || merged > now) continue;
    const deltaH = (merged - created) / 3_600_000;
    if (deltaH < 0) continue; // skip impossible (clock skew) values
    leadTimes.push(deltaH);
  }
  const leadTimeHours = median(leadTimes);

  // ── MTTR ─────────────────────────────────────────────────────────
  // Caller passes `null` when no monitor was matched for the repo —
  // we surface `n/a` so the card shows a dash. An empty array means
  // monitor exists but no incidents in window — also `n/a` (no data
  // to compute a median from).
  let mttrHours: number | null = null;
  if (inputs.incidents !== null && inputs.incidents.length > 0) {
    const durations: number[] = [];
    for (const inc of inputs.incidents) {
      const start = ts(inc.startedAt);
      const end = ts(inc.resolvedAt);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      if (end < since) continue; // resolved before window
      if (start > now) continue; // started in the future (bad data)
      // Clamp pre-window time so a long-running incident that started
      // weeks before `since` doesn't bias the median upward with its
      // pre-window duration — only the in-window portion counts.
      const effectiveStart = Math.max(start, since);
      const durH = (end - effectiveStart) / 3_600_000;
      if (durH < 0) continue;
      durations.push(durH);
    }
    mttrHours = median(durations);
  }

  // ── Change Failure Rate ──────────────────────────────────────────
  // A deploy "failed" if within 7 days after its commit we see either:
  //   (a) a `fix:` commit, OR
  //   (b) a critical audit finding.
  // CFR = failed deploys / *judgeable* deploys.
  //
  // Trailing-window guard (#527/D7): a deploy can only be judged once
  // its full 7-day failure-lookahead window has ELAPSED. A deploy from
  // the last 7 days has its window extend past `now`, so we haven't
  // observed whether a fix lands yet — counting it as a success is
  // structurally optimistic and drags CFR toward 0. We therefore
  // exclude any deploy with `deployTime + 7d > now` from the
  // denominator. If that leaves zero judgeable deploys we return the
  // n/a sentinel (null), NOT a misleading 0%.
  let cfr: number | null = null;
  const sevenDaysMs = 7 * 86_400_000;
  const judgeableDeploys = deploys.filter((d) => d.time + sevenDaysMs <= now);
  if (judgeableDeploys.length > 0) {
    // Pre-filter: only fix commits *after* each deploy time count. We
    // scan the full commit list so a `fix:` outside the window (but
    // within 7d of a deploy) still attributes correctly.
    const fixCommits: ParsedCommit[] = [];
    for (const c of inputs.commits) {
      const time = ts(c.date);
      if (Number.isNaN(time)) continue;
      const subject = (c.subject ?? "").trimStart();
      if (subject.toLowerCase().startsWith(FIX_PREFIX)) {
        fixCommits.push({ subject, time });
      }
    }
    const criticalAudits = inputs.auditFindings
      .filter((f) => f.severity === "critical")
      .map((f) => ts(f.timestamp))
      .filter((t) => !Number.isNaN(t));

    let failed = 0;
    for (const d of judgeableDeploys) {
      const windowEnd = d.time + sevenDaysMs;
      // Match a fix commit strictly *after* the deploy and within 7d.
      // The strict `>` keeps a coincident commit from attributing to
      // itself; with `fix:` no longer a deploy this mainly guards
      // against same-instant feat:/fix: pairs.
      const hasFix = fixCommits.some(
        (fc) => fc.time > d.time && fc.time <= windowEnd,
      );
      const hasCriticalAudit = criticalAudits.some((t) => t > d.time && t <= windowEnd);
      if (hasFix || hasCriticalAudit) failed++;
    }
    cfr = failed / judgeableDeploys.length;
  }

  return {
    deployFreq,
    leadTimeHours,
    mttrHours,
    cfr,
    tiers: {
      deployFreq: tierForDeployFreq(deployFreq),
      leadTime: tierForLeadTime(leadTimeHours),
      mttr: tierForMttr(mttrHours),
      cfr: tierForCfr(cfr),
    },
  };
}

// Re-export benchmark constants so the UI / docs stay in sync with the
// numbers actually used to bucket tiers (single source of truth).
export const DORA_THRESHOLDS = {
  deployFreq: { elite: DF_ELITE, high: DF_HIGH, medium: DF_MEDIUM },
  leadTimeHours: { elite: LT_ELITE_H, high: LT_HIGH_H, medium: LT_MEDIUM_H },
  mttrHours: { elite: MTTR_ELITE_H, high: MTTR_HIGH_H, medium: MTTR_MEDIUM_H },
  cfr: { elite: CFR_ELITE, high: CFR_HIGH, medium: CFR_MEDIUM },
} as const;
