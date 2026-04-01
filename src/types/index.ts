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

export type TabId = "dashboard" | "projects" | "milestones" | "done" | "uptime" | "audit";

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
