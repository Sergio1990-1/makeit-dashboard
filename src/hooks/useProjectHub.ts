import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectHealth } from "./useProjectHealth";
import type { ProjectData } from "../types";
import type {
  CustomerHealthScore,
  DigestEntry,
  HubTab,
  NextBestAction,
  OnboardingReport,
  ProjectHubData,
  Risk,
} from "../types/hub";
import {
  listRecentCommits,
  readMarkdown,
  readYaml,
  resolveRepoSlug,
  type CommitInfo,
} from "../utils/github-contents";
import {
  parseRisksFile,
  RISKS_PATH,
  type RisksFile,
  sortBySeverityDesc,
} from "../utils/risksRegister";
import {
  type CommitmentsYaml,
  extractCommitments,
} from "../utils/commitmentsExtractor";
import { extractDecisions } from "../utils/decisionLogExtractor";
import { aggregatePulse } from "../utils/activityPulseAggregator";
import { unreadCount } from "../utils/lastVisitedStore";
import {
  computeDora,
  type DoraMetricsResult,
  type DoraPullRequest,
} from "../utils/doraCalculator";
import { listMergedPRsInWindow } from "../utils/github-actions";
import { currentWeekKey, loadDigest } from "../utils/weeklyDigestGenerator";
import {
  computeHealth,
  type CustomerHealthResult,
} from "../utils/customerHealthScore";
import { isOnboardingRuleId } from "../utils/onboardingReadinessRules";
import {
  computeProjectNBA,
  type NbaAction,
} from "../utils/nextBestActionEngine";
import {
  getClaudeKey,
  getProjectFinance,
  getToken,
} from "../utils/config";

// Stable empty stubs so consumers can rely on reference equality. The Hub
// surfaces (Overview, Activity, etc.) render empty states from these when a
// producer has nothing yet.
const EMPTY_DECISIONS: ProjectHubData["decisions"] = [];
const EMPTY_RISKS: ProjectHubData["risks"] = [];
const EMPTY_COMMITMENTS: ProjectHubData["commitments"] = [];
const EMPTY_RENEWALS: ProjectHubData["renewals"] = [];
const EMPTY_PULSE: ProjectHubData["pulse"] = [];
const EMPTY_NBA: ProjectHubData["nba"] = [];
const EMPTY_ONBOARDING: OnboardingReport = { completed: 0, total: 0, missing: [] };

/** Sliding window (days) the Hub computes DORA over — mirrors the
 *  calculator default; kept explicit so the value is visible here. */
const DORA_WINDOW_DAYS = 30;

/**
 * Fetch merged PRs in the DORA window and map to the calculator's shape
 * (#405). Best-effort: no GitHub token or any API failure → `[]`, so DORA
 * Lead Time degrades to an honest `n/a` dash rather than a fabricated 0h.
 * `created_at` rides along in the existing `pulls` list payload — no extra
 * per-PR request.
 */
async function fetchDoraPRs(repo: string): Promise<DoraPullRequest[]> {
  const token = getToken();
  if (!token) return [];
  const [owner, name] = resolveRepoSlug(repo).split("/");
  try {
    const prs = await listMergedPRsInWindow(
      token,
      owner,
      name,
      DORA_WINDOW_DAYS,
    );
    return prs.map((pr) => ({
      createdAt: pr.created_at,
      mergedAt: pr.merged_at,
    }));
  } catch {
    return [];
  }
}

// ── Risk Register read (Epic-011 Task-03 → Hub Overview wiring, #450) ──
// The Overview "Риски — топ-3" card must show the SAME first three rows
// the DecisionsRisks tab's RiskRegisterTable renders. Both now share the
// single read model in `utils/risksRegister` (parse/normalise/sort), so
// the top-3 can never drift from the register's row order (#467). The
// `extractRisks` path is a separate Claude-powered *write* flow that
// only feeds the approval modal — it never sources the rendered list.

/** How many top risks the Overview "Риски — топ-3" card shows. */
const RISKS_TOP_N = 3;

/**
 * Read the project's `docs/risks.yaml`, normalise + severity-desc sort
 * exactly like RiskRegisterTable, and return the top-N. Best-effort:
 *  - file absent (`readYaml` → null on 404) → `[]`, never an error;
 *  - corrupt yaml (`readYaml` throws on parse) is swallowed → `[]`,
 *    so a single bad register file degrades this section alone and
 *    never crashes the rest of the Hub (the register tab still
 *    surfaces the parse error with its own retry affordance).
 */
async function fetchTopRisks(repo: string): Promise<Risk[]> {
  try {
    const res = await readYaml<RisksFile>(repo, RISKS_PATH);
    if (res === null) return [];
    return sortBySeverityDesc(parseRisksFile(res.data)).slice(0, RISKS_TOP_N);
  } catch {
    return [];
  }
}

// ── Commitments read (Epic-011 Task-02 → Hub Overview wiring, #451) ──
// The Overview "Обещания — топ-3" card must show the SAME first three
// rows the DecisionsRisks tab's CommitmentsTable renders. Both go
// through the single `extractCommitments` producer (BRIEF `## Commitments`
// merged with `docs/commitments.yaml`, dedup, derived `overdue`, and the
// canonical sort: overdue → open-by-due-asc → done, undated last), so
// the top-3 can never drift from the table's row order. Works from the
// BRIEF section alone even before `docs/commitments.yaml` is adopted.

/** Path of the CRUD-managed commitments file (mirrors CommitmentsTable). */
const COMMITMENTS_PATH = "docs/commitments.yaml";

/** How many top commitments the Overview "Обещания — топ-3" card shows. */
const COMMITMENTS_TOP_N = 3;

/**
 * Read the project's `docs/commitments.yaml`. Best-effort, exactly like
 * `fetchTopRisks`:
 *  - file absent (`readYaml` → null on 404) → `null`, never an error;
 *  - corrupt yaml (`readYaml` throws on parse) is swallowed → `null`,
 *    so a single bad file degrades this section alone and never crashes
 *    the rest of the Hub (the Commitments tab still surfaces the parse
 *    error with its own retry affordance).
 * The BRIEF↔yaml merge + top-N slice happens in a derived `useMemo`
 * (next to `decisions`), since `briefMd` resolves alongside this read.
 */
async function fetchCommitmentsYaml(
  repo: string,
): Promise<CommitmentsYaml> {
  try {
    const res = await readYaml<CommitmentsYaml>(repo, COMMITMENTS_PATH);
    return res?.data ?? null;
  } catch {
    return null;
  }
}

// ── Activity Pulse read (Epic-011 Task-06/07 → Hub Overview wiring, #452) ──
// The Overview "Pulse" block and the header inbox badge must show the SAME
// unified timeline the Activity tab renders. Both go through the single
// `aggregatePulse` producer (GitHub events + pipeline + transcripts + audit,
// deduped, newest-first), so the Overview card can never drift from the
// Activity tab. `aggregatePulse` owns its own 5-min sessionStorage cache,
// so reading it here as well as in ActivityTab is one shared cached read,
// not a duplicate fetch.

/** Pulse lookback window (days) — matches ActivityTab's `PULSE_WINDOW_DAYS`
 *  and the aggregator's own 30-day floor; kept explicit, not a magic `""`. */
const PULSE_WINDOW_DAYS = 30;

/**
 * Aggregate the project's activity timeline. Best-effort, exactly like
 * `fetchTopRisks` / `fetchCommitmentsYaml`: `aggregatePulse` never throws
 * by contract (a failing source degrades to empty), but it is still
 * wrapped so a rejected promise can't escape — any failure collapses to
 * `[]`, so a single dead source (e.g. Pipeline Mac offline) degrades the
 * Pulse block alone and never crashes the rest of the Hub. The lookback
 * mirrors ActivityTab's exact call so the same cache entry is reused.
 */
async function fetchPulse(repo: string): Promise<ProjectHubData["pulse"]> {
  try {
    const since = new Date(
      Date.now() - PULSE_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    return await aggregatePulse(repo, since);
  } catch {
    return [];
  }
}

/**
 * Adapt the NBA engine's rich `NbaAction` (`title / rationale / severity /
 * link`) to the Hub's lighter `NextBestAction` (`text / reason`). Per the
 * engine's own contract this mapping deliberately lives with the consumer,
 * not the engine, so the engine stays decoupled from the Hub aggregate.
 * `targetTab` is intentionally left undefined — the engine produces deep
 * links, not Hub-tab ids; OverviewTab falls back to the Activity tab.
 */
function toNextBestAction(a: NbaAction): NextBestAction {
  return {
    id: a.id,
    text: a.title,
    reason: a.rationale,
  };
}

/**
 * Derive the customer-health gauge tier from the blended score, matching
 * `CustomerHealthScore` in types/hub.ts (0–40 critical, 40–70 warning,
 * 70–100 good). `'n/a'` (no recent transcript) maps to `critical` so the
 * gauge surfaces the no-data zone rather than a misleading green.
 */
function healthTier(score: number | "n/a"): CustomerHealthScore["tier"] {
  if (score === "n/a") return "critical";
  if (score < 40) return "critical";
  if (score < 70) return "warning";
  return "good";
}

/** Map the util's `CustomerHealthResult` onto the Hub's
 *  `CustomerHealthScore` (adds the derived `tier`, renames the
 *  timestamp). The two shapes are deliberately distinct: the util owns
 *  computation, the Hub owns presentation metadata. */
function toCustomerHealthScore(r: CustomerHealthResult): CustomerHealthScore {
  return {
    score: r.score,
    tier: healthTier(r.score),
    components: r.components,
    sparkline: r.sparkline,
    updatedAt: r.computedAt,
  };
}

/**
 * One async section's resolved value, tagged with the `key` (repo, plus
 * any extra inputs) it was computed for. The public `data/loading/error`
 * are *derived* from whether the stored key still matches the current
 * inputs — so a `repo` change instantly reads as "loading" with no
 * synchronous setState-in-effect (which `react-hooks/set-state-in-effect`
 * forbids; same idle-derivation trick as `useDriftNorm` / `useProjectHealth`).
 * The effect only ever commits a *resolved* (or *errored*) value.
 */
interface Resolved<T> {
  key: string;
  data: T | null;
  error: Error | null;
}

interface Section<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/** Derive the public per-section shape from the tagged store: a value
 *  only counts when it was resolved for *this* exact key; otherwise the
 *  section reads as still-loading (no data, no stale error). */
function deriveSection<T>(
  resolved: Resolved<T> | null,
  key: string,
): Section<T> {
  const fresh = resolved !== null && resolved.key === key;
  return {
    data: fresh ? resolved.data : null,
    loading: !fresh,
    error: fresh ? resolved.error : null,
  };
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Aggregate hook for Project Hub. Per PRD-008 FR-42 this is the single
 * aggregation point; all Hub views (header, tabs, overview blocks) read
 * from here. It composes `useProjectHealth` with the Epic-012 real
 * producers (DORA / digest / customer-health / onboarding / NBA).
 *
 * Each producer runs in its own effect and stores a result tagged with
 * the inputs it belongs to; the public shape is derived per-section. A
 * slow or failing producer degrades on its own — it never blocks or
 * blanks the rest of the Hub. The tab-facing `ProjectHubData` shape is
 * stable; the only deliberate change is `dora` now being the
 * calculator's own `DoraMetricsResult`, unified with `DoraCards`.
 *
 * @param repo  Repo name (without owner). Drives every producer.
 * @param project  Optional ProjectData from the parent Portfolio list,
 *                  since `useDashboard` already has it in memory — avoids
 *                  a second source of truth or a per-repo refetch.
 */
export function useProjectHub(repo: string, project?: ProjectData): ProjectHubData {
  const { report, loading, error: healthError, refresh } = useProjectHealth(repo);

  // Brief specifies `error: Error | null`; useProjectHealth returns string.
  // Wrap in Error only when present so callers get a typed instance, and
  // memoize so referential equality holds across renders with the same error.
  const error = useMemo(
    () => (healthError ? new Error(healthError) : null),
    [healthError],
  );

  // Mounted-flag so a late-resolving producer can't setState after the
  // Hub unmounts (portfolio navigation tear-down).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Decision Log (Epic-011 Task-01) ────────────────────────────────
  // Two sources: the project's BRIEF.md (optional, often absent) and
  // the most-recent commits filtered for `decide:`/`accept:` prefixes.
  // Both fetches are best-effort: any failure collapses to empty so the
  // tab still renders rather than blocking the whole Hub. The commit
  // list is also reused by the DORA producer below (deploy frequency /
  // change failure rate) so we don't fetch commits twice.
  // The commit fetch is tagged with its repo so an empty result for the
  // *current* repo (no history / fetch failed) reads as "resolved, empty"
  // — not "still loading" forever. Decisions/DORA derive off this.
  const [briefMd, setBriefMd] = useState<string | null>(null);
  const [commitsResolved, setCommitsResolved] =
    useState<Resolved<CommitInfo[]> | null>(null);
  // Merged PRs feed DORA Lead Time. Fetched here alongside commits (same
  // repo-keyed effect) so both DORA inputs resolve together — no n/a flash
  // while one input lags the other. #405.
  const [prsResolved, setPrsResolved] =
    useState<Resolved<DoraPullRequest[]> | null>(null);
  // Risk Register (Epic-011 Task-03) top-3 for the Overview card (#450).
  // Same repo-keyed effect as commits/PRs: risks.yaml is also a per-repo
  // read with nothing for the Hub to do while it loads, so it rides the
  // existing Promise.all rather than introducing a second uncoordinated
  // fetch. `fetchTopRisks` is best-effort (absent/corrupt file → []),
  // so this resolves to a real (possibly empty) list, never an error.
  const [risksResolved, setRisksResolved] =
    useState<Resolved<Risk[]> | null>(null);
  // Commitments (Epic-011 Task-02) top-3 for the Overview card (#451).
  // Same repo-keyed effect as commits/PRs/risks: `commitments.yaml` is
  // also a per-repo read with nothing for the Hub to do while it loads,
  // so it rides the existing Promise.all rather than introducing a
  // second uncoordinated fetch. The raw yaml is stored here (best-effort
  // → null, never an error); the BRIEF↔yaml merge + top-N slice is a
  // derived `useMemo` (next to `decisions`) since `briefMd` resolves in
  // this same batch — keeping the table and the card on one producer.
  const [commitmentsYamlResolved, setCommitmentsYamlResolved] =
    useState<Resolved<CommitmentsYaml> | null>(null);
  // Activity Pulse (Epic-011 Task-06/07) for the Overview block + inbox
  // badge (#452). Same repo-keyed effect as commits/PRs/risks/commitments:
  // `aggregatePulse` is also a per-repo read with nothing for the Hub to
  // do while it loads, so it rides the existing Promise.all rather than
  // introducing a second uncoordinated fetch. `fetchPulse` is best-effort
  // (any failure → []), so this resolves to a real (possibly empty) list,
  // never an error. The aggregator's own 5-min sessionStorage cache means
  // this shares one read with ActivityTab — not a duplicate fetch.
  const [pulseResolved, setPulseResolved] =
    useState<Resolved<ProjectHubData["pulse"]> | null>(null);
  useEffect(() => {
    const key = repo;
    let cancelled = false;
    void (async () => {
      // Run in parallel — they're independent and the Hub has nothing
      // to do with either response while we wait.
      const [
        briefRes,
        commitsRes,
        prsRes,
        risksRes,
        commitmentsYamlRes,
        pulseRes,
      ] = await Promise.all([
        readMarkdown(repo, "docs/BRIEF.md").catch(() => null),
        listRecentCommits(repo, 100).catch(() => [] as CommitInfo[]),
        fetchDoraPRs(repo),
        fetchTopRisks(repo),
        fetchCommitmentsYaml(repo),
        fetchPulse(repo),
      ]);
      if (cancelled || !mounted.current) return;
      setBriefMd(briefRes?.content ?? null);
      setCommitsResolved({ key, data: commitsRes, error: null });
      setPrsResolved({ key, data: prsRes, error: null });
      setRisksResolved({ key, data: risksRes, error: null });
      setCommitmentsYamlResolved({
        key,
        data: commitmentsYamlRes,
        error: null,
      });
      setPulseResolved({ key, data: pulseRes, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // Only count commits resolved for *this* repo; a stale result from the
  // previous repo (navigation mid-fetch) reads as not-yet-loaded.
  const commitsFresh =
    commitsResolved !== null && commitsResolved.key === repo;
  const commits = useMemo<CommitInfo[]>(
    () => (commitsFresh ? (commitsResolved?.data ?? []) : []),
    [commitsFresh, commitsResolved],
  );

  const prsFresh = prsResolved !== null && prsResolved.key === repo;
  const pullRequests = useMemo<DoraPullRequest[]>(
    () => (prsFresh ? (prsResolved?.data ?? []) : []),
    [prsFresh, prsResolved],
  );

  // Only surface risks resolved for *this* repo; a stale result from
  // the previous repo (navigation mid-fetch) reads as not-yet-loaded
  // (empty), never as the old repo's risks. Falls back to the stable
  // `EMPTY_RISKS` so downstream memo deps keep reference equality and
  // the Overview empty state appears only when there are genuinely no
  // risks (file absent / corrupt / register empty).
  const risksFresh = risksResolved !== null && risksResolved.key === repo;
  const risks = useMemo<ProjectHubData["risks"]>(() => {
    const list = risksFresh ? (risksResolved?.data ?? []) : [];
    return list.length > 0 ? list : EMPTY_RISKS;
  }, [risksFresh, risksResolved]);

  const decisions = useMemo(
    () => extractDecisions(briefMd, commits),
    [briefMd, commits],
  );

  // Only surface commitments resolved for *this* repo; a stale yaml
  // result from the previous repo (navigation mid-fetch) reads as
  // not-yet-loaded so the card never shows the old repo's promises.
  // `extractCommitments` is the single shared producer (same one the
  // CommitmentsTable uses): it merges the BRIEF `## Commitments` section
  // with `docs/commitments.yaml`, derives `overdue`, and emits the
  // canonical order overdue → open-by-due-asc → done (undated last) —
  // so the top-N here is exactly the table's first N rows ("overdue,
  // then nearest"). Works from the BRIEF section alone when there is no
  // yaml file yet. Falls back to the stable `EMPTY_COMMITMENTS` so
  // downstream memo deps keep reference equality and the Overview empty
  // state appears only when there are genuinely no commitments.
  const commitmentsYamlFresh =
    commitmentsYamlResolved !== null &&
    commitmentsYamlResolved.key === repo;
  const commitments = useMemo<ProjectHubData["commitments"]>(() => {
    const yamlData = commitmentsYamlFresh
      ? (commitmentsYamlResolved?.data ?? null)
      : null;
    const list = extractCommitments(briefMd, yamlData).slice(
      0,
      COMMITMENTS_TOP_N,
    );
    return list.length > 0 ? list : EMPTY_COMMITMENTS;
  }, [commitmentsYamlFresh, commitmentsYamlResolved, briefMd]);

  // Only surface pulse events resolved for *this* repo; a stale result
  // from the previous repo (navigation mid-fetch) reads as not-yet-loaded
  // (empty), never as the old repo's timeline. Falls back to the stable
  // `EMPTY_PULSE` so downstream memo deps keep reference equality and the
  // Overview Pulse empty state appears only when there are genuinely no
  // events (all sources empty / offline). The inbox badge is derived from
  // the SAME resolved list via `unreadCount` — the exact function (and
  // therefore the exact "newer than this device's last Activity visit"
  // definition) `ProjectHubPage` recomputes for the header badge — so the
  // contract value here can never disagree with what the badge shows.
  const pulseFresh = pulseResolved !== null && pulseResolved.key === repo;
  const pulse = useMemo<ProjectHubData["pulse"]>(() => {
    const list = pulseFresh ? (pulseResolved?.data ?? []) : [];
    return list.length > 0 ? list : EMPTY_PULSE;
  }, [pulseFresh, pulseResolved]);
  const inboxCount = useMemo(
    () => unreadCount(pulse, repo),
    [pulse, repo],
  );

  // ── DORA (Epic-012 Task-03) ────────────────────────────────────────
  // `computeDora` is pure-injectable and synchronous. We feed it the
  // commits + merged PRs loaded above (Deploy Frequency + Change Failure
  // Rate from real commit subjects; Lead Time from median merged−created
  // over the PR window, #405). The remaining inputs degrade by the
  // calculator's own documented contract, not silently:
  //   - `pullRequests` — real merged PRs in the window. Empty (no token /
  //     API failure / no merged PRs) yields an honest `n/a` Lead Time
  //     dash rather than a fabricated 0h.
  //   - `incidents: null` — no per-repo BetterStack monitor matching in
  //     the Hub today → MTTR `n/a`.
  //   - `auditFindings: []` — CFR falls back to the fix-only signal.
  // Gated on `commitsFresh`: commits and PRs are fetched in the same
  // Promise.all and set together, so when commits are fresh the PRs for
  // this repo are too — no Lead Time n/a→value flash. It carries its own
  // loading slice for tab-skeleton parity with the async producers — an
  // empty-history repo resolves to a real (all-low) metric set, not a
  // perpetual spinner.
  const doraSection = useMemo<Section<DoraMetricsResult>>(() => {
    if (!commitsFresh) {
      return { data: null, loading: true, error: null };
    }
    try {
      const metrics = computeDora(
        { commits, pullRequests, incidents: null, auditFindings: [] },
        DORA_WINDOW_DAYS,
      );
      return { data: metrics, loading: false, error: null };
    } catch (e) {
      return { data: null, loading: false, error: toError(e) };
    }
  }, [commitsFresh, commits, pullRequests]);

  // ── Weekly Digest (Epic-012 Task-02) ───────────────────────────────
  // Latest digest for the current ISO week. `loadDigest` resolves from
  // localStorage cache → committed file → null, and never throws; still
  // guarded so a thrown rejection degrades this section alone.
  const [digestResolved, setDigestResolved] =
    useState<Resolved<DigestEntry> | null>(null);
  useEffect(() => {
    const key = repo;
    let cancelled = false;
    void (async () => {
      try {
        const entry = await loadDigest(repo, currentWeekKey());
        if (cancelled || !mounted.current) return;
        setDigestResolved({ key, data: entry, error: null });
      } catch (e) {
        if (cancelled || !mounted.current) return;
        setDigestResolved({ key, data: null, error: toError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);
  const digestSection = deriveSection(digestResolved, repo);

  // ── Customer Health (Epic-012 Task-07) ─────────────────────────────
  // `computeHealth` is weekly-throttled and never throws by contract;
  // still wrapped so a rejection isolates to this section. Budget / paid
  // come from the project finance overrides (same source CustomerHealth
  // uses elsewhere) so the `paid` sub-component is meaningful. The store
  // key folds in the tier so the score recomputes if classification
  // resolves after the first run.
  const tier = report?.classification.tier;
  const budget = project?.budget;
  const paid = project?.paid;
  const healthKey = `${repo}|${tier ?? ""}|${budget ?? ""}|${paid ?? ""}`;
  const [healthResolved, setHealthResolved] =
    useState<Resolved<CustomerHealthScore> | null>(null);
  useEffect(() => {
    const key = healthKey;
    let cancelled = false;
    void (async () => {
      try {
        const finance = getProjectFinance(repo);
        const result = await computeHealth(repo, {
          tier,
          budget: finance?.budget ?? budget,
          paid: finance?.paid ?? paid,
        });
        if (cancelled || !mounted.current) return;
        setHealthResolved({
          key,
          data: toCustomerHealthScore(result),
          error: null,
        });
      } catch (e) {
        if (cancelled || !mounted.current) return;
        setHealthResolved({ key, data: null, error: toError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, tier, budget, paid, healthKey]);
  const healthSection = deriveSection(healthResolved, healthKey);

  // ── Onboarding Readiness (Epic-012 Task-04) ────────────────────────
  // Synchronous, not async: the six onboarding rules are merged into the
  // checklist evaluated by `useProjectHealth`, so the report's findings
  // already carry them. We summarise (`completed / total / missing`)
  // here; OnboardingChecklist still filters the raw findings itself.
  const onboarding = useMemo<OnboardingReport>(() => {
    const findings = report?.findings ?? [];
    const rows = findings.filter((f) => isOnboardingRuleId(f.rule_id));
    if (rows.length === 0) return EMPTY_ONBOARDING;
    const completed = rows.filter((f) => f.status === "pass").length;
    const missing = rows
      .filter((f) => f.status !== "pass")
      .map((f) => f.rule_id);
    return { completed, total: rows.length, missing };
  }, [report?.findings]);

  // ── Next Best Action (Epic-012 Task-05) ────────────────────────────
  // `computeProjectNBA` is pure-injectable: it weighs the signals we
  // pass it. Risks are not yet a Hub producer (Epic-011 Task-03 is UI
  // only), so we feed audit findings from the health report's failing
  // entries. The engine is week-cached and never throws to the caller;
  // still wrapped for section isolation. The store key folds in a fast
  // signature of the findings so the NBA refreshes when they change.
  const failingFindings = useMemo(
    () =>
      (report?.findings ?? [])
        .filter((f) => f.status === "fail")
        .map((f) => ({
          severity: f.severity,
          description: f.detail ? `${f.title} — ${f.detail}` : f.title,
        })),
    [report?.findings],
  );
  const nbaKey = useMemo(
    () =>
      `${repo}|${failingFindings.map((f) => `${f.severity}:${f.description}`).join("¦")}`,
    [repo, failingFindings],
  );
  const [nbaResolved, setNbaResolved] =
    useState<Resolved<NextBestAction[]> | null>(null);
  useEffect(() => {
    const key = nbaKey;
    let cancelled = false;
    void (async () => {
      try {
        const apiKey = getClaudeKey() ?? "";
        const result = await computeProjectNBA(
          repo,
          { findings: failingFindings },
          apiKey,
        );
        if (cancelled || !mounted.current) return;
        const actions = result.actions.map(toNextBestAction);
        setNbaResolved({
          key,
          data: actions.length > 0 ? actions : EMPTY_NBA,
          error: null,
        });
      } catch (e) {
        if (cancelled || !mounted.current) return;
        setNbaResolved({ key, data: null, error: toError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, failingFindings, nbaKey]);
  const nbaSection = deriveSection(nbaResolved, nbaKey);

  // `loadingTab` mirrors per-tab loading. Health drives its own tabs;
  // Delivery is "loading" until every section it shows has resolved (or
  // errored) so the tab skeleton clears once the slowest producer lands
  // — without one slow section blocking the others' content (each
  // section renders independently from its own slice).
  const loadingTab = useMemo<Record<HubTab, boolean>>(
    () => ({
      overview: nbaSection.loading,
      health: loading,
      activity: false,
      decisions: false,
      delivery:
        doraSection.loading ||
        digestSection.loading ||
        healthSection.loading ||
        loading,
    }),
    [
      loading,
      nbaSection.loading,
      doraSection.loading,
      digestSection.loading,
      healthSection.loading,
    ],
  );

  // Stable no-op async actions so consumers can wire buttons today;
  // dedicated regenerate UIs live in the section widgets / Epic-010.
  const generateDigest = useCallback(async () => {
    // Digest regeneration is owned by DigestViewer's own controls; the
    // Hub-level button is a no-op placeholder by design (the real
    // affordance lives in the widget, not here).
  }, []);
  const regenerateNBA = useCallback(async () => {
    // NBA regeneration is owned by the portfolio / section controls; the
    // Hub-level button is a no-op placeholder by design.
  }, []);

  // Fall back to the stable empty array when the extractor produced no
  // decisions — keeps reference equality for downstream memo deps.
  const finalDecisions = decisions.length > 0 ? decisions : EMPTY_DECISIONS;

  return {
    project: project ?? null,
    health: report,
    decisions: finalDecisions,
    risks,
    commitments,
    renewals: EMPTY_RENEWALS,
    pulse,
    inboxCount,
    digest: digestSection.data,
    dora: doraSection.data,
    customerHealth: healthSection.data,
    onboarding,
    nba: nbaSection.data ?? EMPTY_NBA,
    loading,
    loadingTab,
    error,
    refresh,
    generateDigest,
    regenerateNBA,
  };
}
