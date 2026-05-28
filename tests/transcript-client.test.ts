import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTranscriptList,
  fetchTranscriptResult,
  normalizeTranscriptionModel,
} from "../src/utils/transcript";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transcript client", () => {
  it("normalizes legacy fast model to canonical draft", async () => {
    expect(normalizeTranscriptionModel("fast")).toBe("draft");
    expect(normalizeTranscriptionModel("draft")).toBe("draft");
    expect(normalizeTranscriptionModel("quality")).toBe("quality");
    expect(normalizeTranscriptionModel("unknown")).toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              job_id: "job-1",
              project: "mankassa-app",
              file_name: "meeting.mp3",
              status: "done",
              created_at: "2026-05-28T10:00:00Z",
              transcription_model: "fast",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptList()).resolves.toMatchObject([
      { task_id: "job-1", transcription_model: "draft" },
    ]);
  });

  it("adapts quality checks into readable labels and metric messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            job_id: "job-2",
            brief_content: "# BRIEF",
            transcript_text: "Speaker 1: hello",
            quality_report: {
              status: "needs_review",
              score: 0.85,
              checks: {
                speaker_coverage: { status: "pass", value: 1, threshold: 0.9 },
                speaker_resolution: { status: "fail", value: 0, threshold: 0.8 },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptResult("job-2")).resolves.toMatchObject({
      quality: "needs_review",
      quality_report: {
        score: 0.85,
        checks: [
          {
            name: "speaker_coverage",
            label: "Метки спикеров",
            status: "pass",
            message: "значение 1, порог 0.9",
          },
          {
            name: "speaker_resolution",
            label: "Имена спикеров",
            status: "fail",
            message: "значение 0, порог 0.8",
          },
        ],
      },
    });
  });
});
