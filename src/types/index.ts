export interface ProjectConfig {
  repo: string;
  client: string;
  owner: string;
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
}

export interface SummaryMetrics {
  totalIssues: number;
  todoCount: number;
  inProgressCount: number;
  reviewCount: number;
  doneCount: number;
  projectCount: number;
}

export interface Filters {
  project: string | null;
  priority: Priority | null;
  status: IssueStatus | null;
}
