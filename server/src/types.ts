// Shared types — mirrored from ../src/types/index.ts
// Only the subset needed for GitHub data caching

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
  byDate: Record<string, number>;
  today: number;
  thisWeek: number;
  thisMonth: number;
  total84d: number;
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

export interface ProjectData {
  repo: string;
  client: string;
  phase: Phase;
  issues: Issue[];
  priorityCounts: Record<Priority, number>;
  progress: number;
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
  velocity7d: number;
  velocity14d: number;
  etaDays: number | null;
  etaDate: string | null;
  cycleTimeDays: number | null;
  commitActivity: CommitActivity;
}

export interface ProjectConfig {
  repo: string;
  client: string;
  owner: string;
}

export interface RepoInfo {
  lastCommitDate: string | null;
  description: string;
  milestones: Milestone[];
  commitActivity: CommitActivity;
  openIssueCount: number;
  closedIssueCount: number;
}
