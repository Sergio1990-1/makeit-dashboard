import { useMemo } from "react";
import type { DigestInput, ProjectHubData } from "../../../../types/hub";
import {
  currentWeekKey,
  normalizeWeekKey,
} from "../../../../utils/weeklyDigestGenerator";
import { DoraCards } from "../DoraCards";
import { CustomerHealthGauge } from "../CustomerHealthGauge";
import { OnboardingChecklist } from "../OnboardingChecklist";
import { DigestViewer } from "../DigestViewer";

interface Props {
  /** Repo slug — drives the self-contained widgets (Customer Health, Digest). */
  repo: string;
  /** Aggregate Hub data from useProjectHub (presentation-only, PRD-008 FR-42). */
  data: ProjectHubData;
}

/**
 * Delivery tab (Epic-012 Task-08) — replaces the Epic-009 stub.
 *
 * Layout (per docs/PROJECT_HUB_DESIGN_BRIEF.md §4.3):
 *   row-1  DoraCards          full-width (its own 4-column internal grid)
 *   row-2  CustomerHealthGauge | OnboardingChecklist   (2-col ≥1280px)
 *   row-3  DigestViewer       full-width
 * <768px everything stacks single-column (see .delivery-* in v4.css).
 *
 * Data sourcing — the four widgets were built (Tasks 02/03/04/07) with
 * their own contracts, so this tab feeds each what it actually needs and
 * uses the matching `useProjectHub` field only to decide the per-section
 * empty state (the stub returns null/empty today; Task-09 (#367) swaps in
 * real producers without touching this presentation layer):
 *   - DORA              `data.dora` is the calculator's own
 *                       `DoraMetricsResult` (unified with DoraCards in
 *                       Task-09); passed straight through. DoraCards owns
 *                       its own four-dash placeholder when `null`.
 *   - Customer Health   self-contained — owns its computeHealth(repo) call.
 *   - Onboarding        reads the six onboarding rules from health findings.
 *   - Weekly Digest     fed a best-effort `DigestInput` (this week's
 *                       activity from the now-wired hub) so its Regenerate
 *                       control is live and the first digest can be
 *                       created from an empty state (#454).
 *
 * Every section degrades to a scoped empty state when its source is
 * absent, so the tab never crashes on the stubbed hook.
 */
export function DeliveryTab({ repo, data }: Props) {
  const { dora, customerHealth, onboarding, health } = data;
  // OnboardingChecklist needs the raw health findings (it filters the six
  // onboarding rules itself); `onboarding` (OnboardingReport) is the hub's
  // summary and drives the per-section empty state — total === 0 means the
  // project hasn't been health-scanned / classified yet.
  const onboardingFindings = health?.findings ?? [];
  const hasOnboarding = onboarding.total > 0 && onboardingFindings.length > 0;

  // Best-effort DigestInput for the current ISO week, fed to DigestViewer
  // so its Regenerate control is live (#454). Week-scoping reuses the
  // generator's own `normalizeWeekKey` (pass a Date — the string overload
  // would mis-read a full ISO timestamp) so this can never drift from the
  // key DigestViewer regenerates under. Fields the hub aggregate doesn't
  // carry (audit findings — separate useAudit, #461) are omitted;
  // `generateDigest` degrades gracefully on a partial input.
  const digestInput = useMemo<DigestInput>(() => {
    const wk = currentWeekKey();
    const inCurrentWeek = (iso: string): boolean => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return false;
      return normalizeWeekKey(d) === wk;
    };
    const weekPulse = data.pulse.filter((e) => inCurrentWeek(e.timestamp));
    const mergedPRs = weekPulse
      .filter((e) => e.type === "pr_merged")
      .map((e) => ({ title: e.title, url: e.url }));
    const closedIssues = weekPulse
      .filter((e) => e.type === "issue_closed")
      .map((e) => ({ title: e.title, url: e.url }));
    // No per-commitment delivered-date in the model — surface the ones
    // currently marked done as this week's deliveries (best-effort).
    const commitmentsDelivered = data.commitments.filter(
      (c) => c.status === "done",
    );
    return {
      pulse: weekPulse,
      closedIssues,
      mergedPRs,
      commitmentsDelivered,
      auditFindings: [],
    };
  }, [data.pulse, data.commitments]);

  return (
    <div className="delivery-tab">
      {/* row-1 — DORA KPIs (full-width, own internal 4-col grid) */}
      <section
        className="delivery-row delivery-row--dora"
        aria-labelledby="delivery-dora-title"
      >
        <h2 id="delivery-dora-title" className="delivery-section-title">
          DORA
        </h2>
        {dora === null ? (
          <p className="delivery-empty">
            DORA-метрики ещё считаются (или недостаточно активности на main).
          </p>
        ) : (
          <DoraCards metrics={dora} />
        )}
      </section>

      {/* row-2 — Customer Health (left) + Onboarding (right) */}
      <div className="delivery-row delivery-row--split">
        <section
          className="delivery-cell"
          aria-labelledby="delivery-health-title"
        >
          <h2
            id="delivery-health-title"
            className="delivery-section-title"
          >
            Customer Health
          </h2>
          {customerHealth === null ? (
            <p className="delivery-empty">
              Нет данных, требуется свежий транскрипт.
            </p>
          ) : (
            <CustomerHealthGauge repo={repo} />
          )}
        </section>

        <section
          className="delivery-cell"
          aria-labelledby="delivery-onboarding-title"
        >
          <h2
            id="delivery-onboarding-title"
            className="delivery-section-title"
          >
            Onboarding Readiness
          </h2>
          {!hasOnboarding ? (
            <p className="delivery-empty">
              Onboarding-чеклист появится после первого health-сканирования
              проекта.
            </p>
          ) : (
            <OnboardingChecklist findings={onboardingFindings} />
          )}
        </section>
      </div>

      {/* row-3 — Weekly Digest (full-width) */}
      <section
        className="delivery-row delivery-row--digest"
        aria-labelledby="delivery-digest-title"
      >
        <h2 id="delivery-digest-title" className="delivery-section-title">
          Weekly Digest
        </h2>
        {/* Always mount: DigestViewer owns its own per-week empty state
            («…ещё не сгенерирован. Нажмите «Regenerate».») which is now
            actionable since `input` is supplied — so the FIRST digest can
            be created, not just regenerated. */}
        <DigestViewer repo={repo} input={digestInput} />
      </section>
    </div>
  );
}

export default DeliveryTab;
