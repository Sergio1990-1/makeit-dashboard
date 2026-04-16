import type { ProjectConfig } from "../types";

export const GITHUB_OWNER = "Sergio1990-1";
export const GITHUB_PROJECT_NUMBER = 1;

// Default project config — finances are overridden by localStorage.
// MUST stay in sync with server/src/config.ts PROJECTS list.
export const DEFAULT_PROJECTS: ProjectConfig[] = [
  { repo: "Sewing-ERP", client: "Свой проект", owner: GITHUB_OWNER, budget: 20000, paid: 15000 },
  { repo: "mankassa-app", client: "Сергей", owner: GITHUB_OWNER, budget: 13500, paid: 3000 },
  { repo: "solotax-kg", client: "Свой проект", owner: GITHUB_OWNER, budget: 12000, paid: 4000 },
  { repo: "Business-News", client: "Свой проект", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "Beer_bot", client: "Тенгри Бир", owner: GITHUB_OWNER, budget: 1000, paid: 1000 },
  { repo: "Uchet_bot", client: "Кристина", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "quiet-walls", client: "Тихие Стены", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "moliyakg", client: "Свой проект", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "MyMoney", client: "Свой проект", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "makeit-auditor", client: "Свой проект", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "makeit-pipeline", client: "Свой проект", owner: GITHUB_OWNER, budget: 0, paid: 0 },
  { repo: "makeit-dashboard", client: "Свой проект", owner: GITHUB_OWNER, budget: 0, paid: 0 },
];

const FINANCE_KEY = "makeit_finances";

interface FinanceData {
  [repo: string]: { budget: number; paid: number };
}

export function loadFinances(): FinanceData {
  try {
    const raw = localStorage.getItem(FINANCE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFinances(data: FinanceData): void {
  localStorage.setItem(FINANCE_KEY, JSON.stringify(data));
}

export function getProjects(): ProjectConfig[] {
  const finances = loadFinances();
  return DEFAULT_PROJECTS.map((p) => {
    const f = finances[p.repo];
    return f ? { ...p, budget: f.budget, paid: f.paid } : p;
  });
}

export const PROJECTS = getProjects();

export function updateProjectFinance(repo: string, budget: number, paid: number): void {
  const finances = loadFinances();
  finances[repo] = { budget, paid };
  saveFinances(finances);
}

export function getProjectFinance(repo: string): { budget: number; paid: number } | null {
  const finances = loadFinances();
  return finances[repo] ?? null;
}

// Token management
export function getToken(): string | null {
  return localStorage.getItem("github_token");
}

export function setToken(token: string): void {
  localStorage.setItem("github_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("github_token");
}

// Claude API key
export function getClaudeKey(): string | null {
  return localStorage.getItem("claude_api_key");
}

export function setClaudeKey(key: string): void {
  localStorage.setItem("claude_api_key", key);
}

export function clearClaudeKey(): void {
  localStorage.removeItem("claude_api_key");
}

// Cloudflare Worker URL (proxies Better Stack API to avoid CORS)
export function getWorkerUrl(): string | null {
  return localStorage.getItem("betterstack_worker_url");
}

export function setWorkerUrl(url: string): void {
  localStorage.setItem("betterstack_worker_url", url);
}

export function clearWorkerUrl(): void {
  localStorage.removeItem("betterstack_worker_url");
}

// SPA authentication
const AUTH_KEY = "makeit_auth";

export function getAuth(): boolean {
  return localStorage.getItem(AUTH_KEY) === "authenticated";
}

export function setAuth(): void {
  localStorage.setItem(AUTH_KEY, "authenticated");
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

// Pipeline API base URL (shared by pipeline.ts, quality.ts, debate.ts, transcript.ts)
export const PIPELINE_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { PIPELINE_URL?: string } }).__MAKEIT_CONFIG__?.PIPELINE_URL
  ?? "http://127.0.0.1:8766";

// Map repo name → keywords to match against monitor name/url
export const MONITOR_MATCH: Record<string, string[]> = {
  "Sewing-ERP": ["8001", "sewing"],
  "mankassa-app": ["8004", "mankassa"],
  "Beer_bot": ["8003", "beer"],
  "Uchet_bot": ["8002", "uchet"],
  "solotax-kg": ["solotax", "api.solotax"],
  "Business-News": ["8000", "biznews", "content"],
  "moliyakg": ["moliya", "8005"],
  "MyMoney": ["3010", "mymoney"],
};
