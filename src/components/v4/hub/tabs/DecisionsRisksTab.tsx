import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../../health/Icon";
import { DecisionLog } from "../DecisionLog";
import { RiskRegisterTable } from "../RiskRegisterTable";
import { CommitmentsTable } from "../CommitmentsTable";
import { RenewalsTable } from "../RenewalsTable";
import type { Decision } from "../../../../types/hub";

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
 * Deep-link: OverviewTab's NBA / Risks / Commitments summaries switch
 * to this tab via the parent's `?subtab=decisions`. FR-14 wants those
 * to land on the right section, so this tab reads `location.hash` on
 * mount and smooth-scrolls to the matching `<section id>` once the
 * sections are mounted (their containers render synchronously; the
 * self-fetching tables show their own loading state in place, so the
 * anchor target exists and resolves at the correct offset immediately).
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
}

type SectionId = "decisions" | "risks" | "commitments" | "renewals";

interface SectionDef {
  id: SectionId;
  title: string;
  icon: IconName;
}

/** Fixed order — Decision Log → Risk Register → Commitments → Renewals. */
const SECTIONS: readonly SectionDef[] = [
  { id: "decisions", title: "Decision Log", icon: "book" },
  { id: "risks", title: "Risk Register", icon: "alert" },
  { id: "commitments", title: "Commitments", icon: "clock" },
  { id: "renewals", title: "Renewals", icon: "shield" },
] as const;

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

export function DecisionsRisksTab({ decisions, repo }: Props) {
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

  // ── Hash deep-link on mount ──────────────────────────────────────────
  // OverviewTab switches to this tab via `?subtab=decisions` (state, not
  // hash), but FR-14 deep-links carry a `#section` so the tab can land
  // on the right block. Scroll once, after first paint, when a matching
  // hash is present. Section containers render synchronously (tables
  // show their own loading state in place), so the anchor target exists
  // at the correct offset — we don't wait on async table data.
  const didHashScrollRef = useRef(false);
  useEffect(() => {
    if (didHashScrollRef.current) return;
    didHashScrollRef.current = true;
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw || !isSectionId(raw)) return;
    const el = sectionRefs.current[raw];
    if (!el) return;
    // Scroll only. The active-nav highlight is owned by the
    // IntersectionObserver — it fires as this scroll lands and sets
    // `activeId`, so we must NOT setState here (that would be a
    // synchronous effect setState; the observer is the single source
    // of truth for the active section).
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleNavClick = useCallback(
    (id: SectionId) => () => {
      const el = sectionRefs.current[id];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
      // Reflect the section in the URL hash without a history entry so
      // a refresh / share lands back on the same section.
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.hash = id;
        window.history.replaceState(null, "", url.toString());
      }
    },
    [],
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
              Decision Log
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
              Risk Register
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
              Commitments
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
              Renewals
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
