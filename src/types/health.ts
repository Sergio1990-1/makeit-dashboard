// Project Health types — mirror Skills/PROJECT_CHECKLIST.yaml in
// makeit-knowledge. The YAML is the source of truth; these types describe
// the runtime shape after parsing.

export type HealthLayer = 1 | 2 | 3 | 4;
export type HealthSeverity = "critical" | "high" | "medium" | "low";

export interface ChecklistAppliesTo {
  tiers?: number[];
  complex?: boolean;
  client?: boolean;
}

export interface ChecklistRule {
  id: string;
  title: string;
  layer: HealthLayer;
  applies_to: ChecklistAppliesTo;
  severity: HealthSeverity;
  check: { type: string } & Record<string, unknown>;
  source?: string;
  remediation?: string;
}

export interface ChecklistSettings {
  grace_period_days: number;
  freshness_business_doc_max_age_days: number;
  freshness_business_doc_max_closed_issues_since: number;
  freshness_tech_doc_max_age_days: number;
  freshness_meaningful_change_min_lines: number;
  issues_no_milestone_threshold: number;
  pr_doc_drift_window_days: number;
  pr_doc_drift_max_count: number;
  coverage_thresholds: { tier_2: number; tier_1: number; tier_1_complex: number };
  // Days after `discovery.completed_at` (or after which `not_required` was set)
  // when the discovery_not_stale rule starts failing. Default 90 — overridable
  // per-project via `discovery.review_due` in `.makeit/project.yaml`.
  discovery_review_due_days?: number;
}

// Discovery contract — mirrors `.makeit/project.yaml` shape written by the
// makeit-discovery skill (~/.claude/skills/makeit-discovery/SKILL.md).
// The dashboard reads it via GitHub Contents API, falls back to the legacy
// `project_classification` when the file is missing.

export type DiscoveryStatus = "completed" | "not_required" | "in_progress";
export type ProjectComplexity = "transactional" | "simple";

export interface ProjectYamlArtifacts {
  brief?: string;
  // Paired fields — both required, mutually exclusive: either `market_research`
  // is a path string and `market_research_na_reason` is null, or vice versa.
  // Both null OR both non-null violate the contract (caught by Phase 5 gate).
  market_research?: string | null;
  market_research_na_reason?: string | null;
  overview?: string;
  operating_model?: string;
  state_machines?: string;
  invariants?: string;
  source_of_truth?: string;
  business_process?: string;
}

export interface ProjectYamlDiscovery {
  status: DiscoveryStatus;
  completed_at?: string;
  // Set when status === "in_progress" — the last time the validation gate ran.
  last_validation_at?: string;
  interviewer?: string;
  artifacts?: ProjectYamlArtifacts;
  // ISO date when discovery is considered stale. Default = completed_at + 90d
  // (or settings.discovery_review_due_days). If present in the file, wins over
  // the computed default.
  review_due?: string;
  // Populated by the skill when Phase 5 validation gate fails. Surfaced in the
  // dashboard as `in_progress` finding detail.
  validation_failures?: string[];
}

export interface ProjectYamlDomain {
  key_entities?: string[];
  key_actors?: string[];
  primary_process?: string;
}

export interface ProjectYaml {
  version: number;
  project_name: string;
  created_at?: string;
  complexity: ProjectComplexity;
  discovery: ProjectYamlDiscovery;
  domain?: ProjectYamlDomain;
}

// Cache slot in RunCtx and engine result type. "missing" — file absent (normal
// for legacy projects). "invalid" — file present but YAML parse failed or
// required fields missing (engine surfaces as project_yaml_valid finding).
export type ProjectYamlState =
  | { kind: "loaded"; data: ProjectYaml }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

export interface ProjectClassification {
  tier: 1 | 2 | 3;
  complex: boolean;
  client: boolean;
  // Override for the project's knowledge file in makeit-knowledge.
  // Defaults to `knowledge/{repo}-business-logic.md` when omitted.
  knowledge_path?: string;
}

export interface ChecklistDocument {
  version: number;
  updated: string;
  authoritative_sources: string[];
  project_classification: Record<string, ProjectClassification>;
  settings: ChecklistSettings;
  severity_weights: Record<HealthSeverity, number>;
  no_grace_severities: HealthSeverity[];
  check_types_supported: string[];
  rules: ChecklistRule[];
}

// pass     — правило выполняется
// fail     — нарушение, штрафуем по severity_weights
// unknown  — данных недостаточно (нет токена, ошибка API, отложенная LLM-проверка)
// skipped  — applies_to не подошёл / grace period
export type FindingStatus = "pass" | "fail" | "unknown" | "skipped";

export interface HealthFinding {
  rule_id: string;
  title: string;
  layer: HealthLayer;
  severity: HealthSeverity;
  status: FindingStatus;
  detail?: string;
  remediation?: string;
  source?: string;
}

export interface HealthScore {
  raw: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface HealthLayerSummary {
  total: number;
  pass: number;
  fail: number;
  unknown: number;
  skipped: number;
}

export interface HealthTrend {
  // Самая старая точка → самая новая. До 7 значений (по сканам).
  // На первом запуске в массиве 1 точка (текущий score).
  points: number[];
  // current − points[0]; 0 если точек < 2.
  delta: number;
  direction: "up" | "down" | "flat";
}

// First-class discovery summary in the report — UI reads from here, not from
// findings (see Codex review d118a6a P3: derived-from-findings is fragile when
// rules are skipped/unknown/missing). Set when `.makeit/project.yaml` is
// present and parseable.
export interface HealthReportDiscovery {
  // "missing" — no .makeit/project.yaml found (legacy project, expected pre-retrofit).
  // "invalid" — file present but malformed (parse error or missing required fields).
  status: DiscoveryStatus | "missing" | "invalid";
  complexity?: ProjectComplexity;
  completed_at?: string;
  // Effective review_due — either explicit from file, or computed
  // completed_at + settings.discovery_review_due_days.
  review_due?: string;
  // True only when status is one of the green states AND review_due is in the
  // future. Drives the UI badge color (green vs yellow).
  fresh?: boolean;
  // Echo of `validation_failures` from the file when status === "in_progress".
  validation_failures?: string[];
}

export interface HealthReport {
  repo: string;
  generated_at: string;
  classification: ProjectClassification;
  in_grace_period: boolean;
  // Echoes settings.grace_period_days from the checklist so the UI can
  // render "grace · N дней" without a second source of truth.
  grace_period_days: number;
  findings: HealthFinding[];
  score: HealthScore;
  by_layer: Record<HealthLayer, HealthLayerSummary>;
  trend: HealthTrend;
  // Present when `.makeit/project.yaml` was attempted (present or missing).
  // Undefined would mean the engine didn't try to read it, which currently
  // never happens — `runHealthCheck` always probes.
  discovery?: HealthReportDiscovery;
}

// Имена слоёв для UI. Слои определены в makeit-knowledge/Skills/PROJECT_CHECKLIST.yaml
// (4 концентрических круга). Здесь только человекочитаемые названия.
export const LAYER_NAMES: Record<HealthLayer, string> = {
  1: "Гигиена",
  2: "Документация",
  3: "Свежесть и операционка",
  4: "Drift (AI)",
};
