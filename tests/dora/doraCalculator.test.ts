import { describe, it, expect } from "vitest";
import { computeDora } from "../../src/utils/doraCalculator";
import type { DoraInputs } from "../../src/utils/doraCalculator";
import type { CommitInfo } from "../../src/utils/github-contents";

// Fixed reference "now" so windows are deterministic.
const NOW = Date.parse("2026-06-03T00:00:00Z");
const DAY = 86_400_000;

/** Build a CommitInfo with only the fields the calculator reads. */
function commit(subject: string, isoDate: string): CommitInfo {
  return {
    sha: "0".repeat(40),
    subject,
    message: subject,
    author: "test",
    date: isoDate,
    url: "https://example.com",
  };
}

/** Days-ago ISO timestamp relative to NOW. */
function daysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

/** Minimal inputs with no PRs/incidents/audit findings. */
function baseInputs(commits: CommitInfo[]): DoraInputs {
  return {
    commits,
    pullRequests: [],
    incidents: null,
    auditFindings: [],
  };
}

describe("computeDora — deploy classification (issue 527 D6)", () => {
  it("does NOT count a fix: commit as a deploy", () => {
    // A single fix: commit, well inside the window, fully elapsed.
    const inputs = baseInputs([commit("fix: patch a bug", daysAgo(15))]);
    const res = computeDora(inputs, 30, NOW);
    // No feat:/release: → zero deploys → deploys/day == 0.
    expect(res.deployFreq).toBe(0);
    // With zero deploys the CFR denominator is empty → n/a sentinel.
    expect(res.cfr).toBeNull();
  });

  it("counts feat: and release: commits as deploys", () => {
    const inputs = baseInputs([
      commit("feat: add thing", daysAgo(20)),
      commit("release: v1.2.0", daysAgo(10)),
    ]);
    const res = computeDora(inputs, 30, NOW);
    // 2 deploys over a 30-day window → 2/30 deploys/day.
    expect(res.deployFreq).toBeCloseTo(2 / 30, 10);
  });

  it("excludes hotfixes from deploy frequency (fix: alongside feat:)", () => {
    const inputs = baseInputs([
      commit("feat: ship feature", daysAgo(25)),
      commit("fix: hotfix one", daysAgo(24)),
      commit("fix: hotfix two", daysAgo(23)),
    ]);
    const res = computeDora(inputs, 30, NOW);
    // Only the single feat: counts — hotfixes no longer inflate the numerator.
    expect(res.deployFreq).toBeCloseTo(1 / 30, 10);
  });
});

describe("computeDora — CFR trailing-window guard (issue 527 D7)", () => {
  it("excludes a deploy whose 7-day failure window has NOT fully elapsed", () => {
    // One feat: deploy 3 days ago → its 7d lookahead ends 4 days in the FUTURE.
    // It must be excluded from the CFR denominator. No other deploys → n/a.
    const inputs = baseInputs([commit("feat: recent ship", daysAgo(3))]);
    const res = computeDora(inputs, 30, NOW);
    // Deploy frequency still counts the deploy (it happened) ...
    expect(res.deployFreq).toBeCloseTo(1 / 30, 10);
    // ... but CFR has no judgeable deploy → n/a sentinel, NOT a misleading 0%.
    expect(res.cfr).toBeNull();
    expect(res.tiers.cfr).toBe("na");
  });

  it("judges only deploys whose 7d window is fully elapsed", () => {
    // Deploy A: 20 days ago (window elapsed, no following fix → success).
    // Deploy B: 2 days ago (window NOT elapsed → excluded from denominator).
    const inputs = baseInputs([
      commit("feat: old ship", daysAgo(20)),
      commit("feat: fresh ship", daysAgo(2)),
    ]);
    const res = computeDora(inputs, 30, NOW);
    // Only deploy A is judgeable, and it had no failure → CFR == 0/1 == 0.
    expect(res.cfr).toBe(0);
  });
});

describe("computeDora — failure attribution (issue 527)", () => {
  it("counts a feat: deploy followed within 7d by a fix: as a failure", () => {
    // feat: deploy 15 days ago (window elapsed), fix: 12 days ago (3d later, within 7d).
    const inputs = baseInputs([
      commit("feat: ship feature", daysAgo(15)),
      commit("fix: regression from feature", daysAgo(12)),
    ]);
    const res = computeDora(inputs, 30, NOW);
    // 1 judgeable deploy, 1 failure → CFR == 1.
    expect(res.cfr).toBe(1);
    expect(res.tiers.cfr).toBe("low");
  });

  it("does not attribute a fix: that lands more than 7d after the deploy", () => {
    // feat: 20 days ago, fix: 10 days ago → gap is 10 days (> 7d) → not a failure.
    const inputs = baseInputs([
      commit("feat: ship feature", daysAgo(20)),
      commit("fix: unrelated later", daysAgo(10)),
    ]);
    const res = computeDora(inputs, 30, NOW);
    // Deploy's 7d window (ends 13 days ago) is fully elapsed and saw no fix → CFR 0.
    expect(res.cfr).toBe(0);
  });
});
