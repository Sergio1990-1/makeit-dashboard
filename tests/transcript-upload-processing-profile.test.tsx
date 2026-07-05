import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { UploadZone } from "../src/components/v4/transcripts/UploadZone";
import type { ProjectConfig } from "../src/types";

afterEach(cleanup);

const PROJECTS: ProjectConfig[] = [
  { repo: "mankassa-app", client: "Сергей", owner: "Sergio1990-1", budget: 0, paid: 0 },
];

function renderUploadZone(overrides: Partial<Parameters<typeof UploadZone>[0]> = {}) {
  const setSelectedProcessingProfile = vi.fn();
  const props = {
    projects: PROJECTS,
    selectedProject: "mankassa-app",
    setSelectedProject: vi.fn(),
    selectedModel: "quality" as const,
    setSelectedModel: vi.fn(),
    selectedOutputMode: "brief" as const,
    setSelectedOutputMode: vi.fn(),
    selectedProcessingProfile: "standard_brief" as const,
    setSelectedProcessingProfile,
    onSubmit: vi.fn(),
    ...overrides,
  };
  const utils = render(<UploadZone {...props} />);
  return { ...utils, setSelectedProcessingProfile };
}

describe("UploadZone processing_profile selector", () => {
  it("defaults to Обычный selected", () => {
    renderUploadZone();
    const standardBtn = screen.getByText("Обычный");
    expect(standardBtn.className).toContain("is-active");
  });

  it("switches to dev_handoff when the Для разработки pill is clicked", () => {
    const { setSelectedProcessingProfile } = renderUploadZone();
    fireEvent.click(screen.getByText("Для разработки"));
    expect(setSelectedProcessingProfile).toHaveBeenCalledWith("dev_handoff");
  });

  it("reflects dev_handoff as the active pill when selected", () => {
    renderUploadZone({ selectedProcessingProfile: "dev_handoff" });
    expect(screen.getByText("Для разработки").className).toContain("is-active");
    expect(screen.getByText("Обычный").className).not.toContain("is-active");
  });

  it("switches to client_brief when the Для клиента pill is clicked", () => {
    const { setSelectedProcessingProfile } = renderUploadZone();
    fireEvent.click(screen.getByText("Для клиента"));
    expect(setSelectedProcessingProfile).toHaveBeenCalledWith("client_brief");
  });

  it("reflects client_brief as the active pill when selected", () => {
    renderUploadZone({ selectedProcessingProfile: "client_brief" });
    expect(screen.getByText("Для клиента").className).toContain("is-active");
    expect(screen.getByText("Обычный").className).not.toContain("is-active");
    expect(screen.getByText("Для разработки").className).not.toContain("is-active");
  });

  it("shows the profile selector regardless of file type (not gated on audio)", () => {
    renderUploadZone();
    expect(screen.getByText("Формат BRIEF")).toBeTruthy();
  });
});
