import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { TranscriptSpeakersV4 } from "../src/components/v4/transcripts/TranscriptSpeakersV4";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});
afterEach(cleanup);

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SPEAKERS_PAYLOAD = {
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

async function renderAndExpand() {
  render(<TranscriptSpeakersV4 taskId="job-1" />);
  await waitFor(() => expect(screen.getByText("Иван")).toBeTruthy());
}

describe("TranscriptSpeakersV4", () => {
  it("lists speakers with display name, id, segment count, quotes and an uncertain badge", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResp(SPEAKERS_PAYLOAD)));
    await renderAndExpand();

    expect(screen.getByText("Иван")).toBeTruthy();
    expect(screen.getByText("SPEAKER_00")).toBeTruthy();
    expect(screen.getByText("4 реплик")).toBeTruthy();
    expect(screen.getByText("Давайте начнём")).toBeTruthy();
    expect(screen.getByText("00:00:05")).toBeTruthy();

    // Unidentified speaker: display_name equals id ("SPEAKER_01" appears
    // twice — once as the name, once as the id badge).
    expect(screen.getAllByText("SPEAKER_01")).toHaveLength(2);
    expect(screen.getByText("не опознан")).toBeTruthy();
  });

  it("shows a recoverable inline error instead of crashing when speakers can't be loaded (422)", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResp({ detail: "Job job-1 has no enriched_stt.json yet; stt stage not complete" }, 422),
      ),
    );
    render(<TranscriptSpeakersV4 taskId="job-1" />);
    await waitFor(() => expect(screen.getByText(/enriched_stt\.json/)).toBeTruthy());
  });

  it("sends stable speaker ids (not display_name) in the merge request, and calls onMerged on success", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({ canonical_name: "Иван", speaker_ids: ["SPEAKER_00", "SPEAKER_01"] });
        return Promise.resolve(
          jsonResp({
            job_id: "job-1",
            canonical_name: "Иван",
            speaker_ids: ["SPEAKER_00", "SPEAKER_01"],
            updated_segment_count: 2,
            normalized_transcript: "# Транскрипт\n\n[00:00:00] Иван: ...",
            brief_stale: false,
          }),
        );
      }
      // GET /speakers — same grouped payload for the post-merge refetch too;
      // the test only cares that the POST body used ids, not this shape.
      return Promise.resolve(jsonResp(SPEAKERS_PAYLOAD));
    });

    const onMerged = vi.fn();
    render(<TranscriptSpeakersV4 taskId="job-1" onMerged={onMerged} />);
    await waitFor(() => expect(screen.getByText("Иван")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Выбрать спикера Иван"));
    fireEvent.click(screen.getByLabelText("Выбрать спикера SPEAKER_01"));
    fireEvent.change(screen.getByLabelText("Итоговое имя для выбранных спикеров"), {
      target: { value: "Иван" },
    });
    fireEvent.click(screen.getByText("Объединить"));

    await waitFor(() => expect(onMerged).toHaveBeenCalledTimes(1));
  });

  it("a single selected speaker is offered as a rename, not a merge", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResp(SPEAKERS_PAYLOAD)));
    await renderAndExpand();

    fireEvent.click(screen.getByLabelText("Выбрать спикера SPEAKER_01"));
    fireEvent.change(screen.getByLabelText("Итоговое имя для выбранных спикеров"), {
      target: { value: "Мария" },
    });
    expect(screen.getByText("Переименовать")).toBeTruthy();
  });

  it("shows a recoverable inline error instead of crashing when merge fails (409)", async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResp({ detail: "Job job-1 is still running" }, 409));
      }
      return Promise.resolve(jsonResp(SPEAKERS_PAYLOAD));
    });

    await (async () => {
      render(<TranscriptSpeakersV4 taskId="job-1" />);
      await waitFor(() => expect(screen.getByText("Иван")).toBeTruthy());
    })();

    fireEvent.click(screen.getByLabelText("Выбрать спикера Иван"));
    fireEvent.change(screen.getByLabelText("Итоговое имя для выбранных спикеров"), {
      target: { value: "Пётр" },
    });
    fireEvent.click(screen.getByText("Переименовать"));

    await waitFor(() => expect(screen.getByText(/still running/)).toBeTruthy());
  });

  it("merge button stays disabled until both a speaker is selected and a name is entered", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResp(SPEAKERS_PAYLOAD)));
    await renderAndExpand();

    const button = screen.getByText("Переименовать") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Выбрать спикера Иван"));
    expect((screen.getByText("Переименовать") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Итоговое имя для выбранных спикеров"), {
      target: { value: "Пётр" },
    });
    expect((screen.getByText("Переименовать") as HTMLButtonElement).disabled).toBe(false);
  });
});
