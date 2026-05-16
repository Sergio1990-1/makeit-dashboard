import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../../health/Icon";
import { DecisionLog } from "../DecisionLog";
import { RiskRegisterTable } from "../RiskRegisterTable";
import { CommitmentsTable } from "../CommitmentsTable";
import { RenewalsTable } from "../RenewalsTable";
import type { Decision, HubSection } from "../../../../types/hub";

/**
 * Decisions & Risks tab — final four-section assembly (Epic-011
 * Task-08, FR-23..FR-32, PRD-008 §4.3).
 *
 * Layout: a sticky in-tab nav (horizontal on narrow screens) plus four
 * anchored sections in this fixed order:
 *
 *   1. Decision Log    (#decisions) — read-only, fed from BRIEF.md +
 *                       conventional commits via useProjectHub.
 *   2. Risk Register   (#risks)     — repo-driven CRUD over risks.yaml.
 *   3. Commitments     (#commitments) — repo-driven CRUD over
 *                       commitments.yaml (+ BRIEF merge).
 *   4. Renewals        (#renewals)  — repo-driven CRUD over
 *                       renewals.yaml (+ package.json auto-scan).
 *
 * Deep-link (FR-14): two entry paths, both honoured.
 *  - External URL: on mount this tab reads `location.hash` and, if it
 *    is one of `#decisions|#risks|#commitments|#renewals`,
 *    smooth-scrolls to the matching `<section id>` (containers render
 *    synchronously — the self-fetching tables show their own loading
 *    state in place, so the anchor exists at the correct offset
 *    immediately). Satisfies an externally-pasted `…#risks` URL.
 *  - In-app: OverviewTab's Risks/Commitments summaries call
 *    `onOpenTab("decisions", "<section>")`; ProjectHubPage threads that
 *    down as the `scrollTo` prop (with a bump nonce). A dedicated effect
 *    scrolls on each new request — so clicking a summary lands on the
 *    originating section, not the top of the tab (issue #413).
 *
 * Active-section highlight in the nav is driven by a single
 * IntersectionObserver created once and disconnected on unmount — no
 * scroll listener, no per-render observer churn.
 *
 * Counts: the Decision Log count is `decisions.length` (the array this
 * component renders). The three self-fetching tables each report their
 * rendered record count through an `onCount` callback — the SAME data
 * they render, never a divergent second fetch. `useProjectHub` still
 * returns EMPTY_* placeholders for risks/commitments/renewals, so it is
 * deliberately NOT used as a count source (it would show wrong 0s). A
 * table's badge is shown only once it has reported a real count, so a
 * section never flashes a knowingly-wrong 0 while its table loads.
 *
 * Empty states are delegated entirely to the underlying components
 * (DecisionLog / the three tables each own theirs) — this assembly
 * never reimplements them.
 */

interface Props {
  /** Decisions for the read-only Decision Log (from useProjectHub). */
  decisions: Decision[];
  /**
   * Repo slug — required by the three self-fetching CRUD tables
   * (risks/commitments/renewals all read & write their own yaml).
   */
  repo: string;
  /**
   * In-app deep-link target (FR-14, issue #413). Set by ProjectHubPage
   * when the user clicks an Overview Risks/Commitments summary. `nonce`
   * is bumped per request so re-selecting the same section still
   * re-fires the scroll. `null` when arrived via a plain tab switch /
   * external URL (the mount-time `location.hash` read handles that).
   */
  scrollTo?: { section: HubSection; nonce: number } | null;
}

type SectionId = HubSection;

interface SectionDef {
  id: SectionId;
  title: string;
  icon: IconName;
}

/** Fixed order — Decision Log → Risk Register → Commitments → Renewals. */
const SECTIONS: readonly SectionDef[] = [
  { id: "decisions", title: "Журнал решений", icon: "book" },
  { id: "risks", title: "Реестр рисков", icon: "alert" },
  { id: "commitments", title: "Обещания", icon: "clock" },
  { id: "renewals", title: "Продления", icon: "shield" },
] as const;

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

export function DecisionsRisksTab({ decisions, repo, scrollTo }: Props) {
  // Per-section record counts. Decision Log is known synchronously
  // (the array we render). The three tables report through onCount;
  // `null` ⇒ "not reported yet" so we suppress the badge rather than
  // flash a wrong 0 while a table is still loading.
  const [riskCount, setRiskCount] = useState<number | null>(null);
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [renewalCount, setRenewalCount] = useState<number | null>(null);

  // Stable callbacks: the tables depend on `onCount` identity in their
  // count-reporting effect, so an inline lambda would re-fire it every
  // render. useCallback keeps it firing only on real count changes.
  const onRiskCount = useCallback((n: number) => setRiskCount(n), []);
  const onCommitCount = useCallback((n: number) => setCommitCount(n), []);
  const onRenewalCount = useCallback((n: number) => setRenewalCount(n), []);

  const counts = useMemo<Record<SectionId, number | null>>(
    () => ({
      decisions: decisions.length,
      risks: riskCount,
      commitments: commitCount,
      renewals: renewalCount,
    }),
    [decisions.length, riskCount, commitCount, renewalCount],
  );

  // ── Active section (scroll-spy) ──────────────────────────────────────
  const [activeId, setActiveId] = useState<SectionId>("decisions");
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>(
    {},
  );

  const setSectionRef = useCallback(
    (id: SectionId) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    [],
  );

  // One IntersectionObserver for all four sections, created once on
  // mount and disconnected on unmount (no leak, no stale-node observe).
  // The most "in view" section (largest intersection ratio, tie-broken
  // by document order) wins the active highlight.
  useEffect(() => {
    const els = SECTIONS.map((s) => sectionRefs.current[s.id]).filter(
      (el): el is HTMLElement => el != null,
    );
    if (els.length === 0) return;

    const ratios = new Map<SectionId, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-section-id");
          if (id && isSectionId(id)) {
            ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
          }
        }
        let best: SectionId | null = null;
        let bestRatio = -1;
        for (const s of SECTIONS) {
          const r = ratios.get(s.id) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = s.id;
          }
        }
        if (best !== null && bestRatio > 0) setActiveId(best);
      },
      // Several thresholds so the active item tracks smoothly as a
      // section scrolls through the viewport.
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Smooth-scroll to a section's anchor. Scroll only — the active-nav
  // highlight is owned by the IntersectionObserver, which fires as this
  // scroll lands and sets `activeId`; calling setActiveId here would be a
  // competing source of truth. No-op if the ref isn't attached yet.
  const scrollToSection = useCallback((id: SectionId) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ── Hash deep-link on mount (external URL) ───────────────────────────
  // An externally-pasted `…#risks` URL: read `location.hash` once after
  // first paint and scroll. Section containers render synchronously
  // (tables show their own loading state in place), so the anchor target
  // exists at the correct offset — we don't wait on async table data.
  // The in-app path is handled by the `scrollTo` effect below instead.
  const didHashScrollRef = useRef(false);
  useEffect(() => {
    if (didHashScrollRef.current) return;
    didHashScrollRef.current = true;
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw || !isSectionId(raw)) return;
    scrollToSection(raw);
  }, [scrollToSection]);

  // ── In-app deep-link (Overview→section, issue #413) ──────────────────
  // ProjectHubPage bumps `scrollTo.nonce` each time an Overview summary
  // requests this tab+section, so this scrolls on every request — even
  // when the same section is re-selected. Distinct from the mount-hash
  // effect: that one fires once for external URLs; this one tracks live
  // in-app navigation. Scrolling twice to the same anchor is a harmless
  // no-op, so the two effects need no cross-guard.
  useEffect(() => {
    if (!scrollTo) return;
    scrollToSection(scrollTo.section);
  }, [scrollTo, scrollToSection]);

  const handleNavClick = useCallback(
    (id: SectionId) => () => {
      if (!sectionRefs.current[id]) return;
      scrollToSection(id);
      setActiveId(id);
      // Reflect the section in the URL hash without a history entry so
      // a refresh / share lands back on the same section.
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.hash = id;
        window.history.replaceState(null, "", url.toString());
      }
    },
    [scrollToSection],
  );

  return (
    <div className="v4-hub-decisions">
      <nav
        className="v4-hub-decisions-nav"
        aria-label="Разделы Decisions & Risks"
      >
        {SECTIONS.map((s) => {
          const count = counts[s.id];
          return (
            <button
              key={s.id}
              type="button"
              className={`v4-hub-decisions-navlink${
                activeId === s.id ? " v4-hub-decisions-navlink--on" : ""
              }`}
              aria-current={activeId === s.id ? "true" : undefined}
              onClick={handleNavClick(s.id)}
            >
              <span className="v4-hub-decisions-nav-ic" aria-hidden="true">
                <Icon name={s.icon} />
              </span>
              <span className="v4-hub-decisions-nav-label">{s.title}</span>
              {count !== null ? (
                <span className="v4-hub-decisions-nav-count">{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="v4-hub-decisions-main">
        <section
          id="decisions"
          data-section-id="decisions"
          ref={setSectionRef("decisions")}
          className="v4-hub-decisions-section"
          aria-labelledby="v4-hub-decisions-decisions-title"
        >
          <header className="v4-hub-decisions-head">
            <span className="v4-hub-decisions-ic" aria-hidden="true">
              <Icon name="book" />
            </span>
            <h2
              className="v4-hub-decisions-title"
              id="v4-hub-decisions-decisions-title"
            >
              Журнал решений
              <span className="v4-hub-decisions-count">
                {decisions.length}
              </span>
            </h2>
          </header>
          <DecisionLog decisions={decisions} />
        </section>

        <section
          id="risks"
          data-section-id="risks"
          ref={setSectionRef("risks")}
          className="v4-hub-decisions-section"
          aria-labelledby="v4-hub-decisions-risks-title"
        >
          <header className="v4-hub-decisions-head">
            <span className="v4-hub-decisions-ic" aria-hidden="true">
              <Icon name="alert" />
            </span>
            <h2
              className="v4-hub-decisions-title"
              id="v4-hub-decisions-risks-title"
            >
              Реестр рисков
              {riskCount !== null ? (
                <span className="v4-hub-decisions-count">{riskCount}</span>
              ) : null}
            </h2>
          </header>
          {/* Add affordance is provided by RiskRegisterTable itself. */}
          <RiskRegisterTable repo={repo} onCount={onRiskCount} />
        </section>

        <section
          id="commitments"
          data-section-id="commitments"
          ref={setSectionRef("commitments")}
          className="v4-hub-decisions-section"
          aria-labelledby="v4-hub-decisions-commitments-title"
        >
          <header className="v4-hub-decisions-head">
            <span className="v4-hub-decisions-ic" aria-hidden="true">
              <Icon name="clock" />
            </span>
            <h2
              className="v4-hub-decisions-title"
              id="v4-hub-decisions-commitments-title"
            >
              Обещания
              {commitCount !== null ? (
                <span className="v4-hub-decisions-count">{commitCount}</span>
              ) : null}
            </h2>
          </header>
          {/* Add affordance is provided by CommitmentsTable itself. */}
          <CommitmentsTable repo={repo} onCount={onCommitCount} />
        </section>

        <section
          id="renewals"
          data-section-id="renewals"
          ref={setSectionRef("renewals")}
          className="v4-hub-decisions-section"
          aria-labelledby="v4-hub-decisions-renewals-title"
        >
          <header className="v4-hub-decisions-head">
            <span className="v4-hub-decisions-ic" aria-hidden="true">
              <Icon name="shield" />
            </span>
            <h2
              className="v4-hub-decisions-title"
              id="v4-hub-decisions-renewals-title"
            >
              Продления
              {renewalCount !== null ? (
                <span className="v4-hub-decisions-count">{renewalCount}</span>
              ) : null}
            </h2>
          </header>
          {/* Add affordance is provided by RenewalsTable itself. */}
          <RenewalsTable repo={repo} onCount={onRenewalCount} />
        </section>
      </div>
    </div>
  );
}

export default DecisionsRisksTab;
