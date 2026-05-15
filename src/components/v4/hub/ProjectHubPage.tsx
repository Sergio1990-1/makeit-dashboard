import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ProjectData } from "../../../types";
import type { HubTab } from "../../../types/hub";
import { useProjectHub } from "../../../hooks/useProjectHub";
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
  useEffect(() => {
    if (!didMountPushRef.current) {
      didMountPushRef.current = true;
      return;
    }
    if (lastSyncedSubtabRef.current === activeTab) return;
    lastSyncedSubtabRef.current = activeTab;
    const url = new URL(window.location.href);
    url.searchParams.set("subtab", activeTab);
    window.history.pushState({ subtab: activeTab }, "", url.pathname + url.search);
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
        onChange={setActiveTab}
        inboxCount={data.inboxCount}
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
          {activeTab === "overview" && <OverviewTab data={data} onOpenTab={setActiveTab} />}
          {activeTab === "health" && <HealthTab repo={repo} project={project} />}
          {activeTab === "activity" && <ActivityTab />}
          {activeTab === "decisions" && <DecisionsRisksTab />}
          {activeTab === "delivery" && <DeliveryTab />}
        </Suspense>
      </div>
    </div>
  );
}
