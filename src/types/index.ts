export interface ProjectConfig {
  repo: string;
  client: string;
  owner: string;
  budget: number; // сумма контракта, $
  paid: number;   // оплачено, $
}

export type Phase = "pre-dev" | "development" | "support";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type IssueStatus = "Todo" | "In Progress" | "Review" | "Done";

export interface Issue {
  id: string;
  title: string;
  url: string;
  status: IssueStatus;
  priority: Priority | null;
  labels: string[];
  repo: string;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CommitActivity {
  byDate: Record<string, number>; // "YYYY-MM-DD" → commit count
  today: number;
  thisWeek: number;
  thisMonth: number;
  total84d: number;
}

export interface ProjectData {
  repo: string;
  client: string;
  phase: Phase;
  issues: Issue[];
  priorityCounts: Record<Priority, number>;
  progress: number; // 0-100
  lastCommitDate: string | null;
  description: string;
  openCount: number;
  doneCount: number;
  totalCount: number;
  milestones: Milestone[];
  budget: number;
  paid: number;
  remaining: number;
  daysSinceActivity: number | null;
  lastActivityDate: string | null;
  velocity7d: number;  // issues/день за 7 дней
  velocity14d: number; // issues/день за 14 дней
  etaDays: number | null; // дней до закрытия всех открытых
  etaDate: string | null; // прогноз даты завершения
  cycleTimeDays: number | null; // медиана дней issue open→close (последние 28 дней)
  commitActivity: CommitActivity; // активность коммитов за 84 дня
}

export interface SummaryMetrics {
  totalIssues: number;
  openCount: number;
  todoCount: number;
  inProgressCount: number;
  reviewCount: number;
  doneCount: number;
  projectCount: number;
  totalBudget: number;
  totalPaid: number;
  totalRemaining: number;
}

export interface MilestoneIssue {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  url: string;
}

export interface Milestone {
  title: string;
  description: string;
  dueOn: string | null;
  url: string;
  state: "OPEN" | "CLOSED";
  openIssues: number;
  closedIssues: number;
  repo: string;
  issues: MilestoneIssue[];
}

export interface Filters {
  project: string | null;
  priority: Priority | null;
  status: IssueStatus | null;
}

export type TabId = "dashboard" | "projects" | "milestones" | "uptime" | "audit" | "pipeline" | "transcripts" | "research" | "specs" | "quality" | "debate";

// ── Research / Discovery ──

export interface ResearchCompetitor {
  name: string;
  url: string;
  features: string[];
  pricing: string;
  audience: string;
}

export interface ResearchPainPoint {
  theme: string;
  frequency: string;
  source: string;
  description: string;
}

/** Parsed RESEARCH.md data */
export interface ResearchData {
  competitors: ResearchCompetitor[];
  featureMatrix: Record<string, Record<string, string>>;
  painPoints: ResearchPainPoint[];
  opportunities: string[];
  regulatoryNotes: string[];
  rawMarkdown: string;
}

export interface DiscoverySuggestion {
  name: string;
  description: string;
  effort: string;   // S / M / L / XL
  impact: string;   // low / medium / high / critical
  evidence: string;
  category: string; // quick_win / strategic_bet / nice_to_have
}

/** Parsed DISCOVERY.md data */
export interface DiscoveryData {
  suggestions: DiscoverySuggestion[];
  quickWins: DiscoverySuggestion[];
  strategicBets: DiscoverySuggestion[];
  niceToHaves: DiscoverySuggestion[];
  rawMarkdown: string;
}

export interface ProjectResearch {
  repo: string;
  research: ResearchData | null;
  discovery: DiscoveryData | null;
  loading: boolean;
  error: string | null;
}

export type MonitorStatus = "up" | "down" | "paused" | "pending";

export interface Monitor {
  id: string;
  name: string;
  url: string;
  status: MonitorStatus;
  uptimePct: number | null;
  lastCheckedAt: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ══════════════════════════════════════════
// AUDIT TAB TYPES
// ══════════════════════════════════════════

export interface AuditLastRun {
  timestamp: string;
  duration_seconds: number;
  cost_usd: number | null;
  total_findings: number;
  severity_counts: { critical: number; high: number; medium: number; low: number };
  gist_url: string | null;
  issues_created: number | null;
  issue_urls: string[] | null;
  verification: AuditVerificationSummary | null;
}

export interface AuditVerificationSummary {
  verified_at: string;
  confirmed: number;
  false_positive: number;
  uncertain: number;
  errors: number;
  /** Absent on legacy reports; treat undefined as 0. */
  not_a_bug?: number;
}

export interface AuditProjectStatus {
  name: string;
  path: string;
  repo: string;
  last_run: AuditLastRun | null;
  gpu_config: {
    max_price_per_hour: number;
    timeout_hours: number;
  };
}

export interface AuditRunStatus {
  state: "idle" | "running" | "completed" | "failed";
  stage: string | null;
  progress: number;
  message: string | null;
  started_at: string | null;
  error: string | null;
}

export interface AuditFinding {
  category?: "bug" | "security" | "business_logic" | "architecture" | "performance" | "data_integrity";
  severity: "critical" | "high" | "medium" | "low";
  source: "deterministic" | "llm" | "both";
  tool: string;
  file: string;
  line: number | null;
  function: string | null;
  description: string;
  recommendation: string;
  confidence: number | null;
}

export interface AuditFindings {
  project: string;
  timestamp: string;
  duration_seconds: number;
  cost_usd: number | null;
  stats: Record<string, number>;
  findings: AuditFinding[];
}

export interface GeneratedIssue {
  title: string;
  body: string;
  labels: string[];
  severity: "critical" | "high" | "medium" | "low";
  finding_index: number;
}

// Verification types
export type Verdict = "CONFIRMED" | "FALSE_POSITIVE" | "UNCERTAIN" | "NOT_A_BUG";

export interface VerificationResult {
  finding_index: number;
  verdict: Verdict;
  reason: string;
  code_snippet: string | null;
  file: string;
  line: number | null;
  verified_at: string;
  model: string;
  error: string | null;
}

// ══════════════════════════════════════════
// UX AUDIT TYPES
// ══════════════════════════════════════════

export interface UXAuditRunStatus {
  state: "idle" | "running" | "completed" | "failed" | "cancelled";
  stage?: string;
  progress: number;
  message: string;
  error: string | null;
}

export interface UXScreenshot {
  url: string;
  page_name: string;
  viewport: string;
  width: number;
  height: number;
  path: string;
}

export interface UXFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  source: string;
  tool: string;
  file: string;
  line: number | null;
  description: string;
  recommendation: string;
  confidence: number | null;
}

export interface UXAuditResults {
  project: string;
  production_url: string;
  total_findings: number;
  l1_findings: number;
  vision_findings: number;
  severity_counts: { critical: number; high: number; medium: number; low: number };
  findings: UXFinding[];
  screenshots: UXScreenshot[];
  screenshot_errors: string[];
  vision_errors: string[];
  l1_stats: Record<string, number>;
}

export interface VerificationReport {
  project: string;
  audit_timestamp: string;
  verified_at: string;
  model: string;
  total_findings: number;
  confirmed_count: number;
  false_positive_count: number;
  uncertain_count: number;
  error_count: number;
  /** Absent on legacy reports; treat undefined as 0. */
  not_a_bug_count?: number;
  results: VerificationResult[];
}

// ══════════════════════════════════════════
// SPECS TRACKING TYPES
// ══════════════════════════════════════════

export type SpecStatus = "draft" | "spec_ready" | "in_development" | "completed";

export interface EpicTask {
  number: string;      // "01", "38", etc.
  title: string;
  dependencies: string;
  size: string;        // S / M / L / XL
  repo: string;
}

export interface EpicData {
  id: string;          // "epic-003"
  title: string;
  prd: string;         // "PRD-003"
  milestone: string;
  deadline: string;
  epicStatus: string;  // "planning", "in-progress", "completed"
  priority: string;
  overview: string;
  tasks: EpicTask[];
}

export interface PrdData {
  id: string;          // "PRD-003"
  title: string;
  status: string;      // "approved", "draft"
  author: string;
  date: string;
  priority: string;
}

// ══════════════════════════════════════════
// QUALITY DASHBOARD TYPES
// ══════════════════════════════════════════

export interface QualitySnapshot {
  period_start: string;
  period_end: string;
  total_issues: number;
  merged_count: number;
  error_count: number;
  first_pass_success_rate: number;
  retry_rate: number;
  avg_finding_density: number;
  avg_duration_sec: number;
  error_recovery_rate: number;
  qa_pass_rate: number | null;
  rollback_rate: number;
  top_finding_categories: [string, number][];
  top_error_classes: [string, number][];
}

export type TrendDirection = "up" | "down" | "flat";

export interface QualityTrends {
  snapshots: QualitySnapshot[];
  trends: Record<string, TrendDirection>;
}

export interface QualityFindingsDistribution {
  categories: Record<string, number>;
  by_week: QualityFindingsWeek[];
}

export interface QualityFindingsWeek {
  period_start: string;
  categories: Record<string, number>;
}

export interface QualityErrorsDistribution {
  classes: Record<string, number>;
  by_week: QualityErrorsWeek[];
}

export interface QualityErrorsWeek {
  period_start: string;
  classes: Record<string, number>;
}

export type PendingChangeStatus = "pending" | "applied" | "rejected" | "rolled_back";

export interface PendingChange {
  id: string;
  created_at: string;
  retro_period: string;
  tier: number;
  target: string;
  change_type: string;
  content: string;
  rationale: string;
  confidence: number;
  status: PendingChangeStatus;
  applied_at: string | null;
  backup_path: string | null;
  pr_url: string | null;
  // Phase C/D audit fields (Phase F1 exposes them on the API response)
  scoped_projects: string[] | null;
  validation: Record<string, unknown> | null;
  rejection_reason: string | null;
}

export interface TuningApplyResult {
  status: string;
  pr_url: string | null;
}

export interface TuningActionResult {
  status: string;
}

// ── Phase F1 response types ──────────────────────────────────────────

export interface QualityConfig {
  retro_enabled: boolean;
  retro_mode: "reporting" | "auto_apply";
  auto_apply_lessons: boolean;
  auto_apply_min_confidence: number;
  auto_apply_cooldown_hours: number;
  kpi_degradation_threshold: number;
  retro_min_sample_size: number;
  lessons_max_lines: number;
  lessons_max_bytes: number;
  lessons_ttl_days: number;
  validate_numeric_claims: boolean;
  validation_tolerance: number;
  last_apply_at: string | null;
  cooldown_active: boolean;
  cooldown_remaining_hours: number;
}

export interface QualityConfigUpdate {
  retro_mode?: "reporting" | "auto_apply";
  auto_apply_lessons?: boolean;
  auto_apply_min_confidence?: number;
  auto_apply_cooldown_hours?: number;
  kpi_degradation_threshold?: number;
  lessons_max_lines?: number;
  lessons_max_bytes?: number;
  lessons_ttl_days?: number;
  validate_numeric_claims?: boolean;
  validation_tolerance?: number;
}

export interface LessonsFileEntry {
  project: string;
  filename: string;
  content: string;
  size_bytes: number;
  line_count: number;
  mtime: string | null;
}

export interface LessonsFileResponse {
  project: string;
  files: LessonsFileEntry[];
}

export interface ApplyPreview {
  change_id: string;
  targets: string[];
  scoped_projects: string[] | null;
  dedup_hit: boolean;
  validation: Record<string, unknown> | null;
  preview_diff: string;
  would_rotate: boolean;
  current_line_count: number;
}

export interface BulkRejectResult {
  rejected: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface RetroSummary {
  period: string;
  summary: string;
  patterns_count: number;
  recommendations_count: number;
  rule_changes_count: number;
}

export interface RetroDetail {
  period: string;
  summary: string;
  top_patterns: RetroPattern[];
  recommendations: string[];
  proposed_rule_changes: RetroRuleChange[];
  [key: string]: unknown;
}

export interface RetroPattern {
  pattern: string;
  count: number;
  examples: string[];
}

export type RuleChangeAction = "add" | "modify" | "remove";

export interface RetroRuleChange {
  rule: string;
  action: RuleChangeAction;
  rationale: string;
}

export interface RetroRunResult {
  status: string;
  period: string;
}

export interface SpecsProject {
  prd: PrdData;
  epics: EpicData[];
  /** Computed from epic statuses and linked issue states */
  computedStatus: SpecStatus;
  /** Total tasks across all epics */
  totalTasks: number;
  /** Tasks with closed linked issues */
  completedTasks: number;
}
