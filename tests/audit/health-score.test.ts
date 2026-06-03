import { describe, it, expect } from "vitest";
import { computeScore } from "../../src/utils/health-engine";
import type {
  ChecklistDocument,
  HealthFinding,
  HealthSeverity,
  FindingStatus,
  HealthLayer,
} from "../../src/types/health";

const SEVERITY_WEIGHTS: Record<HealthSeverity, number> = {
  critical: 10,
  high: 5,
  medium: 3,
  low: 1,
};

const DOC = {
  severity_weights: SEVERITY_WEIGHTS,
} as unknown as ChecklistDocument;

let counter = 0;
function finding(
  status: FindingStatus,
  severity: HealthSeverity = "high",
  layer: HealthLayer = 1,
): HealthFinding {
  counter += 1;
  return {
    rule_id: `rule-${counter}`,
    title: `rule ${counter}`,
    layer,
    severity,
    status,
  };
}

describe("computeScore — normal full-data case is preserved", () => {
  it("all-pass scan => 100 / grade A", () => {
    const findings = [finding("pass"), finding("pass"), finding("pass")];
    const score = computeScore(findings, DOC);
    expect(score.raw).toBe(100);
    expect(score.grade).toBe("A");
  });

  it("a single high fail among passes deducts exactly its weight", () => {
    const findings = [finding("pass"), finding("pass"), finding("fail", "high")];
    const score = computeScore(findings, DOC);
    // 100 - 5 = 95, still A. Deduction unchanged from legacy behaviour.
    expect(score.raw).toBe(95);
    expect(score.grade).toBe("A");
  });

  it("multiple fails accumulate weights (legacy behaviour)", () => {
    const findings = [
      finding("fail", "critical"), // -10
      finding("fail", "high"), // -5
      finding("pass"),
      finding("pass"),
      finding("pass"),
      finding("pass"),
      finding("pass"),
    ];
    const score = computeScore(findings, DOC);
    expect(score.raw).toBe(85); // 100 - 15
    expect(score.grade).toBe("B");
  });

  it("skipped (not-applicable) findings never affect coverage or score", () => {
    const findings = [
      finding("pass"),
      finding("pass"),
      finding("skipped"),
      finding("skipped"),
      finding("skipped"),
    ];
    const score = computeScore(findings, DOC);
    expect(score.raw).toBe(100);
    expect(score.grade).toBe("A");
  });
});

describe("computeScore — A7: unknown must NOT be scored as pass", () => {
  it("an all-unknown scan does NOT yield grade A", () => {
    const findings = [
      finding("unknown"),
      finding("unknown"),
      finding("unknown"),
      finding("unknown"),
    ];
    const score = computeScore(findings, DOC);
    // A perfect grade fabricated from zero real signal is the bug.
    expect(score.grade).not.toBe("A");
    expect(score.raw).toBeLessThan(90);
  });

  it("a scan that is mostly unknown is down-weighted vs a real all-pass scan", () => {
    const mostlyUnknown = [
      finding("pass"),
      finding("unknown"),
      finding("unknown"),
      finding("unknown"),
      finding("unknown"),
    ];
    const allPass = [
      finding("pass"),
      finding("pass"),
      finding("pass"),
      finding("pass"),
      finding("pass"),
    ];
    const a = computeScore(mostlyUnknown, DOC);
    const b = computeScore(allPass, DOC);
    expect(a.raw).toBeLessThan(b.raw);
  });

  it("a small fraction of unknown does not meaningfully dent a healthy grade", () => {
    // 1 unknown out of 10 scoring findings — below the caveat threshold.
    const findings = [
      finding("unknown"),
      ...Array.from({ length: 9 }, () => finding("pass")),
    ];
    const score = computeScore(findings, DOC);
    expect(score.grade).toBe("A");
    expect(score.raw).toBeGreaterThanOrEqual(90);
  });

  it("unknown coverage caveat is clamped to 0..100", () => {
    const findings = Array.from({ length: 8 }, () => finding("unknown"));
    const score = computeScore(findings, DOC);
    expect(score.raw).toBeGreaterThanOrEqual(0);
    expect(score.raw).toBeLessThanOrEqual(100);
  });

  it("Layer-4 unknowns (deferred-by-design) do NOT trigger the caveat", () => {
    // Normal sync scan: Layers 1–3 all pass, Layer 4 is all-unknown because
    // the AI/drift checks are deferred. Grade must stay A — the caveat only
    // measures missing data in the deterministic layers.
    const findings = [
      finding("pass", "high", 1),
      finding("pass", "high", 2),
      finding("pass", "high", 3),
      finding("unknown", "high", 4),
      finding("unknown", "high", 4),
      finding("unknown", "high", 4),
      finding("unknown", "high", 4),
      finding("unknown", "high", 4),
    ];
    const score = computeScore(findings, DOC);
    expect(score.grade).toBe("A");
    expect(score.raw).toBe(100);
  });
});

describe("computeScore — A1: recompute path reflects merged drift fails", () => {
  it("merging Layer-4 fails into a clean report lowers the recomputed grade", () => {
    // Simulate the useProjectHealth merge: sync findings (all pass) + drift
    // Layer-4 findings with fails. Recompute must pick up the new deductions.
    const syncFindings = [finding("pass", "high", 1), finding("pass", "high", 2)];
    const before = computeScore(syncFindings, DOC);
    expect(before.grade).toBe("A");

    const driftFails = [
      finding("fail", "critical", 4),
      finding("fail", "high", 4),
      finding("fail", "high", 4),
    ];
    const merged = [...syncFindings, ...driftFails];
    const after = computeScore(merged, DOC);
    // 100 - (10 + 5 + 5) = 80 => B. Grade must drop, not stay A.
    expect(after.raw).toBeLessThan(before.raw);
    expect(after.grade).not.toBe("A");
  });
});
