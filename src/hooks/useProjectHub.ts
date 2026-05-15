import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectHealth } from "./useProjectHealth";
import type { ProjectData } from "../types";
import type { HubTab, OnboardingReport, ProjectHubData } from "../types/hub";
import {
  listRecentCommits,
  readMarkdown,
  type CommitInfo,
} from "../utils/github-contents";
import { extractDecisions } from "../utils/decisionLogExtractor";

// Stable empty stubs so consumers can rely on reference equality. The Hub
// surfaces (Overview, Activity, etc.) render empty states from these in
// Epic-009 — real producers land in Epic-011/012 and replace these calls.
const EMPTY_DECISIONS: ProjectHubData["decisions"] = [];
const EMPTY_RISKS: ProjectHubData["risks"] = [];
const EMPTY_COMMITMENTS: ProjectHubData["commitments"] = [];
const EMPTY_RENEWALS: ProjectHubData["renewals"] = [];
const EMPTY_PULSE: ProjectHubData["pulse"] = [];
const EMPTY_NBA: ProjectHubData["nba"] = [];
const EMPTY_ONBOARDING: OnboardingReport = { completed: 0, total: 0, missing: [] };

/**
 * Aggregate hook for Project Hub. Per PRD-008 FR-42, this is the single
 * aggregation point; all Hub views (header, tabs, overview blocks) read from
 * here. Today it composes `useProjectHealth` and stubs Epic-011/012 sources;
 * the public shape is stable so downstream code doesn't churn when real
 * producers land.
 *
 * @param repo  Repo name (without owner). Drives health composition.
 * @param project  Optional ProjectData from the parent Portfolio list, since
 *                 `useDashboard` already has it in memory — avoids a second
 *                 source of truth or a per-repo refetch.
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

  // ── Decision Log (Epic-011 Task-01) ────────────────────────────────
  // Two sources: the project's BRIEF.md (optional, often absent) and
  // the most-recent commits filtered for `decide:`/`accept:` prefixes.
  // Both fetches are best-effort: any failure collapses to empty so the
  // tab still renders rather than blocking the whole Hub.
  const [briefMd, setBriefMd] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Run in parallel — they're independent and the Hub has nothing
      // to do with either response while we wait.
      const [briefRes, commitsRes] = await Promise.all([
        readMarkdown(repo, "docs/BRIEF.md").catch(() => null),
        listRecentCommits(repo, 50).catch(() => [] as CommitInfo[]),
      ]);
      if (cancelled) return;
      setBriefMd(briefRes?.content ?? null);
      setCommits(commitsRes);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const decisions = useMemo(
    () => extractDecisions(briefMd, commits),
    [briefMd, commits],
  );

  // `loadingTab` mirrors the per-tab loading state. In Epic-009 only Health
  // has a real loading signal; the rest stay false until their producers
  // (Epic-011/012) wire in their own async work.
  const loadingTab = useMemo<Record<HubTab, boolean>>(
    () => ({
      overview: false,
      health: loading,
      activity: false,
      decisions: false,
      delivery: false,
    }),
    [loading],
  );

  // Stable no-op async actions so consumers can wire buttons today; Epic-012
  // replaces these with real digest generation and NBA recompute.
  const generateDigest = useCallback(async () => {
    // TODO: Epic-012 — weekly digest generator.
  }, []);
  const regenerateNBA = useCallback(async () => {
    // TODO: Epic-012 — NBA engine recompute.
  }, []);

  // Fall back to the stable empty array when the extractor produced no
  // decisions — keeps reference equality for downstream memo deps.
  const finalDecisions = decisions.length > 0 ? decisions : EMPTY_DECISIONS;

  return {
    project: project ?? null,
    health: report,
    decisions: finalDecisions,
    risks: EMPTY_RISKS,
    commitments: EMPTY_COMMITMENTS,
    renewals: EMPTY_RENEWALS,
    pulse: EMPTY_PULSE,
    inboxCount: 0,
    digest: null,
    dora: null,
    customerHealth: null,
    onboarding: EMPTY_ONBOARDING,
    nba: EMPTY_NBA,
    loading,
    loadingTab,
    error,
    refresh,
    generateDigest,
    regenerateNBA,
  };
}
