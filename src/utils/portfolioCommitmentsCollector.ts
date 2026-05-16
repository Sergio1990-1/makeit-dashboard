/**
 * portfolioCommitmentsCollector — collects per-project overdue-commitment
 * counts into the map the portfolio grid (`ProjectsView` →
 * `ProjectScorecard`) feeds the "⏰ просроч." KPI (#462).
 *
 * Per-project overdue commitments are real but they are not in the
 * portfolio view's data model: deriving them needs each repo's
 * BRIEF `## Commitments` + `docs/commitments.yaml` (an async per-repo
 * fetch). Doing that for the whole portfolio on every render would be an
 * N+1 the Scorecard explicitly forbids. So collection is a single
 * render-path read:
 *
 *   `collectOverdueCommitmentCounts(repos)` — RENDER PATH, zero cost. A
 *   pure synchronous read of the count `useProjectHub` already persists
 *   per repo to sessionStorage (`makeit_commitments_overdue_{repo}`).
 *   Those entries are written for free as the user opens project hubs
 *   (`useProjectHub` resolves the overdue list and stores its `.length`).
 *   No network, no fetch — just `sessionStorage.getItem` per repo.
 *   Projects without a cached count simply don't contribute (the card
 *   stays at the 0 the caller passes for them — strictly better than the
 *   previous always-0-for-all, never a false signal). This mirrors the
 *   proven `portfolioHealthCollector` precedent (#456).
 *
 * `useProjectHub` does not export its cache-key constant (exporting it
 * would create an import cycle), so the read-only reader mirrors it here
 * (`makeit_commitments_overdue_{repo}` — the write key in
 * useProjectHub.ts, underscore separator to match useProjectHealth's
 * `SESSION_PREFIX` convention, NOT a colon). Kept as the single
 * mirror-point with a comment so a future rename has one place to update.
 */

/**
 * Hub per-project overdue-commitment-count cache-key prefix. Mirrors the
 * `sessionStorage.setItem` write key in useProjectHub.ts
 * (`makeit_commitments_overdue_`, underscore — NOT a colon); the hook
 * does not export it (an export would create an import cycle). If the
 * hook renames it, update here — these two strings MUST stay identical
 * or the portfolio silently ships always-0.
 */
const COMMITMENTS_OVERDUE_PREFIX = "makeit_commitments_overdue_";

function commitmentsCacheKey(repo: string): string {
  return `${COMMITMENTS_OVERDUE_PREFIX}${repo}`;
}

/**
 * Read-only peek at one project's cached overdue-commitment count.
 * Returns the integer count if a well-formed value is cached, else null.
 * Returns null for a missing / corrupt / non-integer / negative / NaN
 * entry so a bad cache degrades to "this project has no count yet" (card
 * shows 0) instead of throwing.
 */
function readOverdueCount(repo: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(commitmentsCacheKey(repo));
  } catch {
    return null;
  }
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * RENDER PATH — pure synchronous collection of whatever per-project
 * overdue-commitment counts the Hub already cached. One `sessionStorage`
 * read per repo, no network. Returns a `repo → count` map; repos with no
 * cached count are simply absent from the map (caller passes `0` for
 * those, so the Scorecard renders its existing 0). An all-empty portfolio
 * (no Hub visited yet) yields an empty map, never a crash or false count.
 */
export function collectOverdueCommitmentCounts(
  repos: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const repo of repos) {
    const count = readOverdueCount(repo);
    if (count !== null) out[repo] = count;
  }
  return out;
}
