import yaml from "js-yaml";
import { readRepoFile } from "./github-actions";
import type { ChecklistDocument } from "../types/health";

const KNOWLEDGE_OWNER = "Sergio1990-1";
const KNOWLEDGE_REPO = "makeit-knowledge";
const CHECKLIST_PATH = "Skills/PROJECT_CHECKLIST.yaml";

// Cache the parsed checklist for the lifetime of the tab — it changes only
// when someone merges a PR to makeit-knowledge, and the user can hard-refresh
// the page if they want to pick that up immediately.
let cached: { doc: ChecklistDocument; loaded_at: number } | null = null;

export async function loadChecklist(token: string, force = false): Promise<ChecklistDocument> {
  if (!force && cached) return cached.doc;
  const text = await readRepoFile(token, KNOWLEDGE_OWNER, KNOWLEDGE_REPO, CHECKLIST_PATH);
  const parsed = yaml.load(text) as ChecklistDocument;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error("PROJECT_CHECKLIST.yaml: malformed (no rules array)");
  }
  cached = { doc: parsed, loaded_at: Date.now() };
  return parsed;
}

export function clearChecklistCache(): void {
  cached = null;
}
