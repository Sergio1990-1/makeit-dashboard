// @vitest-environment jsdom
// codex-quality.ts reads `window.__MAKEIT_CONFIG__` to resolve URLs;
// jsdom provides the window global the node env lacks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAnnotations,
  createAnnotation,
  deleteAnnotation,
} from "../../src/utils/codex-quality";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

function jsonResp(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("codex-quality api targets /api/annotations (mini-API)", () => {
  it("fetchAnnotations GETs /api/annotations by default", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResp([])));
    await fetchAnnotations();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe("/api/annotations");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("fetchAnnotations swallows 404 (mini-API not deployed) → empty list", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("", { status: 404 })),
    );
    await expect(fetchAnnotations()).resolves.toEqual([]);
  });

  it("createAnnotation POSTs to /api/annotations with JSON body", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResp(
          {
            id: "abc",
            occurred_at: "2026-05-22T00:00:00Z",
            category: "skill",
            scope: "global",
            repos: null,
            title: "t",
            desc: "",
            created_by: "shared-basic-auth",
            created_at: "2026-05-22T00:00:00Z",
          },
          { status: 201 },
        ),
      ),
    );
    await createAnnotation({
      occurred_at: "2026-05-22T00:00:00Z",
      category: "skill",
      scope: "global",
      title: "t",
      desc: "",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe("/api/annotations");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      title: "t",
      category: "skill",
    });
  });

  it("createAnnotation surfaces friendly 413 message", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("too big", { status: 413 })),
    );
    await expect(
      createAnnotation({
        occurred_at: "2026-05-22T00:00:00Z",
        category: "skill",
        scope: "global",
        title: "t",
        desc: "x".repeat(5000),
      }),
    ).rejects.toThrow(/4KB|слишком большое/i);
  });

  it("deleteAnnotation DELETEs /api/annotations/<id>", async () => {
    // 204 requires a null body per the Fetch spec; `new Response("", {status:204})`
    // throws "Invalid response status code 204" in modern runtimes.
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    await deleteAnnotation("xyz");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe("/api/annotations/xyz");
    expect(init?.method).toBe("DELETE");
  });

  it("deleteAnnotation treats 404 as idempotent (no throw)", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("not found", { status: 404 })),
    );
    await expect(deleteAnnotation("missing")).resolves.toBeUndefined();
  });
});
