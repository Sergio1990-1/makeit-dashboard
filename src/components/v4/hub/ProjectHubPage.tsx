import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectData } from "../../../types";
import type { HubTab } from "../../../types/hub";
import { useProjectHub } from "../../../hooks/useProjectHub";
import { ProjectHubHeader } from "./ProjectHubHeader";

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
 * Tab content slot is a placeholder until Epic-009 Task-03 lands
 * `<ProjectHubTabs>` and the lazy tab components.
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
      <div className="v4-hub-tabs-placeholder" aria-hidden="true">
        Tabs placeholder (Task-03): active = <code>{activeTab}</code>
      </div>
      <div className="v4-hub-content-placeholder">
        Content placeholder for <code>subtab={activeTab}</code> (Task-03/04 fill this in)
      </div>
    </div>
  );
}
