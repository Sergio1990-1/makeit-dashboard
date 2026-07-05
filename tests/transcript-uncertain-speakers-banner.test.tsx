import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TranscriptUncertainSpeakersBanner } from "../src/components/v4/transcripts/TranscriptUncertainSpeakersBanner";

afterEach(cleanup);

describe("TranscriptUncertainSpeakersBanner", () => {
  it("renders a reminder with the uncertain speaker count and no action button", () => {
    render(<TranscriptUncertainSpeakersBanner count={2} />);
    expect(screen.getByText(/Есть нераспознанные спикеры/)).toBeTruthy();
    expect(screen.getByText(/Есть 2 нераспознанных спикеров — проверьте перед отправкой клиенту/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the singular count too", () => {
    render(<TranscriptUncertainSpeakersBanner count={1} />);
    expect(screen.getByText(/Есть 1 нераспознанных спикеров — проверьте перед отправкой клиенту/)).toBeTruthy();
  });
});
