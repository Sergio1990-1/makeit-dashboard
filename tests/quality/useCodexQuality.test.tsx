import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCodexQuality } from "../../src/hooks/useCodexQuality";

const STALE_HOURS = 30;
const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

const samplePayload = {
  schema_version: 1,
  generated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  window_start: "x",
  window_end: "y",
  bucket_tz: "UTC",
  repo_status: {},
  buckets: {
    "30d": { labels: [], summary: [], per_repo: {} },
    "12w": { labels: [], summary: [], per_repo: {} },
  },
};

function jsonResp(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockAlways(body: unknown, init: ResponseInit = {}) {
  // Fresh Response per call — Response bodies are single-use; reusing one
  // throws "Body has already been read" on the second fetch.
  mockFetch.mockImplementation(() => Promise.resolve(jsonResp(body, init)));
}

describe("useCodexQuality", () => {
  it("loads data on mount", async () => {
    mockAlways(samplePayload);
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.unavailable).toBe(false);
  });

  it("marks stale when generated_at > 30h old", async () => {
    const old = { ...samplePayload, generated_at: new Date(Date.now() - (STALE_HOURS + 1) * 3.6e6).toISOString() };
    mockAlways(old);
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.isStale).toBe(true);
  });

  it("marks unavailable on 404 (backend not deployed)", async () => {
    mockAlways({}, { status: 404 });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("marks unavailable when nginx SPA-fallback serves HTML for missing JSON", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("<!doctype html><html><body>404</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it("surfaces non-unavailable error (e.g. 500)", async () => {
    mockAlways({ detail: "broken" }, { status: 500 });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.unavailable).toBe(false);
  });

  it("rejects payload with unknown schema_version", async () => {
    mockAlways({ ...samplePayload, schema_version: 2 });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/schema_version/);
    expect(result.current.data).toBeNull();
  });

  it("reloadAnnotations only fetches annotations, not the quality payload", async () => {
    mockAlways(samplePayload);
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const callsAfterMount = mockFetch.mock.calls.length;
    await result.current.reloadAnnotations();
    expect(mockFetch.mock.calls.length - callsAfterMount).toBe(1);
  });
});
