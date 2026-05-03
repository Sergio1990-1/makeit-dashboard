import { useCallback, useEffect, useRef, useState } from "react";
import { GITHUB_OWNER, getClaudeKey, getToken } from "../utils/config";
import { loadChecklist } from "../utils/checklist";
import { ClassificationMissingError, runHealthCheck } from "../utils/health-engine";
import { runDriftScan } from "../utils/health-llm";
import type { HealthFinding, HealthLayer, HealthLayerSummary, HealthReport } from "../types/health";

const SESSION_PREFIX = "makeit_health_";

interface State {
  report: HealthReport | null;
  loading: boolean;
  error: string | null;
  // Set when the engine raised a typed ClassificationMissingError —
  // the UI uses this instead of substring-matching the error message.
  classificationMissing: boolean;
  // Layer-4 (drift) scan progress. `driftScanning` gates the Hero button so
  // double-clicks can't fan out parallel scans; `driftProgress` drives the
  // progress UI when set.
  driftScanning: boolean;
  driftProgress: { done: number; total: number; currentRule?: string } | null;
}

// Outcome of a drift scan, surfaced to callers so the UI can toast a
// summary («+N fails, M cached»). Resolves even on no-op (no key, no
// applicable rules) so the caller has uniform handling.
export type DriftScanOutcome =
  | { kind: "ok"; addedFails: number; cachedHits: number; total: number }
  | { kind: "no-key" }
  | { kind: "no-token" }
  | { kind: "no-report" }
  | { kind: "error"; message: string };

// Recompute by_layer summary after we swap Layer-4 findings — keeping this
// in sync with health-engine.ts is critical so the UI's layer chips don't
// drift after a partial scan.
function summarizeByLayer(
  findings: HealthFinding[],
): Record<HealthLayer, HealthLayerSummary> {
  const empty: HealthLayerSummary = {
    total: 0,
    pass: 0,
    fail: 0,
    unknown: 0,
    skipped: 0,
  };
  const out: Record<HealthLayer, HealthLayerSummary> = {
    1: { ...empty },
    2: { ...empty },
    3: { ...empty },
    4: { ...empty },
  };
  for (const f of findings) {
    const s = out[f.layer];
    s.total++;
    s[f.status]++;
  }
  return out;
}

// Hook that runs the health pipeline for one repo. Caches the last report in
// sessionStorage keyed by repo so navigating between projects doesn't re-scan
// every time. Cache survives only the current tab session.
export function useProjectHealth(
  repo: string | null,
): State & { refresh: () => void; scanDrift: () => Promise<DriftScanOutcome> } {
  const [state, setState] = useState<State>({
    report: null,
    loading: false,
    error: null,
    classificationMissing: false,
    driftScanning: false,
    driftProgress: null,
  });
  const requestId = useRef(0);
  // Mounted-flag so async scanDrift() callbacks don't setState after the
  // hook unmounts (project navigation, page tear-down).
  const mounted = useRef(true);
  // Synchronous reentrancy guard. `state.driftScanning` can't be used for
  // double-click protection because setState is async — two clicks in the
  // same tick both read the same false snapshot. The ref flips immediately.
  const driftRunning = useRef(false);
  // Current `repo` mirrored as a ref so scanDrift can detect the user
  // navigating to a different project mid-scan (in which case we must NOT
  // commit drift findings into the new report).
  const repoRef = useRef(repo);
  useEffect(() => {
    repoRef.current = repo;
  }, [repo]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (currentRepo: string, force: boolean) => {
      const token = getToken();
      if (!token) {
        setState({
          report: null,
          loading: false,
          error: "Нужен GitHub-токен",
          classificationMissing: false,
          driftScanning: false,
          driftProgress: null,
        });
        return;
      }

      // Cache shortcut FIRST: avoids loading-flicker on navigation between
      // already-scanned projects. Only after a cache miss do we flip to
      // loading=true.
      if (!force) {
        const cached = sessionStorage.getItem(SESSION_PREFIX + currentRepo);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as HealthReport;
            const myReq = ++requestId.current;
            void myReq;
            setState({
              report: parsed,
              loading: false,
              error: null,
              classificationMissing: false,
              driftScanning: false,
              driftProgress: null,
            });
            return;
          } catch {
            sessionStorage.removeItem(SESSION_PREFIX + currentRepo);
          }
        }
      }

      const myReq = ++requestId.current;
      setState((s) => ({ ...s, loading: true, error: null, classificationMissing: false }));

      try {
        const doc = await loadChecklist(token, force);
        const report = await runHealthCheck(token, GITHUB_OWNER, currentRepo, doc);
        if (myReq !== requestId.current) return;
        try {
          sessionStorage.setItem(SESSION_PREFIX + currentRepo, JSON.stringify(report));
        } catch {
          // Quota exceeded — drop silently, the next render will recompute.
        }
        setState({
          report,
          loading: false,
          error: null,
          classificationMissing: false,
          driftScanning: false,
          driftProgress: null,
        });
      } catch (err) {
        if (myReq !== requestId.current) return;
        if (err instanceof ClassificationMissingError) {
          setState({
            report: null,
            loading: false,
            error: null,
            classificationMissing: true,
            driftScanning: false,
            driftProgress: null,
          });
          return;
        }
        const msg = err instanceof Error ? err.message : "Не удалось выполнить health-чек";
        setState({
          report: null,
          loading: false,
          error: msg,
          classificationMissing: false,
          driftScanning: false,
          driftProgress: null,
        });
      }
    },
    [],
  );

  useEffect(() => {
    // Fetch-on-prop-change. setState inside `run` is intentional —
    // discriminates loading/error/cache-hit. The lint rule (when active)
    // errs on any setState reachable from an effect, but here it's the
    // canonical "kick off async work when input changes" pattern.
    if (repo) run(repo, false);
  }, [repo, run]);

  const refresh = useCallback(() => {
    if (repo) {
      sessionStorage.removeItem(SESSION_PREFIX + repo);
      run(repo, true);
    }
  }, [repo, run]);

  // Run the Layer-4 (drift / AI) scan. Reads classification from the current
  // report — so it requires a successful sync scan first; otherwise we have
  // no anchor for what's applicable. Merges new findings into the existing
  // report (replaces all Layer-4 entries) and persists to sessionStorage.
  const scanDrift = useCallback(async (): Promise<DriftScanOutcome> => {
    if (!repo) return { kind: "no-report" };
    const token = getToken();
    if (!token) return { kind: "no-token" };
    const claudeKey = getClaudeKey();
    if (!claudeKey) return { kind: "no-key" };

    // Capture the repo we're scanning so the post-await merge can detect
    // a navigation away (`repoRef.current !== scanRepo`) and abandon.
    const scanRepo = repo;

    // Snapshot the current report ONLY for read-only inputs to runDriftScan
    // (classification). The merge at the end reads `s.report` from setState
    // so it picks up any fresher report written by Refresh while we awaited.
    const initialReport = state.report;
    if (!initialReport) return { kind: "no-report" };
    const classification = initialReport.classification;

    // Re-entrancy guard via ref so double-clicks within the same render tick
    // can't both pass — setState's async nature makes a state-read insufficient.
    if (driftRunning.current) {
      return { kind: "ok", addedFails: 0, cachedHits: 0, total: 0 };
    }
    driftRunning.current = true;

    setState((s) => ({
      ...s,
      driftScanning: true,
      driftProgress: { done: 0, total: 0 },
    }));

    try {
      const doc = await loadChecklist(token);
      const result = await runDriftScan(
        token,
        GITHUB_OWNER,
        scanRepo,
        doc,
        classification,
        claudeKey,
        (p) => {
          if (!mounted.current || repoRef.current !== scanRepo) return;
          setState((s) => {
            // Stale-progress guard: if a newer scan started, drop this update.
            if (!s.driftScanning) return s;
            return {
              ...s,
              driftProgress: { done: p.done, total: p.total, currentRule: p.currentRule },
            };
          });
        },
      );

      if (!mounted.current || repoRef.current !== scanRepo) {
        // Component unmounted or user navigated away — drop the result.
        // Findings are already in the localStorage drift cache (keyed by
        // treeSha) and will be picked up on the next scan.
        return { kind: "ok", addedFails: 0, cachedHits: result.cachedRuleIds.size, total: result.findings.length };
      }

      // Real cache-hit count comes from `runDriftScan` directly — this counts
      // entries served via `getCached`, not heuristics over previous findings.
      const cachedHits = result.cachedRuleIds.size;
      const addedFails = result.findings.filter((f) => f.status === "fail").length;

      // Merge against the LATEST report — Refresh may have written a fresher
      // sync result while drift was running; merging against `initialReport`
      // would silently overwrite it. We commit only if a base report still
      // exists (Refresh-then-error could leave it null).
      let mergedFindings: HealthFinding[] | null = null;
      let merged: HealthReport | null = null;
      setState((s) => {
        if (!s.report) {
          // No base to merge into — drop drift findings (they're cached on
          // disk; next scan picks them up). Just clear the scanning flag.
          return { ...s, driftScanning: false, driftProgress: null };
        }
        const nonLayer4 = s.report.findings.filter((f) => f.layer !== 4);
        mergedFindings = [...nonLayer4, ...result.findings];
        merged = {
          ...s.report,
          findings: mergedFindings,
          by_layer: summarizeByLayer(mergedFindings),
          // Note: we deliberately don't re-compute `score` here — drift checks
          // are advisory and shouldn't impact the score until task-08 wires
          // them in. `generated_at` likewise stays anchored to the sync scan.
        };
        return { ...s, report: merged, driftScanning: false, driftProgress: null };
      });

      // Persist the merged report iff we actually merged. Reading the
      // closed-over `merged` after the setState is safe because React invokes
      // the updater synchronously during dispatch.
      if (merged) {
        try {
          sessionStorage.setItem(SESSION_PREFIX + scanRepo, JSON.stringify(merged));
        } catch {
          // Quota exceeded — non-fatal.
        }
      }

      return {
        kind: "ok",
        addedFails,
        cachedHits,
        total: result.findings.length,
      };
    } catch (err) {
      if (!mounted.current) {
        return { kind: "error", message: "unmounted" };
      }
      // Always reset the scanning flag — otherwise the button stays disabled
      // forever after a transient failure.
      setState((s) => ({ ...s, driftScanning: false, driftProgress: null }));
      const msg = err instanceof Error ? err.message : "Не удалось запустить drift-скан";
      return { kind: "error", message: msg };
    } finally {
      // Release the reentrancy ref no matter what — the button must become
      // clickable again on success, error, AND unmount-mid-scan.
      driftRunning.current = false;
    }
  }, [repo, state.report]);

  // When `repo` is null we expose an empty/idle state without touching the
  // internal store — keeps state-from-effect linting happy and avoids extra
  // renders on null transitions.
  if (!repo) {
    return {
      report: null,
      loading: false,
      error: null,
      classificationMissing: false,
      driftScanning: false,
      driftProgress: null,
      refresh,
      scanDrift,
    };
  }
  return { ...state, refresh, scanDrift };
}
