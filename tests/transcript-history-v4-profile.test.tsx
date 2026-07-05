import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { TranscriptHistoryV4 } from "../src/components/v4/transcripts/TranscriptHistoryV4";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ITEMS = [
  {
    job_id: "job-standard",
    project: "mankassa-app",
    file_name: "standard.mp3",
    status: "done",
    created_at: "2026-05-01T10:00:00Z",
    file_type: "audio",
    transcription_model: "quality",
    processing_profile: "standard_brief",
  },
  {
    job_id: "job-dev",
    project: "mankassa-app",
    file_name: "dev.mp3",
    status: "done",
    created_at: "2026-05-02T10:00:00Z",
    file_type: "audio",
    transcription_model: "quality",
    processing_profile: "dev_handoff",
  },
  {
    job_id: "job-client",
    project: "mankassa-app",
    file_name: "client.mp3",
    status: "done",
    created_at: "2026-05-03T10:00:00Z",
    file_type: "audio",
    transcription_model: "quality",
    processing_profile: "client_brief",
  },
  {
    job_id: "job-legacy",
    project: "mankassa-app",
    file_name: "legacy.mp3",
    status: "done",
    created_at: "2026-04-01T10:00:00Z",
    file_type: "audio",
    transcription_model: "quality",
    // no processing_profile — pre-#1300 row
  },
];

describe("TranscriptHistoryV4 — processing_profile badge", () => {
  it("shows a profile badge for standard_brief, dev_handoff, and legacy (defaulted) rows", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResp(ITEMS)));
    render(
      <TranscriptHistoryV4
        onOpen={vi.fn()}
        onResume={vi.fn()}
        onRetry={vi.fn()}
        refreshKey={0}
      />,
    );

    await waitFor(() => expect(screen.getByText("standard.mp3")).toBeTruthy());

    const badges = screen.getAllByTitle("Обычный BRIEF");
    expect(badges.length).toBe(2); // job-standard + job-legacy (defaulted)
    expect(screen.getByTitle("Dev handoff").textContent).toBe("Dev handoff");
    expect(screen.getByTitle("Для клиента").textContent).toBe("Для клиента");
  });
});
