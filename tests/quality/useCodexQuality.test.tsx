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

describe("useCodexQuality", () => {
  it("loads data on mount", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => samplePayload });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.isStale).toBe(false);
  });

  it("marks stale when generated_at > 30h old", async () => {
    const old = { ...samplePayload, generated_at: new Date(Date.now() - (STALE_HOURS + 1) * 3.6e6).toISOString() };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => old });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.isStale).toBe(true);
  });

  it("surfaces error on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it("rejects payload with unknown schema_version", async () => {
    const v2 = { ...samplePayload, schema_version: 2 };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => v2 });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/schema_version/);
    expect(result.current.data).toBeNull();
  });

  it("reloadAnnotations only fetches annotations, not the quality payload", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => samplePayload });
    const { result } = renderHook(() => useCodexQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const callsAfterMount = mockFetch.mock.calls.length;
    await result.current.reloadAnnotations();
    expect(mockFetch.mock.calls.length - callsAfterMount).toBe(1);
  });
});
