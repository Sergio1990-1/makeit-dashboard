import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { UploadZone } from "../src/components/v4/transcripts/UploadZone";
import type { ProjectConfig } from "../src/types";

afterEach(cleanup);

const PROJECTS: ProjectConfig[] = [
  { repo: "mankassa-app", client: "Сергей", owner: "Sergio1990-1", budget: 0, paid: 0 },
];

function renderUploadZone(overrides: Partial<Parameters<typeof UploadZone>[0]> = {}) {
  const setSelectedOutputMode = vi.fn();
  const props = {
    projects: PROJECTS,
    selectedProject: "mankassa-app",
    setSelectedProject: vi.fn(),
    selectedModel: "quality" as const,
    setSelectedModel: vi.fn(),
    selectedOutputMode: "brief" as const,
    setSelectedOutputMode,
    onSubmit: vi.fn(),
    ...overrides,
  };
  const utils = render(<UploadZone {...props} />);
  return { ...utils, setSelectedOutputMode };
}

describe("UploadZone output_mode selector", () => {
  it("defaults to BRIEF selected", () => {
    renderUploadZone();
    const briefBtn = screen.getByText("📋 BRIEF");
    expect(briefBtn.className).toContain("is-active");
  });

  it("switches to normalized_transcript when the Транскрипт pill is clicked", () => {
    const { setSelectedOutputMode } = renderUploadZone();
    fireEvent.click(screen.getByText("📄 Транскрипт"));
    expect(setSelectedOutputMode).toHaveBeenCalledWith("normalized_transcript");
  });

  it("reflects normalized_transcript as the active pill when selected", () => {
    renderUploadZone({ selectedOutputMode: "normalized_transcript" });
    expect(screen.getByText("📄 Транскрипт").className).toContain("is-active");
    expect(screen.getByText("📋 BRIEF").className).not.toContain("is-active");
  });

  it("shows the output mode selector regardless of file type (not gated on audio)", () => {
    // No files added yet — the model (draft/quality) pill only appears
    // once an audio file is selected, but output mode must always be
    // visible since both audio and text uploads go through the same
    // output_mode gate on the backend.
    renderUploadZone();
    expect(screen.getByText("Результат")).toBeTruthy();
  });
});
