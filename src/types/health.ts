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
}

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

export interface HealthReport {
  repo: string;
  generated_at: string;
  classification: ProjectClassification;
  in_grace_period: boolean;
  findings: HealthFinding[];
  score: HealthScore;
  by_layer: Record<HealthLayer, HealthLayerSummary>;
  trend: HealthTrend;
}

// Имена слоёв для UI. Слои определены в makeit-knowledge/Skills/PROJECT_CHECKLIST.yaml
// (4 концентрических круга). Здесь только человекочитаемые названия.
export const LAYER_NAMES: Record<HealthLayer, string> = {
  1: "Гигиена",
  2: "Документация",
  3: "Свежесть и операционка",
  4: "Drift (AI)",
};
