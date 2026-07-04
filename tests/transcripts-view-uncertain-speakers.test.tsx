import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { TranscriptsView } from "../src/components/v4/transcripts/TranscriptsView";
import type { ProjectConfig } from "../src/types";

// Integration coverage for issue #545: TranscriptsView wires
// TranscriptSpeakersV4's onUncertainCountChange into the uncertain-speakers
// banner, and the banner disappears once a merge/rename (via
// mergeTranscriptSpeakers) resolves the last uncertain speaker — mirroring
// the existing brief_stale wiring in this same view.

const mockFetch = vi.fn();

const PROJECTS: ProjectConfig[] = [
  { repo: "acme/demo", path: "/tmp/demo", enabled: true } as ProjectConfig,
];

const LIST_ITEM = {
  task_id: "job-1",
  project: "acme/demo",
  file_name: "call.mp3",
  status: "done",
  created_at: "2026-01-01T00:00:00Z",
  transcription_model: "quality",
  processing_profile: "standard_brief",
};

const RESULT = {
  task_id: "job-1",
  brief_content: "# BRIEF\n\nSome content",
  transcript_text: "transcript text",
  quality: null,
  quality_report: null,
  output_mode: "brief",
  primary_artifact: "brief",
  normalized_transcript: "normalized",
  brief_stale: false,
  processing_profile: "standard_brief",
};

const SPEAKERS_WITH_UNCERTAIN = {
  job_id: "job-1",
  brief_stale: false,
  speakers: [
    {
      id: "SPEAKER_00",
      labels: ["SPEAKER_00"],
      display_name: "Иван",
      segment_count: 4,
      quotes: [{ timestamp: "00:00:05", text: "Давайте начнём" }],
      uncertain: false,
    },
    {
      id: "SPEAKER_01",
      labels: ["SPEAKER_01"],
      display_name: "SPEAKER_01",
      segment_count: 2,
      quotes: [{ timestamp: "00:00:20", text: "Согласен" }],
      uncertain: true,
    },
  ],
};

const SPEAKERS_RESOLVED = {
  job_id: "job-1",
  brief_stale: false,
  speakers: [
    {
      id: "SPEAKER_00",
      labels: ["SPEAKER_00", "SPEAKER_01"],
      display_name: "Иван",
      segment_count: 6,
      quotes: [{ timestamp: "00:00:05", text: "Давайте начнём" }],
      uncertain: false,
    },
  ],
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});
afterEach(cleanup);

describe("TranscriptsView uncertain speakers banner", () => {
  it("shows the banner while a speaker is uncertain, and hides it once merge resolves it", async () => {
    let merged = false;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/transcript/list")) return Promise.resolve(jsonResp([LIST_ITEM]));
      if (u.includes("/transcript/result/")) return Promise.resolve(jsonResp(RESULT));
      if (u.includes("/speakers/merge") && init?.method === "POST") {
        merged = true;
        return Promise.resolve(
          jsonResp({
            job_id: "job-1",
            canonical_name: "Иван",
            speaker_ids: ["SPEAKER_00", "SPEAKER_01"],
            updated_segment_count: 6,
            normalized_transcript: "normalized",
            brief_stale: false,
          }),
        );
      }
      if (u.includes("/speakers")) {
        return Promise.resolve(jsonResp(merged ? SPEAKERS_RESOLVED : SPEAKERS_WITH_UNCERTAIN));
      }
      return Promise.resolve(jsonResp({}));
    });

    render(<TranscriptsView projects={PROJECTS} />);

    // History loads, then open the "done" job to reach briefResult.
    await waitFor(() => expect(screen.getByText("Открыть")).toBeTruthy());
    fireEvent.click(screen.getByText("Открыть"));

    // Speakers panel loads and reports one uncertain speaker — banner shows.
    await waitFor(() =>
      expect(
        screen.getByText(/Есть 1 нераспознанных спикеров — проверьте перед отправкой клиенту/),
      ).toBeTruthy(),
    );

    // Merge the uncertain speaker into the canonical one via the existing UI.
    fireEvent.click(screen.getByLabelText("Выбрать спикера Иван"));
    fireEvent.click(screen.getByLabelText("Выбрать спикера SPEAKER_01"));
    fireEvent.change(screen.getByLabelText("Итоговое имя для выбранных спикеров"), {
      target: { value: "Иван" },
    });
    fireEvent.click(screen.getByText("Объединить"));

    // Banner disappears once the refetched speaker list has no uncertain
    // speakers left.
    await waitFor(() =>
      expect(screen.queryByText(/Есть нераспознанные спикеры/)).toBeNull(),
    );
  });
});
