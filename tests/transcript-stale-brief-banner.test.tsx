import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { TranscriptStaleBriefBanner } from "../src/components/v4/transcripts/TranscriptStaleBriefBanner";

afterEach(cleanup);

describe("TranscriptStaleBriefBanner", () => {
  it("renders the stale message and a regenerate button", () => {
    render(<TranscriptStaleBriefBanner onRegenerate={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText(/BRIEF устарел/)).toBeTruthy();
    expect(screen.getByText("Пересобрать BRIEF")).toBeTruthy();
  });

  it("calls onRegenerate and shows a loading label while in flight", async () => {
    let resolve!: () => void;
    const onRegenerate = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(<TranscriptStaleBriefBanner onRegenerate={onRegenerate} />);

    fireEvent.click(screen.getByText("Пересобрать BRIEF"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Пересборка…")).toBeTruthy());

    resolve();
    await waitFor(() => expect(screen.getByText("Пересобрать BRIEF")).toBeTruthy());
  });

  it("shows a recoverable error inline instead of throwing when onRegenerate rejects (409 not stale)", async () => {
    const onRegenerate = vi.fn().mockRejectedValue(
      new Error("Нельзя пересобрать BRIEF: Job job-1's BRIEF is not stale; nothing to regenerate"),
    );
    render(<TranscriptStaleBriefBanner onRegenerate={onRegenerate} />);

    fireEvent.click(screen.getByText("Пересобрать BRIEF"));

    await waitFor(() => expect(screen.getByText(/not stale/)).toBeTruthy());
    // Button returns to its idle label — not stuck disabled/loading forever.
    expect(screen.getByText("Пересобрать BRIEF")).toBeTruthy();
  });
});
