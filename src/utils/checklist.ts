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

// Minimal shape check — turns opaque "Cannot read properties of undefined"
// crashes into a clear malformed-checklist error. The full type is enforced
// at compile time when the engine consumes the doc; this is just a runtime
// tripwire for top-level fields.
function validate(parsed: unknown): asserts parsed is ChecklistDocument {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("PROJECT_CHECKLIST.yaml: not an object");
  }
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.rules)) {
    throw new Error("PROJECT_CHECKLIST.yaml: malformed (no rules array)");
  }
  if (!p.settings || typeof p.settings !== "object") {
    throw new Error("PROJECT_CHECKLIST.yaml: malformed (no settings block)");
  }
  if (!p.severity_weights || typeof p.severity_weights !== "object") {
    throw new Error("PROJECT_CHECKLIST.yaml: malformed (no severity_weights)");
  }
  if (!p.project_classification || typeof p.project_classification !== "object") {
    throw new Error("PROJECT_CHECKLIST.yaml: malformed (no project_classification)");
  }
}

export async function loadChecklist(token: string, force = false): Promise<ChecklistDocument> {
  if (!force && cached) return cached.doc;
  const text = await readRepoFile(token, KNOWLEDGE_OWNER, KNOWLEDGE_REPO, CHECKLIST_PATH);
  const parsed = yaml.load(text);
  validate(parsed);
  cached = { doc: parsed, loaded_at: Date.now() };
  return parsed;
}

export function clearChecklistCache(): void {
  cached = null;
}
