// Project Hub types — shape `ProjectHubData` per docs/PROJECT_HUB_DESIGN_BRIEF.md §5.
// Epic-009 introduces only the skeleton: new domain types are stubs with
// minimal fields enough for placeholder UI to render, then Epic-011/012 fill
// in real producers (extractors, registers, aggregators, NBA engine).

import type { ProjectData } from "./index";
import type { HealthReport } from "./health";

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

/**
 * Renewal — SSL/domain/contract/dep deprecation with a due date.
 * Filled in Epic-011 (Task-04: Renewals).
 */
export interface Renewal {
  id: string;
  kind: "ssl" | "domain" | "contract" | "dependency" | "other";
  title: string;
  dueDate: string; // ISO
  status: "upcoming" | "due" | "expired";
}

/**
 * PulseEvent — unified activity timeline point (commits, PRs, runs, etc).
 * Filled in Epic-011 (Task-06: Activity Pulse aggregator).
 */
export interface PulseEvent {
  id: string;
  timestamp: string; // ISO
  type: string; // e.g. "commit", "pr_merged", "issue_closed"
  label: string;
  url?: string;
}

/**
 * Weekly Project Digest entry (single latest digest, not a list).
 * Filled in Epic-012 (Task-02: Weekly Project Digest).
 */
export interface DigestEntry {
  week: string; // ISO week, e.g. "2026-W18"
  generatedAt: string; // ISO
  markdown: string;
}

/**
 * DORA metrics snapshot + 90d trend per metric.
 * Filled in Epic-012 (Task-01: DORA).
 */
export interface DoraMetrics {
  deploymentFrequency: number; // deploys/week
  leadTimeHours: number;
  mttrHours: number;
  changeFailureRate: number; // 0..1
  trend90d: {
    deploymentFrequency: number[];
    leadTimeHours: number[];
    mttrHours: number[];
    changeFailureRate: number[];
  };
}

/**
 * Customer Health Score (formula TBD — see PROJECT_HUB_DESIGN_BRIEF.md §11).
 * Filled in Epic-012 (Task-03: Customer Health).
 */
export interface CustomerHealthScore {
  score: number; // 0..100
  tier: "good" | "warning" | "critical";
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
  dora: DoraMetrics | null;
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
