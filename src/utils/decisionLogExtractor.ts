/**
 * Decision Log extractor (Epic-011 Task-01, FR-23, FR-24).
 *
 * Pure extraction layer: takes a BRIEF.md string and a list of recent
 * commits, produces a chronological `Decision[]`.
 *
 * Two sources are merged:
 *   1. **Brief** — bullet items under `## Decisions` / `### Decisions`
 *      headings in the project's BRIEF.md (the Pipeline-generated
 *      transcript synthesis). Each bullet becomes one Decision.
 *   2. **Commits** — conventional commits whose subject starts with
 *      `decide:` or `accept:` (case-insensitive). `feat:`, `fix:`,
 *      `chore:`, `docs:`, etc. are intentionally ignored — those
 *      describe what shipped, not what was decided.
 *
 * Sort order: newest first. Items without a usable date sort last
 * (rather than crash) so partial data never blocks render.
 */

import type { Decision } from "../types/hub";
import type { CommitInfo } from "./github-contents";

/**
 * Provenance tag attached to each `Decision.source`. Kept as a
 * three-value union so the read-only UI can render a stable badge per
 * row without a per-source string-matching.
 *
 * Stored at the start of `Decision.source` followed by `:` and a
 * source-specific identifier (sha, line index, doc id) — e.g.
 * `commit:abc123ef`. UI splits on the first `:` to render the tag
 * separately from the identifier.
 */
export type DecisionSourceTag = "brief" | "commit" | "adr";

/** Prefixes (case-insensitive) we treat as decision/accept commits. */
const DECISION_COMMIT_PREFIXES = ["decide:", "accept:"];

/**
 * Conventional commit prefixes that look like they could be decisions
 * but explicitly aren't. Documented here to make the contract obvious
 * — the implementation just matches `DECISION_COMMIT_PREFIXES`, but
 * anyone updating that list should remember why these are out.
 */
// const _IGNORED_PREFIXES = ["feat:", "fix:", "chore:", "docs:", "style:", "refactor:", "test:", "build:", "ci:", "perf:"];

/**
 * Match a section heading in a BRIEF.md. Accepts both `##` and `###`,
 * with optional leading emoji/punctuation and optional trailing colon —
 * `## 📋 Decisions:` and `### Decisions` both match.
 *
 * The `Decisions?` token must be a STANDALONE heading, not a substring
 * inside a larger phrase. So `## Past decisions we regret` and
 * `## Pricing decisions matter` correctly DO NOT match — the heading
 * must end (modulo trailing punctuation/whitespace) right after the
 * keyword. Without this guard we'd scrape bullets out of unrelated
 * sections.
 *
 * The leading-decoration class `[^\w\n]*` allows emoji or punctuation
 * (e.g. `## 📋 Decisions`) but not letters/digits/underscore — those
 * would change the heading's meaning. Anchored via `/m`.
 */
const DECISION_HEADING_RE = /^#{2,3}[^\S\n]+[^\w\n]*\s*decisions?\s*[:.]?\s*$/im;

/** Match the next heading (any level) — we use it to know when to stop. */
const NEXT_HEADING_RE = /^#{1,6}\s+/m;

/** Match a single bullet line (`-`, `*`, or numbered). */
const BULLET_RE = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/gm;

/** Strip leading bold marker from a bullet (`**foo** — bar`). */
function stripLeadingBold(line: string): { lead: string | null; rest: string } {
  const m = line.match(/^\*\*(.+?)\*\*\s*[—\-:]\s*(.*)$/);
  if (m === null) return { lead: null, rest: line };
  return { lead: m[1], rest: m[2] };
}

/**
 * Parse the Decisions section out of a BRIEF.md. Returns the bullet
 * texts in source order; an empty array when no section exists or when
 * the section is empty.
 */
function extractBriefBullets(briefMd: string): string[] {
  const headingMatch = briefMd.match(DECISION_HEADING_RE);
  if (headingMatch === null || headingMatch.index === undefined) return [];
  // The section runs from the line *after* the heading until the next
  // heading or EOF. `+ headingMatch[0].length` skips the heading line.
  const startIdx = headingMatch.index + headingMatch[0].length;
  const after = briefMd.slice(startIdx);
  const nextMatch = after.match(NEXT_HEADING_RE);
  const sectionText = nextMatch && nextMatch.index !== undefined
    ? after.slice(0, nextMatch.index)
    : after;
  const bullets: string[] = [];
  // `BULLET_RE` is `/g` — we have to reset `lastIndex` because reusing
  // a global regex carries state across calls and would silently skip
  // matches in the same module on the next invocation.
  BULLET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BULLET_RE.exec(sectionText)) !== null) {
    const text = m[1].trim();
    if (text.length > 0) bullets.push(text);
  }
  return bullets;
}

/**
 * Try to pull an ISO date out of the BRIEF.md top matter.
 *
 * Two recognised producers:
 *   1. YAML front-matter (`---\ndate: 2026-05-01\n…`) at the very top.
 *   2. An H1 starting with the date — `# 2026-05-01 — Title`.
 *
 * Both are anchored: the date must appear in `date:` field or right
 * after `#`, NOT anywhere in the body. Without anchoring we'd pick up
 * dates from quoted dialogue ("Met with client 2024-03-01") and
 * mis-stamp every decision with that date.
 *
 * Returns `null` when neither pattern matches — decisions fall back
 * to undated and sort to the end of the list.
 */
function extractBriefDate(briefMd: string): string | null {
  // Front-matter form: `date: YYYY-MM-DD` on its own line within the
  // first 2 KiB. `^\s*date:` is anchored to start-of-line via `/m`.
  const head = briefMd.slice(0, 2048);
  const fm = head.match(/^\s*date:\s*(\d{4}-\d{2}-\d{2})\s*$/im);
  if (fm) return fm[1];

  // H1 form: `# YYYY-MM-DD …` — must start at column 0 (no leading
  // whitespace), and the date must be the very first token after `#`.
  const h1 = head.match(/^#\s+(\d{4}-\d{2}-\d{2})\b/m);
  if (h1) return h1[1];

  return null;
}

/** True when a commit subject is a decision/accept commit. */
function isDecisionCommit(subject: string): boolean {
  const lc = subject.toLowerCase();
  return DECISION_COMMIT_PREFIXES.some((p) => lc.startsWith(p));
}

/** Strip the conventional prefix (`decide:` / `accept:`) from a subject. */
function stripDecisionPrefix(subject: string): string {
  const colon = subject.indexOf(":");
  if (colon < 0) return subject;
  return subject.slice(colon + 1).trim();
}

/**
 * Extract decisions from a BRIEF.md (may be `null`) and a list of
 * recent commits. Result is sorted by date descending; entries with
 * no parseable date sort to the end.
 *
 * Pure: no I/O, no globals, deterministic for the same inputs. Safe
 * to test with string fixtures.
 */
export function extractDecisions(
  briefMd: string | null,
  commits: CommitInfo[],
): Decision[] {
  const out: Decision[] = [];

  // ── BRIEF source ─────────────────────────────────────────────────
  if (briefMd !== null && briefMd.length > 0) {
    const briefDate = extractBriefDate(briefMd) ?? "";
    const bullets = extractBriefBullets(briefMd);
    bullets.forEach((bullet, idx) => {
      const { lead, rest } = stripLeadingBold(bullet);
      // Prefer the bold lead as the title (clearer in the UI), keep
      // the rest as the description. Fall back to the whole bullet.
      const title = lead ?? rest;
      const description = lead ? rest : undefined;
      out.push({
        // Stable id so React keys don't churn between renders for the
        // same brief text. Index alone is unique within a single brief
        // — earlier we suffixed `title.slice(0,40)` for human-readability
        // but two bullets sharing a 40-char title prefix would collide
        // and React would reuse the wrong DOM node.
        id: `brief:${idx}`,
        date: briefDate,
        title: title.slice(0, 200),
        description: description && description.length > 0 ? description : undefined,
        source: "brief",
      });
    });
  }

  // ── Commit source ────────────────────────────────────────────────
  for (const c of commits) {
    if (!isDecisionCommit(c.subject)) continue;
    const cleanSubject = stripDecisionPrefix(c.subject);
    if (cleanSubject.length === 0) continue;
    out.push({
      id: `commit:${c.sha}`,
      date: c.date,
      title: cleanSubject.slice(0, 200),
      description: c.author ? `by ${c.author}` : undefined,
      source: c.url ? `commit:${c.url}` : "commit",
    });
  }

  // ── Sort: newest first; undated to the end ───────────────────────
  out.sort((a, b) => {
    const ad = a.date && a.date.length > 0 ? Date.parse(a.date) : NaN;
    const bd = b.date && b.date.length > 0 ? Date.parse(b.date) : NaN;
    const aValid = !Number.isNaN(ad);
    const bValid = !Number.isNaN(bd);
    if (aValid && bValid) return bd - ad;
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });

  return out;
}
