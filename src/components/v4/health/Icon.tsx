// Inline SVG icon set used across the Project Health page. Keeps icons
// next to the components that consume them so reordering / pruning is
// frictionless. Style props are baked into stroke="currentColor" so
// callers control colour via CSS.

interface Props {
  name: IconName;
}

export type IconName =
  | "home" | "grid" | "cpu" | "audit" | "wallet" | "trend" | "search" | "bell"
  | "arrow-left" | "refresh" | "zap" | "alert" | "clock" | "check" | "check-big"
  | "skip" | "chev" | "chev-up" | "lightbulb" | "git-branch" | "book" | "ext"
  | "seedling" | "map" | "shield" | "layers" | "folder";

const baseProps = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({ name }: Props) {
  switch (name) {
    case "home":
      return <svg {...baseProps}><path d="M3 11l9-8 9 8M5 10v10h14V10" /></svg>;
    case "grid":
      return (
        <svg {...baseProps}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case "cpu":
      return (
        <svg {...baseProps}>
          <rect x="5" y="5" width="14" height="14" rx="1" />
          <path d="M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M1 9h3 M1 15h3 M20 9h3 M20 15h3" />
        </svg>
      );
    case "audit":
      return (
        <svg {...baseProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4" />
        </svg>
      );
    case "wallet":
      return <svg {...baseProps}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M16 12h2" /></svg>;
    case "trend":
      return <svg {...baseProps}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>;
    case "search":
      return <svg {...baseProps}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "bell":
      return <svg {...baseProps}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z M10 21a2 2 0 0 0 4 0" /></svg>;
    case "arrow-left":
      return <svg {...baseProps}><path d="M19 12H5 M12 19l-7-7 7-7" /></svg>;
    case "refresh":
      return <svg {...baseProps}><path d="M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5" /></svg>;
    case "zap":
      return <svg {...baseProps}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case "alert":
      return (
        <svg {...baseProps}>
          <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01" />
        </svg>
      );
    case "clock":
      return <svg {...baseProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "check":
      return <svg {...baseProps}><polyline points="20 6 9 17 4 12" /></svg>;
    case "check-big":
      return <svg {...baseProps} strokeWidth={2.5}><circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" /></svg>;
    case "skip":
      return <svg {...baseProps}><circle cx="12" cy="12" r="9" /><path d="M5 5l14 14" /></svg>;
    case "chev":
      return <svg {...baseProps}><polyline points="6 9 12 15 18 9" /></svg>;
    case "chev-up":
      return <svg {...baseProps}><polyline points="18 15 12 9 6 15" /></svg>;
    case "lightbulb":
      return (
        <svg {...baseProps}>
          <path d="M9 21h6 M10 17h4 M12 3a6 6 0 0 0-4 10c1 1 2 2 2 4h4c0-2 1-3 2-4a6 6 0 0 0-4-10z" />
        </svg>
      );
    case "git-branch":
      return (
        <svg {...baseProps}>
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      );
    case "book":
      return <svg {...baseProps}><path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V4z" /></svg>;
    case "ext":
      return <svg {...baseProps}><path d="M14 4h6v6 M20 4l-9 9 M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></svg>;
    case "seedling":
      return <svg {...baseProps}><path d="M12 22V12 M12 12c0-4 3-7 7-7-1 4-3 7-7 7z M12 12C12 8 9 5 2 5c1 4 3 7 10 7z" /></svg>;
    case "map":
      return (
        <svg {...baseProps}>
          <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" />
          <line x1="8" y1="3" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="21" />
        </svg>
      );
    case "shield":
      return <svg {...baseProps}><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "layers":
      return (
        <svg {...baseProps}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "folder":
      return <svg {...baseProps}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    default:
      return null;
  }
}
