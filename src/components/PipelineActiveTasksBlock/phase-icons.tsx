import type { ReactNode } from "react";

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const PHASE_ICON: Record<string, ReactNode> = {
  dev: (
    <svg {...baseProps}>
      <path d="M14.5 4.5l5 5L8 21l-5 1 1-5z" />
      <path d="M13 6l5 5" />
    </svg>
  ),
  review: (
    <svg {...baseProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  qa_verify: (
    <svg {...baseProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  merge: (
    <svg {...baseProps}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 8.2v7.6" />
      <path d="M6 12c0-3.3 2.7-6 6-6h3.8" />
    </svg>
  ),
  ci_monitor: (
    <svg {...baseProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
};
