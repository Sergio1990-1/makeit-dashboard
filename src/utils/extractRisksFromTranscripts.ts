/**
 * Risk extraction from transcripts (Epic-011 Task-09, PRD-008 FR-30).
 *
 * `extractRisks(repo)` pulls the BRIEF.md of the project's last 5 *done*
 * transcripts, hands them to Claude Haiku, and returns a structured list
 * of proposed risks for the operator to approve / reject / edit in the
 * Risk Register UI.
 *
 * Design notes:
 *  - Reuses the existing transcript client (`transcript.ts`) and the
 *    Claude helper (`callClaudeWithTool` in `claude.ts`). No API key,
 *    endpoint or model id is hardcoded here — the key comes from
 *    `getClaudeKey()` (localStorage) and the budget guard / model
 *    downgrade live inside `callClaudeWithTool`.
 *  - The repo↔transcript match mirrors `customerHealthScore.ts` so the
 *    same "owner/Repo" ↔ free-text project-context heuristic is used
 *    everywhere (one source of truth for that fuzzy join).
 *  - A forced tool call is used instead of free-form JSON: Anthropic
 *    validates the model output against `input_schema`, so we get a
 *    typed payload instead of regex-scraping a fenced code block. We
 *    still defensively re-validate every field (an LLM can return an
 *    out-of-enum severity, a number where a string is expected, etc.)
 *    and silently drop unusable rows rather than throwing.
 *  - Failure model: every external call (transcript list, transcript
 *    body, Claude) is wrapped. No key / no transcripts / network error /
 *    malformed reply all degrade to `[]` — the function never throws so
 *    the UI can show a graceful empty state.
 */

import {
  fetchTranscriptList,
  fetchTranscriptResult,
  type TranscriptListItem,
} from "./transcript";
import { callClaudeWithTool } from "./claude";
import { getClaudeKey } from "./config";
import type { RiskProbability, RiskSeverity } from "../types/hub";

/** How many of the most recent *done* transcripts to feed the model. */
const MAX_TRANSCRIPTS = 5;

/** Per-transcript BRIEF char cap so the prompt size stays bounded. */
const MAX_BRIEF_CHARS = 6000;

/** Haiku is appropriate here (browser-side, cheap, structured output). */
const RISK_MODEL = "claude-haiku-4-5-20251001" as const;

const SEVERITIES: readonly RiskSeverity[] = ["low", "med", "high", "critical"];
const PROBABILITIES: readonly RiskProbability[] = ["low", "med", "high"];

/**
 * One model-proposed risk, pre-validated. `source` is the transcript id
 * the risk was derived from (kept for traceability in the approve UI;
 * the persisted `Risk.source` enum value is set to `transcript-extracted`
 * by the caller when the operator approves).
 */
export interface ProposedRisk {
  title: string;
  severity: RiskSeverity;
  probability: RiskProbability;
  mitigation: string;
  /** Transcript task id the risk was extracted from (provenance). */
  source: string;
}

const RISK_TOOL = {
  name: "report_risks",
  description:
    "Сообщить список проектных рисков, извлечённых из транскриптов созвонов. " +
    "Возвращай только реальные риски проекта (сроки, бюджет, технический долг, " +
    "зависимость от внешних сторон, неясные требования, риск оттока клиента и т.п.), " +
    "не общие наблюдения. Если рисков нет — верни пустой массив.",
  input_schema: {
    type: "object" as const,
    properties: {
      risks: {
        type: "array",
        description:
          "Список извлечённых рисков. Пустой массив, если рисков не обнаружено.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Краткая формулировка риска (одно предложение).",
            },
            severity: {
              type: "string",
              enum: ["low", "med", "high", "critical"],
              description: "Серьёзность последствий, если риск реализуется.",
            },
            probability: {
              type: "string",
              enum: ["low", "med", "high"],
              description: "Вероятность того, что риск реализуется.",
            },
            mitigation: {
              type: "string",
              description:
                "Предлагаемая мера по снижению риска (может быть пустой строкой).",
            },
            transcript_index: {
              type: "number",
              description:
                "Номер транскрипта (1-based), из которого извлечён риск, как указано во входных данных.",
            },
          },
          required: ["title", "severity", "probability", "transcript_index"],
        },
      },
    },
    required: ["risks"],
  },
};

const RISK_SYSTEM =
  "Ты — технический директор, который вычитывает транскрипты созвонов с клиентом " +
  "и фиксирует проектные риски. Извлекай только конкретные риски проекта, а не " +
  "общие рассуждения. Для каждого риска укажи серьёзность, вероятность и, если " +
  "возможно, меру снижения. Не выдумывай риски, которых нет в тексте. " +
  "Сомневаешься, риск это или нет — не включай его.";

/**
 * Loose repo↔transcript match. Mirrors `customerHealthScore.ts`:
 * transcripts carry a free-text `project` context (the same field the
 * Transcripts tab filters on); match case-insensitively on the repo slug
 * appearing in that context (or vice-versa) so `owner/Repo` and `Repo`
 * both resolve.
 */
function transcriptMatchesRepo(
  item: TranscriptListItem,
  repo: string,
): boolean {
  const slug = repo.includes("/") ? repo.split("/")[1] : repo;
  const proj = (item.project || "").toLowerCase();
  if (proj.length === 0) return false;
  const needle = slug.toLowerCase();
  return proj.includes(needle) || needle.includes(proj);
}

/** ISO timestamp → epoch ms, or `NaN` when unparseable. */
function tsOf(iso: string): number {
  return Date.parse(iso);
}

/** Trim an arbitrary value to a string (tolerates null/number/missing). */
function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/** Coerce an arbitrary value to a valid enum member, or `null`. */
function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

interface RawRisk {
  title?: unknown;
  severity?: unknown;
  probability?: unknown;
  mitigation?: unknown;
  transcript_index?: unknown;
}

interface RiskToolResult {
  risks?: unknown;
}

/**
 * Normalise one raw model row into a `ProposedRisk`, or `null` when the
 * row is unusable (no title, or an out-of-enum severity/probability we
 * can't safely guess). We never trust the model payload — even with a
 * forced tool call Anthropic only loosely validates, so a missing field
 * or a hallucinated enum is possible.
 */
function normaliseProposed(
  raw: RawRisk,
  transcripts: { id: string }[],
): ProposedRisk | null {
  const title = asString(raw.title).trim();
  if (title === "") return null;

  const severity = coerceEnum<RiskSeverity>(raw.severity, SEVERITIES);
  const probability = coerceEnum<RiskProbability>(
    raw.probability,
    PROBABILITIES,
  );
  // A risk with an uninterpretable severity/probability is dropped
  // rather than silently defaulted — the operator should not approve a
  // risk whose level the model never actually expressed.
  if (severity === null || probability === null) return null;

  // `transcript_index` is 1-based in the prompt. Map it back to a task
  // id for provenance; fall back to the first transcript if the model
  // returned an out-of-range index (still a real transcript id).
  const idxRaw = raw.transcript_index;
  const idx =
    typeof idxRaw === "number" && Number.isFinite(idxRaw)
      ? Math.trunc(idxRaw) - 1
      : -1;
  const source =
    idx >= 0 && idx < transcripts.length
      ? transcripts[idx].id
      : (transcripts[0]?.id ?? "");

  return {
    title,
    severity,
    probability,
    mitigation: asString(raw.mitigation).trim(),
    source,
  };
}

/**
 * Extract proposed risks from the project's most recent transcripts.
 *
 * Returns `[]` (never throws) when: no Claude key is set, the transcript
 * service is unreachable, the project has no usable transcripts, the
 * Claude call fails / is budget-stopped, or the model returns an
 * unparseable payload. The caller treats `[]` as the graceful empty
 * state.
 */
export async function extractRisks(repo: string): Promise<ProposedRisk[]> {
  const apiKey = getClaudeKey();
  if (!apiKey || !apiKey.trim()) return [];

  let list: TranscriptListItem[];
  try {
    list = await fetchTranscriptList();
  } catch {
    return [];
  }

  const recentDone = list
    .filter((i) => transcriptMatchesRepo(i, repo))
    .filter((i) => i.status === "done")
    .filter((i) => Number.isFinite(tsOf(i.created_at)))
    .sort((a, b) => tsOf(b.created_at) - tsOf(a.created_at))
    .slice(0, MAX_TRANSCRIPTS);

  if (recentDone.length === 0) return [];

  // Fetch each BRIEF; skip the ones we can't load (others may work).
  const transcripts: { id: string; brief: string }[] = [];
  for (const item of recentDone) {
    try {
      const res = await fetchTranscriptResult(item.task_id);
      const brief = (res.brief || "").trim();
      if (brief.length > 0) {
        transcripts.push({ id: item.task_id, brief });
      }
    } catch {
      // Skip an unreadable transcript.
    }
  }
  if (transcripts.length === 0) return [];

  const userMessage = transcripts
    .map(
      (t, i) =>
        `=== Транскрипт ${i + 1} (id: ${t.id}) ===\n${t.brief.slice(0, MAX_BRIEF_CHARS)}`,
    )
    .join("\n\n");

  let result: RiskToolResult;
  try {
    result = await callClaudeWithTool<RiskToolResult>(
      apiKey,
      RISK_SYSTEM,
      `Извлеки проектные риски из ${transcripts.length} транскрипт(ов) ниже. ` +
        `Для каждого риска укажи transcript_index (1-based) того транскрипта, ` +
        `из которого он извлечён.\n\n${userMessage}`,
      RISK_TOOL,
      RISK_MODEL,
      2048,
      "other",
    );
  } catch {
    // No key / budget hard-stop / network / model-didn't-call-tool.
    return [];
  }

  const rawList = Array.isArray(result.risks) ? result.risks : [];
  const out: ProposedRisk[] = [];
  for (const raw of rawList) {
    if (raw && typeof raw === "object") {
      const norm = normaliseProposed(raw as RawRisk, transcripts);
      if (norm) out.push(norm);
    }
  }
  return out;
}
