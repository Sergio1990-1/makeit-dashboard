import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { QualityChart } from "../../src/components/quality/QualityChart";
import type { QualityBucket } from "../../src/types/quality";

const buckets: QualityBucket[] = [
  { total_pr: 10, with_p0: 0, with_p1_only: 1, with_p2_only: 2 },
  { total_pr: 20, with_p0: 0, with_p1_only: 0, with_p2_only: 4 },
];
const labels = ["2026-05-23", "2026-05-24"];

describe("QualityChart", () => {
  it("renders one bar per bucket", () => {
    const { container } = render(
      <QualityChart buckets={buckets} labels={labels} compact={false} />
    );
    expect(container.querySelectorAll(".bar")).toHaveLength(2);
  });

  it("renders crit/p2/clean segments for non-empty bucket", () => {
    const { container } = render(
      <QualityChart buckets={buckets} labels={labels} compact={false} />
    );
    const firstBar = container.querySelector(".bar")!;
    expect(firstBar.querySelector(".bar-crit")).toBeTruthy();
    expect(firstBar.querySelector(".bar-p2")).toBeTruthy();
    expect(firstBar.querySelector(".bar-clean")).toBeTruthy();
  });

  it("auto-scales y-axis via niceCeil (max=20 → 20)", () => {
    const { container } = render(
      <QualityChart buckets={buckets} labels={labels} compact={false} />
    );
    const axis = container.querySelector(".chart-axis-label");
    expect(axis?.textContent).toBe("20");
  });

  it("applies has-p0 class to buckets with P0 findings", () => {
    const withP0: QualityBucket[] = [
      { total_pr: 5, with_p0: 1, with_p1_only: 0, with_p2_only: 1 },
      { total_pr: 5, with_p0: 0, with_p1_only: 0, with_p2_only: 0 },
    ];
    const { container } = render(
      <QualityChart buckets={withP0} labels={labels} compact={false} />
    );
    const bars = container.querySelectorAll(".bar");
    expect(bars[0].classList.contains("has-p0")).toBe(true);
    expect(bars[1].classList.contains("has-p0")).toBe(false);
  });

  it("renders bar-topper-p0 for non-compact when with_p0 > 0", () => {
    const withP0: QualityBucket[] = [
      { total_pr: 5, with_p0: 2, with_p1_only: 0, with_p2_only: 0 },
    ];
    const { container } = render(
      <QualityChart buckets={withP0} labels={["2026-05-23"]} compact={false} />
    );
    const topper = container.querySelector(".bar-topper-p0");
    expect(topper).toBeTruthy();
    expect(topper?.textContent).toContain("P0:2");
  });

  it("does NOT render bar-topper-p0 in compact mode", () => {
    const withP0: QualityBucket[] = [
      { total_pr: 5, with_p0: 2, with_p1_only: 0, with_p2_only: 0 },
    ];
    const { container } = render(
      <QualityChart buckets={withP0} labels={["2026-05-23"]} compact={true} />
    );
    expect(container.querySelector(".bar-topper-p0")).toBeNull();
  });

  it("uses card-chart wrapper class in compact mode", () => {
    const { container } = render(
      <QualityChart buckets={buckets} labels={labels} compact={true} />
    );
    expect(container.querySelector(".card-chart")).toBeTruthy();
    expect(container.querySelector(".chart-axis")).toBeNull();
  });

  it("applies is-low-sample class when total_pr < LOW_SAMPLE (8)", () => {
    const lowSample: QualityBucket[] = [
      { total_pr: 3, with_p0: 0, with_p1_only: 0, with_p2_only: 1 },
      { total_pr: 12, with_p0: 0, with_p1_only: 0, with_p2_only: 0 },
    ];
    const { container } = render(
      <QualityChart buckets={lowSample} labels={labels} compact={false} />
    );
    const bars = container.querySelectorAll(".bar");
    expect(bars[0].classList.contains("is-low-sample")).toBe(true);
    expect(bars[1].classList.contains("is-low-sample")).toBe(false);
  });

  it("renders single tooltip element per chart (perf — pre-created structure)", () => {
    const { container } = render(
      <QualityChart buckets={buckets} labels={labels} compact={false} />
    );
    expect(container.querySelectorAll(".chart-tip")).toHaveLength(1);
  });

  it("renders chart-tip--compact in compact mode", () => {
    const { container } = render(
      <QualityChart buckets={buckets} labels={labels} compact={true} />
    );
    expect(container.querySelector(".chart-tip--compact")).toBeTruthy();
  });
});
