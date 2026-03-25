import type { ProjectConfig } from "../types";

export const GITHUB_OWNER = "Sergio1990-1";
export const GITHUB_PROJECT_NUMBER = 1;

export const PROJECTS: ProjectConfig[] = [
  { repo: "Sewing-ERP", client: "PINS", owner: GITHUB_OWNER },
  { repo: "mankassa-app", client: "WineProfi", owner: GITHUB_OWNER },
  { repo: "solotax-kg", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "biznews-kg", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "Beer_bot", client: "Тенгри Бир", owner: GITHUB_OWNER },
  { repo: "uchet-bot", client: "Набо", owner: GITHUB_OWNER },
];

export function getToken(): string | null {
  return localStorage.getItem("github_token");
}

export function setToken(token: string): void {
  localStorage.setItem("github_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("github_token");
}
