import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectData } from "../../../types";
import type { HubSection, HubTab } from "../../../types/hub";
import { useProjectHub } from "../../../hooks/useProjectHub";
import { unreadCount } from "../../../utils/lastVisitedStore";
import { ProjectHubHeader } from "./ProjectHubHeader";
import { ProjectHubTabs } from "./ProjectHubTabs";

// Lazy tabs — each becomes its own chunk, so switching to Health doesn't
// pull Decision/Risk/DORA modules and vice versa. Health is the heavy one
// (drift engine, GitHub Actions client); the rest are placeholders until
// Epic-011/012 fill them in.
const OverviewTab = lazy(() => import("./tabs/OverviewTab"));
const HealthTab = lazy(() => import("./tabs/HealthTab"));
const ActivityTab = lazy(() => import("./tabs/ActivityTab"));
const DecisionsRisksTab = lazy(() => import("./tabs/DecisionsRisksTab"));
const DeliveryTab = lazy(() => import("./tabs/DeliveryTab"));
const ProcessesTab = lazy(() => import("./tabs/ProcessesTab"));

interface Props {
  repo: string;
  project?: ProjectData;
  onBackToList: () => void;
}

const HUB_TABS: readonly HubTab[] = [
  "overview",
  "health",
  "activity",
  "decisions",
  "delivery",
  "processes",
] as const;

function isHubTab(value: string | null): value is HubTab {
  return value !== null && (HUB_TABS as readonly string[]).includes(value);
}

/**
 * Root of the Project Hub. Owns the `subtab` URL parameter (sibling to
 * ProjectsView's `repo` ownership — they coordinate via the same query
 * string). Mount/popstate/pushState pattern mirrors ProjectsView, but for
 * `subtab` only; `repo` is the parent's concern.
 *
 * Five tab components render lazily; the active tab is gated by a
 * `<Suspense>` so the visible UI shows a skeleton while the chunk
 * downloads. Inactive tabs are not mounted — switching is a
 * conditional render, not a hidden mount.
 */
export function ProjectHubPage({ repo, project, onBackToList }: Props) {
  const data = useProjectHub(repo, project);

  // Inbox badge = Activity events newer than this device's last visit to
  // the Activity tab for `repo` (Epic-011 Task-05). `unreadCount` reads
  // sessionStorage (non-reactive), so a `visitVersion` counter — bumped by
  // ActivityTab once `markVisited` has fired — forces a recompute that
  // drops the badge to 0 after the tab is opened.
  const [visitVersion, setVisitVersion] = useState(0);
  const inboxCount = useMemo(
    () => unreadCount(data.pulse, repo),
    // `visitVersion` is an intentional recompute trigger after markVisited;
    // `data.pulse` and `repo` are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.pulse, repo, visitVersion],
  );
  const handleActivityVisited = useCallback(() => {
    setVisitVersion((v) => v + 1);
  }, []);

  // ─── URL persistence for `subtab` ────────────────────────────────────
  // Mirrors the lastSyncedRef + didMountPushRef pattern from ProjectsView.tsx
  // (Epic-008 Task-01) so an initial render coming from a `?subtab=health`
  // bookmark doesn't push a duplicate history entry, and a value written by
  // popstate doesn't re-push back through the effect.
  const lastSyncedSubtabRef = useRef<HubTab | null>(null);
  const didMountPushRef = useRef(false);

  const [activeTab, setActiveTab] = useState<HubTab>(() => {
    // Lazy initializer reads URL once at mount so the very first render
    // already shows the correct tab — no flash from default → URL value.
    if (typeof window === "undefined") return "overview";
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("subtab");
    return isHubTab(raw) ? raw : "overview";
  });

  // In-app deep-link target for the Decisions tab (FR-14, issue #413).
  // OverviewTab's Risks/Commitments summaries call `onOpenTab("decisions",
  // "<section>")`; this carries the originating section down to
  // DecisionsRisksTab so it scrolls there instead of opening at the top.
  // The `nonce` makes each request a fresh object even when the same
  // section is re-requested, so the child's scroll effect re-fires.
  const [pendingSection, setPendingSection] = useState<{
    section: HubSection;
    nonce: number;
  } | null>(null);
  const sectionNonceRef = useRef(0);

  // Mount cleanup: if the URL arrived with an invalid `subtab=foo`, strip
  // it now so subsequent pushState from the change-effect can't push a
  // history entry with the bogus value. replaceState (not pushState) — the
  // user did not consciously navigate here, we're sanitizing.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("subtab");
    if (raw !== null && !isHubTab(raw)) {
      const url = new URL(window.location.href);
      url.searchParams.delete("subtab");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    // Record what's on the URL now (either valid value or absent) so the
    // pushState effect's first run is a no-op.
    lastSyncedSubtabRef.current = isHubTab(raw) ? raw : null;
    // Mount-only: this effect reads window.location once to sanitize the
    // initial URL; nothing it touches is a reactive value.
  }, []);

  // Push URL whenever activeTab changes (skipping re-syncs from mount/popstate).
  // Single writer of the `#section` hash too: an in-app Overview→Decisions
  // deep-link carries `pendingSection`, so the pushed entry lands on the
  // right section after refresh/share; every other tab switch drops any
  // stale hash so a later non-Decisions tab can't keep `#risks` around.
  useEffect(() => {
    if (!didMountPushRef.current) {
      didMountPushRef.current = true;
      return;
    }
    if (lastSyncedSubtabRef.current === activeTab) return;
    lastSyncedSubtabRef.current = activeTab;
    const url = new URL(window.location.href);
    url.searchParams.set("subtab", activeTab);
    const hash =
      activeTab === "decisions" && pendingSection
        ? `#${pendingSection.section}`
        : "";
    window.history.pushState(
      { subtab: activeTab },
      "",
      url.pathname + url.search + hash,
    );
    // `pendingSection` is set together with `activeTab` in `openTab`, so
    // this effect already sees the latest value on the same render; it is
    // intentionally not a dependency (a later standalone section change
    // must not push a second history entry on its own).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Popstate: re-read URL and sync activeTab. Reading `location.search`
  // directly (not the event's state) is robust to entries pushed without a
  // state object (e.g. by ProjectsView's repo pushState).
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("subtab");
      const next: HubTab = isHubTab(raw) ? raw : "overview";
      // Mirror the value we're committing to state so the pushState effect
      // compares equal and skips. Setting this to `null` when the URL has no
      // `subtab` would mismatch state ("overview") and re-push `subtab=overview`
      // onto the history entry the user just popped to — corrupting back/forward.
      lastSyncedSubtabRef.current = next;
      setActiveTab(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Tab switch with an optional target section (FR-14 in-app deep-link).
  // Plain tab switches (Tabs bar, NBA/Pulse footers) pass no section and
  // clear any stale pending one. Risks/Commitments footers pass their
  // originating section so DecisionsRisksTab lands there. The URL hash is
  // written by the subtab pushState effect below (single writer) so the
  // pushed history entry already carries `#<section>` for refresh/share.
  const openTab = useCallback((tab: HubTab, section?: HubSection) => {
    if (tab === "decisions" && section) {
      sectionNonceRef.current += 1;
      setPendingSection({ section, nonce: sectionNonceRef.current });
    } else {
      setPendingSection(null);
    }
    setActiveTab(tab);
  }, []);

  // Back-to-list: strip `subtab` from URL with replaceState (no extra history
  // entry — the parent's onSelectRepo(null) will pushState to remove `repo`
  // and that becomes the single "back" target). Without this cleanup the
  // parent's pushState would leave an orphan `?subtab=X` after `?repo=` is
  // dropped.
  const handleBack = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("subtab")) {
      url.searchParams.delete("subtab");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    onBackToList();
  }, [onBackToList]);

  return (
    <div className="v4-hub-page">
      <button
        type="button"
        className="v4-hub-back-link"
        onClick={handleBack}
      >
        ← Все проекты
      </button>
      <ProjectHubHeader data={data} />
      <ProjectHubTabs
        active={activeTab}
        onChange={openTab}
        inboxCount={inboxCount}
      />
      <div
        className="v4-hub-tabpanel"
        role="tabpanel"
        id={`v4-hub-tabpanel-${activeTab}`}
        aria-labelledby={`v4-hub-tab-${activeTab}`}
      >
        <Suspense
          fallback={
            <div
              className="v4-tab-skeleton"
              role="status"
              aria-busy="true"
              aria-label="Загружается раздел"
            />
          }
        >
          {activeTab === "overview" && <OverviewTab data={data} onOpenTab={openTab} />}
          {activeTab === "health" && <HealthTab repo={repo} project={project} />}
          {activeTab === "activity" && (
            <ActivityTab repo={repo} onVisited={handleActivityVisited} />
          )}
          {activeTab === "decisions" && (
            <DecisionsRisksTab
              repo={repo}
              decisions={data.decisions}
              scrollTo={pendingSection}
            />
          )}
          {activeTab === "delivery" && <DeliveryTab repo={repo} data={data} />}
          {activeTab === "processes" && <ProcessesTab repo={repo} />}
        </Suspense>
      </div>
    </div>
  );
}
