import { describe, it, expect } from "vitest";
import { getProjectName, formatUptime } from "../../src/components/v4/monitoring/utils";
import { MONITOR_MATCH } from "../../src/utils/config";
import type { Monitor } from "../../src/types";

function makeMonitor(partial: Partial<Monitor>): Monitor {
  return {
    id: "1",
    name: "",
    url: "",
    status: "up",
    uptimePct: 100,
    lastCheckedAt: null,
    ...partial,
  };
}

describe("getProjectName — port boundary safety (U2)", () => {
  it("does NOT match :8000 keyword against a :18000 URL (substring collision)", () => {
    // Business-News owns the "8000" keyword. A monitor on :18000 must not
    // be misattributed to Business-News via bare substring matching.
    const m = makeMonitor({
      name: "Some unrelated service",
      url: "https://example.com:18000/health",
    });
    expect(getProjectName(m)).not.toBe("Business-News");
  });

  it("does NOT match :8001 keyword against a :80012 URL", () => {
    // Sewing-ERP owns "8001"; :80012 must not collide.
    const m = makeMonitor({
      name: "Other service",
      url: "https://example.com:80012/status",
    });
    expect(getProjectName(m)).not.toBe("Sewing-ERP");
  });

  it("does match the port at a real boundary (:8000 → Business-News)", () => {
    const m = makeMonitor({
      name: "biznews backend",
      url: "https://node.example.com:8000/healthz",
    });
    expect(getProjectName(m)).toBe("Business-News");
  });

  it("matches port when URL ends exactly with the port (no trailing path)", () => {
    const m = makeMonitor({
      name: "Sewing service",
      url: "https://node.example.com:8001",
    });
    expect(getProjectName(m)).toBe("Sewing-ERP");
  });
});

describe("getProjectName — keyword matching (U2)", () => {
  it("matches Business-News by the 'biznews' keyword (content keyword removed)", () => {
    const m = makeMonitor({
      name: "biznews-kg production",
      url: "https://biznews.example.com",
    });
    expect(getProjectName(m)).toBe("Business-News");
  });

  it("does NOT match Business-News via the generic word 'content'", () => {
    // The "content" keyword was removed because it collides with unrelated
    // monitors that merely contain the word "content".
    expect(MONITOR_MATCH["Business-News"]).not.toContain("content");
    const m = makeMonitor({
      name: "Some content delivery service",
      url: "https://cdn.example.com/content",
    });
    expect(getProjectName(m)).not.toBe("Business-News");
  });

  it("still matches non-numeric keywords as substrings (sewing → Sewing-ERP)", () => {
    const m = makeMonitor({
      name: "sewing-erp api",
      url: "https://sewing.example.com",
    });
    expect(getProjectName(m)).toBe("Sewing-ERP");
  });

  it("returns null when nothing matches", () => {
    const m = makeMonitor({
      name: "totally unrelated",
      url: "https://nowhere.example.com",
    });
    expect(getProjectName(m)).toBeNull();
  });
});

describe("formatUptime — floor to 2 decimals (U5)", () => {
  it("floors 99.999 to 99.99 (does not round up to 100.00)", () => {
    expect(formatUptime(99.999)).toBe("99.99");
  });

  it("floors 99.995 to 99.99 (the U5 reported case)", () => {
    expect(formatUptime(99.995)).toBe("99.99");
  });

  it("shows 100.00 only when value is exactly 100", () => {
    expect(formatUptime(100)).toBe("100.00");
  });

  it("does not invent extra precision (99.9 → 99.90)", () => {
    expect(formatUptime(99.9)).toBe("99.90");
  });

  it("floors a mid value (95.678 → 95.67)", () => {
    expect(formatUptime(95.678)).toBe("95.67");
  });

  it("returns the em-dash for null (preserves existing null handling)", () => {
    expect(formatUptime(null)).toBe("—");
  });

  it("returns the em-dash for NaN / non-finite", () => {
    expect(formatUptime(NaN)).toBe("—");
    expect(formatUptime(Infinity)).toBe("—");
  });
});
