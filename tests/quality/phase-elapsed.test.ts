import { describe, it, expect } from "vitest";
import {
  phaseElapsedSeconds,
  type PhaseAnchor,
} from "../../src/components/PipelineActiveTasksBlock/helpers";

describe("phaseElapsedSeconds", () => {
  const anchor: PhaseAnchor = {
    key: "dev",
    baseSecs: 100,
    nowMs: 10_000,
  };

  it("ticks smoothly between polls for a running phase (base + client elapsed)", () => {
    // 3s of wall-clock have passed since the anchor was taken.
    expect(phaseElapsedSeconds("running", "dev", anchor, 13_000)).toBe(103);
  });

  it("does NOT re-snap when a new poll grows baseSecs (steady ticking)", () => {
    // Two consecutive polls 2s apart. The server's baseSecs grew 100 -> 102
    // but the anchor (taken at phase entry, baseSecs=100) is unchanged, so the
    // displayed value depends only on wall-clock, never jumping backward/forward.
    const at5s = phaseElapsedSeconds("running", "dev", anchor, 15_000); // 105
    const at7s = phaseElapsedSeconds("running", "dev", anchor, 17_000); // 107
    expect(at5s).toBe(105);
    expect(at7s).toBe(107);
    // Monotonic, +1 per second, no snap.
    expect(at7s - at5s).toBe(2);
  });

  it("falls back to server baseSecs when the phase identity differs from the anchor", () => {
    // Phase advanced to 'review' but anchor still points at 'dev' (not yet
    // re-anchored). We render the server value verbatim, no stale ticking.
    expect(phaseElapsedSeconds("running", "review", anchor, 99_999, 42)).toBe(42);
  });

  it("shows no live elapsed for a non-running phase (renders server baseSecs)", () => {
    // success/failure/pending must not tick; show the server-reported duration.
    expect(phaseElapsedSeconds("success", "dev", anchor, 999_999, 250)).toBe(250);
    expect(phaseElapsedSeconds("failure", "dev", anchor, 999_999, 250)).toBe(250);
  });

  it("never returns a negative elapsed if clock skews backward", () => {
    // nowMs before anchor.nowMs → clamp the client delta at 0.
    expect(phaseElapsedSeconds("running", "dev", anchor, 9_000)).toBe(100);
  });

  it("floors fractional seconds", () => {
    // 1900ms since anchor → 1 whole second, base 100 → 101.
    expect(phaseElapsedSeconds("running", "dev", anchor, 11_900)).toBe(101);
  });
});

describe("phaseElapsedSeconds anchoring contract", () => {
  it("uses anchor.baseSecs (captured at phase entry), not the live server baseSecs", () => {
    // anchor captured base=100 at 10_000ms. A later poll reports server base=130
    // (passed as the 5th arg). For the matching running phase we ignore the live
    // server value and use anchor.baseSecs + client delta → deterministic ticking.
    const anchor: PhaseAnchor = { key: "review", baseSecs: 100, nowMs: 10_000 };
    expect(phaseElapsedSeconds("running", "review", anchor, 12_000, 130)).toBe(102);
  });
});
