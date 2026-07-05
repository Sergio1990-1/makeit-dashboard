import { useEffect } from "react";
import type { ReactElement } from "react";
import type { TabId } from "../../types";

type PulseKind = "accent" | "success" | "warn" | "danger";

interface NavItem {
  id: TabId;
  label: string;
  count?: number;
  badge?: number;
  /** Portfolio NBA count pill (Epic-010 Task-07, FR-10). undefined/0 → no
   *  pill. Distinct from `badge` (red danger) — this is a warn-tone pill. */
  nba?: number;
  /** Optional pulsing dot for "new activity since last visit". */
  pulse?: PulseKind;
  icon: ReactElement;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  projectsCount: number;
  milestonesCount: number;
  monitorsCount: number;
  auditAlerts?: number;
  /** Number of portfolio-wide critical health fails. Shown as a red badge
   *  on the «Дашборд» nav item. 0/undefined → no badge rendered. */
  criticalFails?: number;
  /** Portfolio NBA action count for the «Проекты» pill (Epic-010 Task-07,
   *  FR-10). undefined/0 → no pill (no cache or empty portfolio NBA). */
  nbaBadge?: number;
  /** Per-tab activity pulses (null = no dot). */
  pulses?: Partial<Record<TabId, PulseKind>>;
  user?: { initials: string; name: string; role: string };
  isOpen?: boolean;
  onClose?: () => void;
}

const ICON_DASH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);
const ICON_LIST = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7h18M3 12h18M3 17h18" />
  </svg>
);
const ICON_CLOCK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const ICON_MONITOR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const ICON_PIPELINE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M3 12h18M3 18h12" />
  </svg>
);
const ICON_TRANSCRIPT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);
const ICON_SEARCH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);
const ICON_PROJECT_MEMORY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);
const ICON_SPECS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h6" />
  </svg>
);
const ICON_AUDIT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
  </svg>
);
const ICON_QUALITY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12l9-9 9 9-9 9-9-9z" />
  </svg>
);
const ICON_DEBATE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 11.5a8.38 8.38 0 01-9 8.5 8.5 8.5 0 01-7.6-4.7L3 21l1.7-2.4A8.5 8.5 0 0121 11.5z" />
  </svg>
);
const ICON_CODEX_QUALITY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </svg>
);

export function Sidebar({
  activeTab,
  onTabChange,
  projectsCount,
  milestonesCount,
  monitorsCount,
  auditAlerts,
  criticalFails,
  nbaBadge,
  pulses,
  user = { initials: "SM", name: "Сергей М.", role: "owner · MakeIT" },
  isOpen,
  onClose,
}: Props) {
  const p = pulses ?? {};

  const sections: NavSection[] = [
    {
      items: [
        {
          id: "dashboard",
          label: "Дашборд",
          icon: ICON_DASH,
          pulse: p.dashboard,
          // Portfolio-wide critical health fails. App.tsx mounts
          // usePortfolioHealth (single source of truth) and passes the
          // count down so we don't double-mount the hook here.
          badge: criticalFails && criticalFails > 0 ? criticalFails : undefined,
        },
        { id: "projects", label: "Проекты", count: projectsCount, nba: nbaBadge, icon: ICON_LIST, pulse: p.projects },
        { id: "milestones", label: "Milestones", count: milestonesCount, icon: ICON_CLOCK, pulse: p.milestones },
        { id: "codex-quality", label: "Качество кода", icon: ICON_CODEX_QUALITY, pulse: p["codex-quality"] },
        { id: "uptime", label: "Мониторинг", count: monitorsCount || undefined, icon: ICON_MONITOR, pulse: p.uptime },
      ],
    },
    {
      title: "Workflow",
      items: [
        { id: "pipeline", label: "Pipeline", icon: ICON_PIPELINE, pulse: p.pipeline },
        { id: "transcripts", label: "Транскрипты", icon: ICON_TRANSCRIPT, pulse: p.transcripts },
        { id: "project-memory", label: "Память проекта", icon: ICON_PROJECT_MEMORY, pulse: p["project-memory"] },
        { id: "research", label: "Research", icon: ICON_SEARCH, pulse: p.research },
        { id: "specs", label: "Specs", icon: ICON_SPECS, pulse: p.specs },
      ],
    },
    {
      title: "Контроль",
      items: [
        { id: "audit", label: "Аудит", badge: auditAlerts, icon: ICON_AUDIT, pulse: p.audit },
        { id: "quality", label: "Quality", icon: ICON_QUALITY, pulse: p.quality },
        { id: "debate", label: "Debate", icon: ICON_DEBATE, pulse: p.debate },
      ],
    },
  ];

  const handleClick = (id: TabId) => {
    onTabChange(id);
    onClose?.();
  };

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <>
      {isOpen && <div className="v4-side-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`v4-side ${isOpen ? "is-open" : ""}`}
        aria-label="Основная навигация"
      >
        <div className="v4-brand">
          <div className="v4-brand-logo">M</div>
          <div className="v4-brand-name">MakeIT</div>
          <div className="v4-brand-ver">v4</div>
        </div>
        <nav className="v4-nav" aria-label="Разделы">
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {section.title && <div className="v4-nav-section">{section.title}</div>}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`v4-nav-item ${activeTab === item.id ? "is-active" : ""}`}
                  aria-current={activeTab === item.id ? "page" : undefined}
                  onClick={() => handleClick(item.id)}
                >
                  {item.icon}
                  {item.label}
                  {item.count !== undefined && <span className="v4-nav-count">{item.count}</span>}
                  {item.nba !== undefined && item.nba > 0 && (
                    <span
                      className="sidebar-badge"
                      role="status"
                      aria-label={`${item.nba} рекомендованных действий по портфелю`}
                      title={`${item.nba} рекомендованных действий по портфелю`}
                    >
                      {item.nba}
                    </span>
                  )}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="v4-nav-badge">{item.badge}</span>
                  )}
                  {item.pulse && item.badge === undefined && (
                    <span
                      className={`v4-nav-pulse ${item.pulse === "accent" ? "" : `v4-nav-pulse--${item.pulse}`}`}
                      aria-label="новые события"
                    />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="v4-side-foot">
          <div className="v4-ava">{user.initials}</div>
          <div>
            <b>{user.name}</b>
            <span>{user.role}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
