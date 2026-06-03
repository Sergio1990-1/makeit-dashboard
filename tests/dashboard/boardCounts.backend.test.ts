// @vitest-environment node
import { describe, it, expect } from "vitest";
import { boardIssueCounts } from "../../server/src/transform";
import type { Issue } from "../../server/src/types";

// ── issue 519 (cache backend mirror): the cache backend must derive
//    open/done/total from the same board subset as the direct-GitHub
//    fallback, so both paths produce identical counts. An issue counts as
//    "done" iff `closedAt` is set.

/** Minimal board issue: only the fields `boardIssueCounts` reads. */
function issue(id: string, closed: boolean): Issue {
  return {
    id,
    number: null,
    title: id,
    url: "",
    status: closed ? "Done" : "Todo",
    priority: null,
    labels: [],
    repo: "r",
    milestoneTitle: null,
    isBlocked: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    closedAt: closed ? "2026-01-02T00:00:00Z" : null,
  };
}

describe("boardIssueCounts (backend mirror of issue 519)", () => {
  it("returns all-zero counts for an empty board", () => {
    expect(boardIssueCounts([])).toEqual({ openCount: 0, doneCount: 0, totalCount: 0 });
  });

  it("counts done = closedAt set, open = the rest, total = board length", () => {
    const issues = [
      issue("a", false),
      issue("b", true),
      issue("c", false),
      issue("d", true),
      issue("e", true),
    ];
    expect(boardIssueCounts(issues)).toEqual({ openCount: 2, doneCount: 3, totalCount: 5 });
  });

  it("treats a fully-closed board as all done (all-tracked case unchanged)", () => {
    const issues = [issue("a", true), issue("b", true), issue("c", true)];
    expect(boardIssueCounts(issues)).toEqual({ openCount: 0, doneCount: 3, totalCount: 3 });
  });

  it("uses closedAt — not status — as the closed signal", () => {
    const closedButTodo: Issue = { ...issue("x", true), status: "Todo" };
    const openButReview: Issue = { ...issue("y", false), status: "Review" };
    expect(boardIssueCounts([closedButTodo, openButReview])).toEqual({
      openCount: 1,
      doneCount: 1,
      totalCount: 2,
    });
  });

  it("keeps total = open + done (parts sum to the whole)", () => {
    const issues = [issue("a", false), issue("b", true), issue("c", false)];
    const { openCount, doneCount, totalCount } = boardIssueCounts(issues);
    expect(openCount + doneCount).toBe(totalCount);
  });
});
