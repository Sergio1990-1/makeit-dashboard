import { describe, it, expect } from "vitest";
import { boardIssueCounts } from "../../src/utils/github";
import type { Issue } from "../../src/types";

// ── issue 519: the Project #1 board (`repoIssues`) is the single source of truth
//    for open/done/total. Previously open/done came from repo-wide
//    `issues().totalCount`, so when an issue wasn't on the board the parts
//    didn't sum to the whole. These counts must now be derived purely from
//    the board subset, an issue counting as "done" iff `closedAt` is set —
//    the same closed-signal velocity/cycle-time/milestone hydration use.

/** Minimal board issue: only the fields `boardIssueCounts` reads. */
function issue(id: string, closed: boolean): Issue {
  return {
    id,
    number: null,
    title: id,
    url: "",
    status: closed ? "Done" : "Todo",
    priority: null,
    complexity: null,
    labels: [],
    repo: "r",
    milestoneTitle: null,
    isBlocked: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    closedAt: closed ? "2026-01-02T00:00:00Z" : null,
  };
}

describe("boardIssueCounts (issue 519: board as single source of truth)", () => {
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

  it("treats a fully-open board as all open", () => {
    const issues = [issue("a", false), issue("b", false)];
    expect(boardIssueCounts(issues)).toEqual({ openCount: 2, doneCount: 0, totalCount: 2 });
  });

  it("treats a fully-closed board as all done (all-tracked case unchanged)", () => {
    const issues = [issue("a", true), issue("b", true), issue("c", true)];
    expect(boardIssueCounts(issues)).toEqual({ openCount: 0, doneCount: 3, totalCount: 3 });
  });

  it("uses closedAt — not status — as the closed signal", () => {
    // An issue with closedAt set but a non-Done status still counts as done;
    // an issue with no closedAt counts as open regardless of status text.
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
