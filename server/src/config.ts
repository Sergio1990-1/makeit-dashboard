import type { ProjectConfig } from "./types";

// Environment variables
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const GITHUB_OWNER = process.env.GITHUB_OWNER || "Sergio1990-1";
export const GITHUB_PROJECT_NUMBER = parseInt(process.env.GITHUB_PROJECT_NUMBER || "1", 10);
export const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || "300000", 10); // 5 min default
export const PORT = parseInt(process.env.PORT || "8767", 10);
export const SYNC_API_KEY = process.env.SYNC_API_KEY || ""; // empty = no auth required

// Project list — MUST stay in sync with ../src/utils/config.ts DEFAULT_PROJECTS.
// If you add/remove a project here, update the frontend list too.
export const PROJECTS: ProjectConfig[] = [
  { repo: "Sewing-ERP", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "mankassa-app", client: "Сергей", owner: GITHUB_OWNER },
  { repo: "solotax-kg", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "Business-News", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "Beer_bot", client: "Тенгри Бир", owner: GITHUB_OWNER },
  { repo: "Uchet_bot", client: "Кристина", owner: GITHUB_OWNER },
  { repo: "quiet-walls", client: "Тихие Стены", owner: GITHUB_OWNER },
  { repo: "moliyakg", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "MyMoney", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "makeit-auditor", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "makeit-pipeline", client: "Свой проект", owner: GITHUB_OWNER },
  { repo: "makeit-dashboard", client: "Свой проект", owner: GITHUB_OWNER },
];
