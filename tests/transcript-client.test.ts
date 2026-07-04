import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchTranscriptList,
  fetchTranscriptResult,
  fetchTranscriptSpeakers,
  mergeTranscriptSpeakers,
  continueToBrief,
  regenerateBrief,
  downloadTranscriptDocx,
  normalizeTranscriptionModel,
  normalizeOutputMode,
  normalizeProcessingProfile,
  uploadTranscript,
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

  it("normalizes output_mode, defaulting unknown values to brief", () => {
    expect(normalizeOutputMode("normalized_transcript")).toBe("normalized_transcript");
    expect(normalizeOutputMode("brief")).toBe("brief");
    expect(normalizeOutputMode(undefined)).toBe("brief");
    expect(normalizeOutputMode("unknown")).toBe("brief");
  });

  it("fetchTranscriptResult maps output_mode/primary_artifact/normalized_transcript/brief_stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            job_id: "job-3",
            brief_content: "",
            transcript_text: "",
            output_mode: "normalized_transcript",
            primary_artifact: "normalized_transcript",
            normalized_transcript: "# Транскрипт\n\n[00:00:00] Иван: Привет",
            brief_stale: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptResult("job-3")).resolves.toMatchObject({
      task_id: "job-3",
      brief: "",
      output_mode: "normalized_transcript",
      primary_artifact: "normalized_transcript",
      normalized_transcript: "# Транскрипт\n\n[00:00:00] Иван: Привет",
      brief_stale: false,
    });
  });

  it("fetchTranscriptResult defaults output_mode/primary_artifact to brief and brief_stale to false when absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ job_id: "job-4", brief_content: "# BRIEF" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptResult("job-4")).resolves.toMatchObject({
      output_mode: "brief",
      primary_artifact: "brief",
      normalized_transcript: "",
      brief_stale: false,
    });
  });

  it("normalizes processing_profile, defaulting unknown/absent values to standard_brief", () => {
    expect(normalizeProcessingProfile("dev_handoff")).toBe("dev_handoff");
    expect(normalizeProcessingProfile("standard_brief")).toBe("standard_brief");
    expect(normalizeProcessingProfile(undefined)).toBe("standard_brief");
    expect(normalizeProcessingProfile("unknown")).toBe("standard_brief");
  });

  it("fetchTranscriptResult maps processing_profile, defaulting to standard_brief when absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ job_id: "job-3b", brief_content: "# BRIEF" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptResult("job-3b")).resolves.toMatchObject({
      processing_profile: "standard_brief",
    });
  });

  it("fetchTranscriptResult passes through a dev_handoff processing_profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            job_id: "job-3c",
            brief_content: "# Dev Handoff",
            processing_profile: "dev_handoff",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptResult("job-3c")).resolves.toMatchObject({
      processing_profile: "dev_handoff",
    });
  });

  it("fetchTranscriptList maps processing_profile, defaulting to standard_brief when absent (legacy rows predating processing_profile)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              job_id: "job-3d",
              project: "mankassa-app",
              file_name: "legacy.mp3",
              status: "done",
              created_at: "2026-05-01T10:00:00Z",
            },
            {
              job_id: "job-3e",
              project: "mankassa-app",
              file_name: "handoff.mp3",
              status: "done",
              created_at: "2026-05-02T10:00:00Z",
              processing_profile: "dev_handoff",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptList()).resolves.toMatchObject([
      { task_id: "job-3d", processing_profile: "standard_brief" },
      { task_id: "job-3e", processing_profile: "dev_handoff" },
    ]);
  });

  it("uploadTranscript includes output_mode in the multipart form", async () => {
    class FakeXHR {
      static instances: FakeXHR[] = [];
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      status = 200;
      responseText = "";
      sentBody: FormData | null = null;
      open() {
        /* no-op */
      }
      send(body: FormData) {
        this.sentBody = body;
        FakeXHR.instances.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);

    const file = new File(["hello"], "meeting.txt", { type: "text/plain" });
    const promise = uploadTranscript(
      file,
      "proj",
      "quality",
      undefined,
      undefined,
      "normalized_transcript",
    );

    const xhr = FakeXHR.instances[0];
    expect(xhr.sentBody?.get("output_mode")).toBe("normalized_transcript");
    expect(xhr.sentBody?.get("project_context")).toBe("proj");

    xhr.responseText = JSON.stringify({ job_id: "job-5", status: "queued", brief_url: "" });
    xhr.onload?.();

    await expect(promise).resolves.toMatchObject({ task_id: "job-5", status: "queued" });
  });

  it("uploadTranscript defaults output_mode to brief when not passed", async () => {
    class FakeXHR {
      static instances: FakeXHR[] = [];
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      status = 200;
      responseText = "";
      sentBody: FormData | null = null;
      open() {
        /* no-op */
      }
      send(body: FormData) {
        this.sentBody = body;
        FakeXHR.instances.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);

    const file = new File(["hello"], "meeting.txt", { type: "text/plain" });
    const promise = uploadTranscript(file, "proj");

    const xhr = FakeXHR.instances[0];
    expect(xhr.sentBody?.get("output_mode")).toBe("brief");

    xhr.responseText = JSON.stringify({ job_id: "job-6", status: "queued", brief_url: "" });
    xhr.onload?.();
    await promise;
  });

  it("uploadTranscript includes processing_profile in the multipart form", async () => {
    class FakeXHR {
      static instances: FakeXHR[] = [];
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      status = 200;
      responseText = "";
      sentBody: FormData | null = null;
      open() {
        /* no-op */
      }
      send(body: FormData) {
        this.sentBody = body;
        FakeXHR.instances.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);

    const file = new File(["hello"], "meeting.txt", { type: "text/plain" });
    const promise = uploadTranscript(
      file,
      "proj",
      "quality",
      undefined,
      undefined,
      "brief",
      "dev_handoff",
    );

    const xhr = FakeXHR.instances[0];
    expect(xhr.sentBody?.get("processing_profile")).toBe("dev_handoff");

    xhr.responseText = JSON.stringify({ job_id: "job-6b", status: "queued", brief_url: "" });
    xhr.onload?.();
    await promise;
  });

  it("uploadTranscript defaults processing_profile to standard_brief when not passed", async () => {
    class FakeXHR {
      static instances: FakeXHR[] = [];
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      status = 200;
      responseText = "";
      sentBody: FormData | null = null;
      open() {
        /* no-op */
      }
      send(body: FormData) {
        this.sentBody = body;
        FakeXHR.instances.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);

    const file = new File(["hello"], "meeting.txt", { type: "text/plain" });
    const promise = uploadTranscript(file, "proj");

    const xhr = FakeXHR.instances[0];
    expect(xhr.sentBody?.get("processing_profile")).toBe("standard_brief");

    xhr.responseText = JSON.stringify({ job_id: "job-6c", status: "queued", brief_url: "" });
    xhr.onload?.();
    await promise;
  });

  it("continueToBrief resolves on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ job_id: "job-7", status: "queued", brief_url: "" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await expect(continueToBrief("job-7")).resolves.toMatchObject({
      task_id: "job-7",
      status: "queued",
    });
  });

  it("continueToBrief throws a friendly message for 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Job job-7 not found" }), { status: 404 }),
      ),
    );
    await expect(continueToBrief("job-7")).rejects.toThrow(/не найдена/);
  });

  it("continueToBrief surfaces the backend detail for 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "Job job-7 is already running (status='processing')" }),
          { status: 409 },
        ),
      ),
    );
    await expect(continueToBrief("job-7")).rejects.toThrow(/already running/);
  });

  it("regenerateBrief throws a friendly message for 409 (not stale)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "Job job-8's BRIEF is not stale; nothing to regenerate" }),
          { status: 409 },
        ),
      ),
    );
    await expect(regenerateBrief("job-8")).rejects.toThrow(/not stale/);
  });

  it("regenerateBrief throws for 422 (missing artifacts)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "Cannot regenerate job job-8: manifest or stt artifacts missing" }),
          { status: 422 },
        ),
      ),
    );
    await expect(regenerateBrief("job-8")).rejects.toThrow(/manifest or stt artifacts missing/);
  });

  it("regenerateBrief resolves on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ job_id: "job-9", status: "queued", brief_url: "" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await expect(regenerateBrief("job-9")).resolves.toMatchObject({
      task_id: "job-9",
      status: "queued",
    });
  });

  describe("downloadTranscriptDocx", () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    it("fetches the export endpoint and triggers a browser download using the Content-Disposition filename", async () => {
      const blob = new Blob(["docx-bytes"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const fetchMock = vi.fn(
        async () =>
          new Response(blob, {
            status: 200,
            headers: { "content-disposition": 'attachment; filename="BRIEF-job-12.docx"' },
          }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await downloadTranscriptDocx("job-12");

      expect(String(fetchMock.mock.calls[0][0])).toContain(
        "/transcript/result/job-12/export/docx",
      );
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    it("falls back to a transcript-{id}.docx filename when Content-Disposition is missing", async () => {
      const blob = new Blob(["docx-bytes"]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(blob, { status: 200 })),
      );

      let capturedFilename = "";
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === "a") {
          Object.defineProperty(el, "download", {
            set: (v: string) => {
              capturedFilename = v;
            },
            get: () => capturedFilename,
          });
        }
        return el;
      });

      await downloadTranscriptDocx("job-13");

      expect(capturedFilename).toBe("transcript-job-13.docx");
    });

    it("throws a friendly message for 404", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ detail: "Job job-14 not found" }), { status: 404 })),
      );
      await expect(downloadTranscriptDocx("job-14")).rejects.toThrow(/не найдена/);
    });

    it("surfaces the backend detail for 422 (missing artifact)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({ detail: "Job job-15 has no brief content to export yet" }),
              { status: 422 },
            ),
        ),
      );
      await expect(downloadTranscriptDocx("job-15")).rejects.toThrow(/no brief content to export yet/);
    });
  });

  it("fetchTranscriptSpeakers maps speakers with quotes/labels/uncertain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            job_id: "job-10",
            brief_stale: false,
            speakers: [
              {
                id: "SPEAKER_00",
                labels: ["SPEAKER_00"],
                display_name: "Иван",
                segment_count: 4,
                quotes: [{ timestamp: "00:00:05", text: "Первая фраза" }],
                uncertain: false,
              },
              {
                id: "SPEAKER_01",
                labels: ["SPEAKER_01"],
                display_name: "SPEAKER_01",
                segment_count: 2,
                quotes: [],
                uncertain: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchTranscriptSpeakers("job-10")).resolves.toEqual({
      task_id: "job-10",
      brief_stale: false,
      speakers: [
        {
          id: "SPEAKER_00",
          labels: ["SPEAKER_00"],
          display_name: "Иван",
          segment_count: 4,
          quotes: [{ timestamp: "00:00:05", text: "Первая фраза" }],
          uncertain: false,
        },
        {
          id: "SPEAKER_01",
          labels: ["SPEAKER_01"],
          display_name: "SPEAKER_01",
          segment_count: 2,
          quotes: [],
          uncertain: true,
        },
      ],
    });
  });

  it("mergeTranscriptSpeakers sends speaker_ids (not display_name) in the request body", async () => {
    let sentBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            job_id: "job-11",
            canonical_name: "Иван",
            speaker_ids: ["SPEAKER_00", "SPEAKER_01"],
            updated_segment_count: 2,
            normalized_transcript: "# Транскрипт\n\n[00:00:00] Иван: ...",
            brief_stale: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await mergeTranscriptSpeakers("job-11", "Иван", ["SPEAKER_00", "SPEAKER_01"]);

    expect(sentBody).toEqual({ canonical_name: "Иван", speaker_ids: ["SPEAKER_00", "SPEAKER_01"] });
    expect(result).toMatchObject({
      task_id: "job-11",
      canonical_name: "Иван",
      speaker_ids: ["SPEAKER_00", "SPEAKER_01"],
      updated_segment_count: 2,
      brief_stale: false,
    });
  });

  it("mergeTranscriptSpeakers throws a friendly message for unknown speaker id (422)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "Unknown speaker id(s) for job job-11: SPEAKER_99" }),
          { status: 422 },
        ),
      ),
    );
    await expect(
      mergeTranscriptSpeakers("job-11", "Иван", ["SPEAKER_99"]),
    ).rejects.toThrow(/SPEAKER_99/);
  });
});
