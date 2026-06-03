/**
 * #523 — surface `ProjectData.fetchError` in project cards.
 *
 * A repo whose GitHub fetch failed renders with placeholder-zero counts, which
 * is indistinguishable from a genuinely empty repo unless we flag it. These
 * tests pin the "⚠ ошибка загрузки" badge to `fetchError === true` only, on
 * both cards that show a project's counts/progress:
 *   - DashboardProjectCard (Дашборд tab)
 *   - ProjectScorecard      (Проекты tab)
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DashboardProjectCard } from "../../src/components/v4/DashboardProjectCard";
import { ProjectScorecard } from "../../src/components/v4/portfolio/ProjectScorecard";
import type { ProjectData } from "../../src/types";

// Minimal healthy ProjectData; tests override only `fetchError`.
function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    repo: "owner/repo",
    client: "MakeIT",
    phase: "development" as ProjectData["phase"],
    issues: [],
    priorityCounts: { P1: 0, P2: 0, P3: 0, P4: 0 } as ProjectData["priorityCounts"],
    progress: 50,
    lastCommitDate: "2026-06-01",
    description: "",
    openCount: 0,
    doneCount: 0,
    totalCount: 0,
    milestones: [],
    budget: 0,
    paid: 0,
    remaining: 0,
    daysSinceActivity: 1,
    lastActivityDate: "2026-06-02",
    velocity7d: 0,
    velocity14d: 0,
    etaDays: null,
    etaDate: null,
    cycleTimeDays: null,
    commitActivity: { total: 0, weeks: [] } as unknown as ProjectData["commitActivity"],
    ...overrides,
  };
}

const BADGE = /ошибка загрузки/;

describe("DashboardProjectCard — fetchError badge [issue 523]", () => {
  it("shows the badge when fetchError === true", () => {
    const { container } = render(
      <DashboardProjectCard project={makeProject({ fetchError: true })} />,
    );
    expect(container.querySelector(".v4-chip--error")).toBeTruthy();
    expect(container.textContent).toMatch(BADGE);
  });

  it("hides the badge when fetchError === false", () => {
    const { container } = render(
      <DashboardProjectCard project={makeProject({ fetchError: false })} />,
    );
    expect(container.querySelector(".v4-chip--error")).toBeNull();
    expect(container.textContent).not.toMatch(BADGE);
  });

  it("hides the badge when fetchError is absent (cache-backend path)", () => {
    const { container } = render(
      <DashboardProjectCard project={makeProject()} />,
    );
    expect(container.querySelector(".v4-chip--error")).toBeNull();
    expect(container.textContent).not.toMatch(BADGE);
  });
});

describe("ProjectScorecard — fetchError badge [issue 523]", () => {
  const base = {
    repo: "owner/repo",
    tier: 2 as const,
    phase: "development" as ProjectData["phase"],
    grade: null,
    kpis: { open: 0, inProgress: 0, blocked: 0, overdueCommitments: 0 },
    drift: {},
    daysSinceActivity: 1,
    onSelectRepo: () => {},
  };

  it("shows the badge when fetchError === true", () => {
    const { container } = render(<ProjectScorecard {...base} fetchError />);
    expect(container.textContent).toMatch(BADGE);
  });

  it("hides the badge when fetchError === false", () => {
    const { container } = render(
      <ProjectScorecard {...base} fetchError={false} />,
    );
    expect(container.textContent).not.toMatch(BADGE);
  });

  it("hides the badge when fetchError is absent", () => {
    const { container } = render(<ProjectScorecard {...base} />);
    expect(container.textContent).not.toMatch(BADGE);
  });
});
