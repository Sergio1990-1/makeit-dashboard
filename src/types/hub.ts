// Project Hub types — shape `ProjectHubData` per docs/PROJECT_HUB_DESIGN_BRIEF.md §5.
// Epic-009 introduces only the skeleton: new domain types are stubs with
// minimal fields enough for placeholder UI to render, then Epic-011/012 fill
// in real producers (extractors, registers, aggregators, NBA engine).

import type { ProjectData } from "./index";
import type { HealthReport } from "./health";
import type { DoraMetricsResult } from "../utils/doraCalculator";

export type HubTab = "overview" | "health" | "activity" | "decisions" | "delivery";

/**
 * Decision Log entry — institutional memory captured from transcripts.
 * Filled in Epic-011 (Task-01: Decision Log extractor + UI).
 */
export interface Decision {
  id: string;
  date: string; // ISO
  title: string;
  description?: string;
  source?: string; // e.g. transcript id, PR url
}

/**
 * Risk severity — ordered worst→best as `critical > high > med > low`.
 * Intentionally NOT `HealthSeverity` ("medium"): the Risk Register yaml
 * schema (Epic-011 FR-29, docs/risks.yaml) uses the short `med` token.
 */
export type RiskSeverity = "low" | "med" | "high" | "critical";

/** Likelihood the risk materialises. */
export type RiskProbability = "low" | "med" | "high";

/** Lifecycle of a risk entry in the register. */
export type RiskStatus = "open" | "mitigated" | "accepted" | "closed";

/** How a risk entered the register (drives the source badge). */
export type RiskSource = "manual" | "transcript-extracted" | "audit-promoted";

/**
 * Risk Register entry — one row of `docs/risks.yaml` in the project repo.
 * Filled in Epic-011 (Task-03: Risk Register). CRUD writes back via the
 * GitHub Contents API (see src/utils/github-contents.ts).
 */
export interface Risk {
  id: string;
  title: string;
  severity: RiskSeverity;
  probability: RiskProbability;
  mitigation: string;
  owner: string;
  /** ISO-8601 date, or `null` when no due date is set. */
  due: string | null;
  status: RiskStatus;
  source: RiskSource;
}

/**
 * Promise/commitment tracked per project (overdue + due-this-week surfacing).
 * Filled in Epic-011 (Task-02: Commitments).
 *
 * Source of truth: `## Commitments` / `commitments:` in the project's
 * BRIEF.md, merged with `docs/commitments.yaml` (yaml wins on dupes by
 * `text + client`). `overdue` is derived client-side (`due < now`) — a
 * persisted status is only ever `open` or `done`.
 */
export interface Commitment {
  /** What was promised (free text). */
  text: string;
  /** ISO-8601 due date (YYYY-MM-DD or full timestamp). */
  due: string;
  /** Client / counterparty the promise is owed to. */
  client: string;
  /** `open` / `done` persisted; `overdue` is computed at render time. */
  status: "open" | "done" | "overdue";
}

/** What kind of thing is being renewed (drives the type filter). */
export type RenewalType = "ssl" | "domain" | "contract" | "license" | "dep";

/**
 * How a renewal entered the list. `manual` rows live in
 * `docs/renewals.yaml` and are CRUD-editable; `auto-scan` rows are
 * virtual (derived from `package.json` deprecated deps) and never
 * persisted back to the yaml — they are read-only in the UI.
 */
export type RenewalSource = "manual" | "auto-scan";

/**
 * Renewal — SSL/domain/contract/license expiry or a deprecated
 * dependency, surfaced with a due date. Manual entries are one row of
 * `docs/renewals.yaml`; auto-scan entries are virtual (Epic-011
 * Task-04, FR-32). CRUD writes back via the GitHub Contents API
 * (see src/utils/github-contents.ts) for `source === "manual"` only.
 */
export interface Renewal {
  type: RenewalType;
  name: string;
  /** ISO-8601 expiry date, or `null` when no date is known/set. */
  expires_at: string | null;
  notes: string;
  source: RenewalSource;
}

/** Origin system a `PulseEvent` was aggregated from. */
export type PulseSource = "github" | "pipeline" | "transcript" | "audit";

/**
 * PulseEvent — unified activity timeline point (commits, PRs, runs, etc).
 * Filled in Epic-011 (Task-06: Activity Pulse aggregator).
 *
 * `label` is retained for back-compat with consumers that pre-date the
 * Task-06 aggregator (weeklyDigestGenerator, lastVisitedStore). New code
 * should prefer `title`; the aggregator always sets both to the same
 * string so existing callers keep working unchanged.
 */
export interface PulseEvent {
  id: string;
  source: PulseSource;
  timestamp: string; // ISO
  type: string; // e.g. "commit", "pr_merged", "issue_closed"
  title: string;
  /** @deprecated mirror of `title` kept for pre-Task-06 consumers. */
  label: string;
  url?: string;
  meta?: Record<string, unknown>;
}

/**
 * Weekly Project Digest entry (single latest digest, not a list).
 * Filled in Epic-012 (Task-02: Weekly Project Digest).
 *
 * `budgetFallback` is true when the digest was produced on Haiku
 * because the monthly Claude budget crossed the fallback threshold
 * (`shouldFallbackToHaiku()`), so the viewer can show a badge.
 */
export interface DigestEntry {
  week: string; // ISO week, e.g. "2026-W18"
  generatedAt: string; // ISO
  markdown: string;
  budgetFallback: boolean;
}

/**
 * Raw input to `generateDigest` — the week's activity for one project.
 * Every field is optional / may be empty; the generator must still
 * produce all six markdown sections with a `—` placeholder when a
 * source is absent (FR-36, Epic-012 Task-02 acceptance criteria).
 */
export interface DigestInput {
  /** Activity timeline points within the ISO week (commits/PRs/runs). */
  pulse: PulseEvent[];
  /** Issues closed during the week (`title` + optional html `url`). */
  closedIssues: { title: string; url?: string }[];
  /** PRs merged during the week (`title` + optional html `url`). */
  mergedPRs: { title: string; url?: string }[];
  /** Commitments delivered (status moved to `done`) during the week. */
  commitmentsDelivered: Commitment[];
  /** Audit findings recorded for the period (title + severity). */
  auditFindings: { title: string; severity: string }[];
  /** Claude API spend (USD) attributed to the project this week, if known. */
  spendUsd?: number;
}

/**
 * Per-project digest metadata, persisted alongside the markdown and
 * aggregated by `generatePortfolioDigest`. Kept tiny on purpose — the
 * portfolio roll-up only needs to know which projects produced a
 * digest and whether any ran on the budget-fallback model.
 */
export interface DigestMeta {
  repo: string;
  week: string;
  generatedAt: string;
  budgetFallback: boolean;
}

/**
 * DORA metrics: the Hub re-uses the calculator's own result shape
 * (`DoraMetricsResult` from `src/utils/doraCalculator.ts`) rather than a
 * parallel type. `DoraCards` already consumes that exact shape, so the
 * Hub aggregate, the producer (`computeDora`) and the presentation layer
 * all share one source of truth — no adapter, no field-name skew.
 * Filled in Epic-012 (Task-03: DORA calculator, Task-09: Hub wiring).
 */

/**
 * The four weighted Customer Health sub-components, each `0..100` or
 * `null` ("not measurable" — treated as neutral inside the blend).
 * Mirrors `HealthComponents` in `src/utils/customerHealthScore.ts`;
 * kept here so Hub views can type the breakdown without reaching into
 * the util. Filled in Epic-012 (Task-07).
 */
export interface CustomerHealthComponents {
  sentiment: number | null;
  cadence: number | null;
  delivery: number | null;
  paid: number | null;
}

/**
 * Customer Health Score (Epic-012 Task-07, PRD-008 FR-37).
 *
 * `score` is `0..100` or the string `'n/a'` when no transcript exists
 * in the last 120 days (don't surface a number we can't trust). `tier`
 * is the derived colour zone for the gauge; `sparkline` is the 90-day
 * daily series. The real producer is
 * `src/utils/customerHealthScore.ts` (`computeHealth`).
 */
export interface CustomerHealthScore {
  /** `0..100` or `'n/a'` (no transcript in the last 120 days). */
  score: number | "n/a";
  /** Colour zone: 0–40 critical, 40–70 warning, 70–100 good. */
  tier: "good" | "warning" | "critical";
  components: CustomerHealthComponents;
  /** 90 daily score values, oldest → newest. Empty when `score` is `'n/a'`. */
  sparkline: number[];
  updatedAt: string; // ISO
}

/**
 * Onboarding report — extension of Health Layer 2 freshness checks.
 * Filled in Epic-012 (Task-04: Onboarding).
 */
export interface OnboardingReport {
  completed: number;
  total: number;
  missing: string[]; // rule ids / doc names
}

/**
 * Next Best Action — ranked recommendation (top 5 shown, top 1 in header).
 * Filled in Epic-012 (Task-05: NBA engine).
 */
export interface NextBestAction {
  id: string;
  text: string;
  reason: string;
  targetTab?: HubTab; // for "Open" links inside Hub
}

/**
 * Aggregate Hub data — single source for ProjectHubPage and all tab components.
 * Per PRD-008 FR-42, views are presentation-only; this hook owns aggregation.
 */
export interface ProjectHubData {
  // Base (passed in + composed from useProjectHealth)
  project: ProjectData | null;
  health: HealthReport | null;

  // New sources — filled in Epic-011/012, stubbed in Epic-009.
  decisions: Decision[];
  risks: Risk[];
  commitments: Commitment[];
  renewals: Renewal[];
  pulse: PulseEvent[];
  inboxCount: number;
  digest: DigestEntry | null;
  dora: DoraMetricsResult | null;
  customerHealth: CustomerHealthScore | null;
  onboarding: OnboardingReport;
  nba: NextBestAction[];

  // Lifecycle
  loading: boolean;
  loadingTab: Record<HubTab, boolean>;
  error: Error | null;
  refresh: () => void;
  generateDigest: () => Promise<void>;
  regenerateNBA: () => Promise<void>;
}
