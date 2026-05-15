import type { ProjectHubData } from "../../../../types/hub";
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
 *   - DORA              gated on `data.dora`; DoraCards owns its own
 *                       four-dash placeholder when no metrics yet.
 *   - Customer Health   self-contained — owns its computeHealth(repo) call.
 *   - Onboarding        reads the six onboarding rules from health findings.
 *   - Weekly Digest     self-contained — read-only history by repo (no
 *                       regenerate input until Task-09 wires the activity).
 *
 * Every section degrades to a scoped empty state when its source is
 * absent, so the tab never crashes on the stubbed hook.
 */
export function DeliveryTab({ repo, data }: Props) {
  const { dora, customerHealth, onboarding, digest, health } = data;
  // OnboardingChecklist needs the raw health findings (it filters the six
  // onboarding rules itself); `onboarding` (OnboardingReport) is the hub's
  // summary and drives the per-section empty state — total === 0 means the
  // project hasn't been health-scanned / classified yet.
  const onboardingFindings = health?.findings ?? [];
  const hasOnboarding = onboarding.total > 0 && onboardingFindings.length > 0;

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
            Недостаточно merges на main за окно.
          </p>
        ) : (
          <DoraCards metrics={null} />
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
        {digest === null ? (
          <p className="delivery-empty">
            Дайджест за неделю ещё не сгенерирован.
          </p>
        ) : (
          <DigestViewer repo={repo} />
        )}
      </section>
    </div>
  );
}

export default DeliveryTab;
