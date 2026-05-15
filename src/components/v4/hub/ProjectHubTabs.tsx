import type { KeyboardEvent } from "react";
import type { HubTab } from "../../../types/hub";
import { InboxBadge } from "./InboxBadge";

interface Props {
  active: HubTab;
  onChange: (tab: HubTab) => void;
  inboxCount: number;
}

interface TabSpec {
  id: HubTab;
  label: string;
}

const TABS: readonly TabSpec[] = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "Health" },
  { id: "activity", label: "Activity" },
  { id: "decisions", label: "Decisions & Risks" },
  { id: "delivery", label: "Delivery" },
] as const;

/**
 * Horizontal tab list for ProjectHubPage. Pure presentational —
 * state lives in the parent so URL routing stays in one place.
 *
 * Keyboard support follows the WAI-ARIA Authoring Practices for
 * tablists: Tab/Shift-Tab moves in and out of the strip (only the
 * active tab is focusable via roving tabindex), arrow keys move
 * between tabs and activate immediately, Home/End jump to ends.
 */
export function ProjectHubTabs({ active, onChange, inboxCount }: Props) {
  const focusTab = (id: HubTab) => {
    // The browser may render after onChange's state propagates, so
    // schedule focus on the next frame to land on the now-active tab.
    requestAnimationFrame(() => {
      document.getElementById(`v4-hub-tab-${id}`)?.focus();
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % TABS.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TABS.length - 1;
        break;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const nextTab = TABS[nextIndex].id;
      onChange(nextTab);
      focusTab(nextTab);
    }
  };

  return (
    <div className="v4-hub-tabs" role="tablist" aria-label="Project Hub sections">
      {TABS.map((tab, index) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`v4-hub-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`v4-hub-tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            className={`v4-hub-tab${isActive ? " is-active" : ""}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            <span className="v4-hub-tab-label">{tab.label}</span>
            {tab.id === "activity" && <InboxBadge count={inboxCount} />}
          </button>
        );
      })}
    </div>
  );
}
