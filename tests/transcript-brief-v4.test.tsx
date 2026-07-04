import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { TranscriptBriefV4 } from "../src/components/v4/transcripts/TranscriptBriefV4";
import type { TranscriptResult } from "../src/utils/transcript";

afterEach(cleanup);

function makeResult(overrides: Partial<TranscriptResult> = {}): TranscriptResult {
  return {
    task_id: "job-1",
    brief: "# BRIEF\n\nРешение принято.",
    transcript: "",
    quality: null,
    quality_report: null,
    output_mode: "brief",
    primary_artifact: "brief",
    normalized_transcript: "",
    brief_stale: false,
    ...overrides,
  };
}

describe("TranscriptBriefV4 — primary_artifact rendering", () => {
  it("shows BRIEF as the main content and offers editing when primary_artifact is brief", () => {
    render(
      <TranscriptBriefV4
        result={makeResult()}
        onNewUpload={vi.fn()}
        onEdit={vi.fn()}
        onContinueToBrief={vi.fn()}
      />,
    );
    expect(screen.getByText("Решение принято.")).toBeTruthy();
    expect(screen.getByText("Редактировать")).toBeTruthy();
    // brief-mode job — no continue action offered.
    expect(screen.queryByText("Сгенерировать BRIEF")).toBeNull();
  });

  it("shows normalized_transcript as the main content and hides editing when primary_artifact is normalized_transcript", () => {
    render(
      <TranscriptBriefV4
        result={makeResult({
          brief: "",
          output_mode: "normalized_transcript",
          primary_artifact: "normalized_transcript",
          normalized_transcript: "# Транскрипт\n\nПривет всем",
        })}
        onNewUpload={vi.fn()}
        onEdit={vi.fn()}
        onContinueToBrief={vi.fn()}
      />,
    );
    expect(screen.getByText("Привет всем")).toBeTruthy();
    // Empty brief_content is not treated as an error — no error banner,
    // and no editor for content that doesn't exist yet.
    expect(screen.queryByText("Редактировать")).toBeNull();
    expect(screen.queryByText(/ошибк/i)).toBeNull();
  });

  it("offers 'Сгенерировать BRIEF' only for a normalized_transcript-mode job, and it calls onContinueToBrief", async () => {
    const onContinueToBrief = vi.fn().mockResolvedValue(undefined);
    render(
      <TranscriptBriefV4
        result={makeResult({
          brief: "",
          output_mode: "normalized_transcript",
          primary_artifact: "normalized_transcript",
          normalized_transcript: "# Транскрипт\n\nПривет",
        })}
        onNewUpload={vi.fn()}
        onEdit={vi.fn()}
        onContinueToBrief={onContinueToBrief}
      />,
    );

    const btn = screen.getByText("Сгенерировать BRIEF");
    fireEvent.click(btn);
    expect(onContinueToBrief).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Генерация…")).toBeNull());
  });

  it("shows a recoverable inline error (not a crash) when onContinueToBrief rejects with a 409", async () => {
    const onContinueToBrief = vi.fn().mockRejectedValue(
      new Error(
        "Нельзя продолжить обработку: Job job-1 has output_mode='brief'; only a normalized_transcript job can be continued to BRIEF",
      ),
    );
    render(
      <TranscriptBriefV4
        result={makeResult({
          brief: "",
          output_mode: "normalized_transcript",
          primary_artifact: "normalized_transcript",
          normalized_transcript: "# Транскрипт\n\nПривет",
        })}
        onNewUpload={vi.fn()}
        onEdit={vi.fn()}
        onContinueToBrief={onContinueToBrief}
      />,
    );

    fireEvent.click(screen.getByText("Сгенерировать BRIEF"));
    await waitFor(() => expect(screen.getByText(/only a normalized_transcript job/)).toBeTruthy());
    // Button is back to its idle label, not stuck.
    expect(screen.getByText("Сгенерировать BRIEF")).toBeTruthy();
  });

  it("offers the normalized_transcript accordion as a secondary tab when primary_artifact is brief", () => {
    render(
      <TranscriptBriefV4
        result={makeResult({ normalized_transcript: "# Транскрипт\n\nОчищенный текст здесь" })}
        onNewUpload={vi.fn()}
        onEdit={vi.fn()}
        onContinueToBrief={vi.fn()}
      />,
    );
    const toggle = screen.getByText("Нормализованный транскрипт");
    expect(screen.queryByText("Очищенный текст здесь")).toBeNull(); // collapsed by default
    fireEvent.click(toggle);
    expect(screen.getByText("Очищенный текст здесь")).toBeTruthy();
  });

  it("does not duplicate the normalized_transcript accordion when it is already the primary content", () => {
    render(
      <TranscriptBriefV4
        result={makeResult({
          brief: "",
          output_mode: "normalized_transcript",
          primary_artifact: "normalized_transcript",
          normalized_transcript: "# Транскрипт\n\nПривет",
        })}
        onNewUpload={vi.fn()}
        onEdit={vi.fn()}
        onContinueToBrief={vi.fn()}
      />,
    );
    expect(screen.queryByText("Нормализованный транскрипт")).toBeNull();
  });
});
