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

export type TabId = "projects" | "milestones" | "done" | "uptime";

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
