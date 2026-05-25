"""
Unit tests for pure helpers in `sweep_codex_quality.py`. The GraphQL
plumbing is integration-tested manually by running the workflow against
a real PAT.

Run from repo root:
    python -m pytest scripts/test_sweep_codex_quality.py -v
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

# Allow running with `python scripts/test_sweep_codex_quality.py` too.
sys.path.insert(0, str(Path(__file__).parent))

import sweep_codex_quality as sweep  # noqa: E402


def test_detect_severity_p0_beats_p1_beats_p2() -> None:
    assert sweep.detect_severity("**Severity:** P0 — fix asap") == "P0"
    assert sweep.detect_severity("**Severity:** P1 — refactor needed") == "P1"
    assert sweep.detect_severity("just a nit") == "P2"
    assert sweep.detect_severity("P2: indentation off") == "P2"


def test_detect_severity_worst_wins_within_one_body() -> None:
    body = "Found a [P2] typo and a [P0] auth bypass."
    assert sweep.detect_severity(body) == "P0"


def test_detect_severity_returns_none_for_neutral_text() -> None:
    assert sweep.detect_severity("Looks good to me!") is None
    assert sweep.detect_severity("") is None


def test_detect_severity_case_insensitive() -> None:
    assert sweep.detect_severity("severity: p1") == "P1"
    assert sweep.detect_severity("blocker") == "P0"


def test_detect_severity_word_boundaries_only() -> None:
    # "shop1" should NOT match "P1"; "JP0" should NOT match "P0".
    assert sweep.detect_severity("shop1 layout broken") is None
    assert sweep.detect_severity("JP0 jurisdiction") is None


def test_detect_severity_ignores_generic_english_adjectives() -> None:
    # Earlier versions matched bare HIGH / MEDIUM / LOW as severity tags.
    # These are way too common in normal PR text to be reliable signals,
    # so the regex now requires P0/P1/P2 (or BLOCKER/CRITICAL/NIT) markers.
    assert sweep.detect_severity("HIGH availability deploy") is None
    assert sweep.detect_severity("MEDIUM priority bugfix") is None
    assert sweep.detect_severity("LOW hanging fruit, easy ship") is None
    assert sweep.detect_severity("reachability is HIGH for the new endpoint") is None


# ── Badge URL detection (regression cover for pre-2026-05 mis-classification) ──

def test_detect_badge_severity_extracts_p1_from_codex_badge() -> None:
    # Real codex bot output — image markdown wraps every inline finding.
    body = (
        "**<sub><sub>![P1 Badge]"
        "(https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>"
        "  Continue paging after pre-window merged PRs**\n\n"
        "This early return assumes..."
    )
    assert sweep.detect_badge_severity(body) == "P1"


def test_detect_badge_severity_worst_wins_across_multiple_badges() -> None:
    body = (
        "![P2 Badge](https://img.shields.io/badge/P2-yellow)\n"
        "![P0 Badge](https://img.shields.io/badge/P0-red)\n"
        "![P1 Badge](https://img.shields.io/badge/P1-orange)"
    )
    assert sweep.detect_badge_severity(body) == "P0"


def test_detect_badge_severity_returns_none_for_no_badges() -> None:
    assert sweep.detect_badge_severity("Just plain prose, no images.") is None
    assert sweep.detect_badge_severity("") is None


def test_detect_badge_severity_ignores_unrelated_shields_io_badges() -> None:
    # Other shields.io badges (build status, version, license) must not
    # false-positive — pattern requires /badge/PN- specifically.
    body = (
        "![build](https://img.shields.io/badge/build-passing-green)\n"
        "![version](https://img.shields.io/badge/v-1.2.3-blue)"
    )
    assert sweep.detect_badge_severity(body) is None


def test_classify_pr_recovers_p1_from_badge_when_bodytext_strips_it() -> None:
    """The pre-fix bug: bodyText strips images → P1 marker vanished → fallback to P2.

    This test pins the fix in place: when only the badge image carries the
    severity (bodyText stripped it), classify_pr MUST return P1, not P2.
    """
    pr = {
        "number": 504,
        "mergedAt": "2026-05-25T07:17:35Z",
        "reviewThreads": {
            "nodes": [
                {
                    "comments": {
                        "nodes": [
                            {
                                "author": {"login": "chatgpt-codex-connector"},
                                # `body` has the badge…
                                "body": (
                                    "**<sub><sub>![P1 Badge]"
                                    "(https://img.shields.io/badge/P1-orange?style=flat)"
                                    "</sub></sub>  Continue paging after pre-window**"
                                ),
                                # …but bodyText strips it — only the prose remains.
                                "bodyText": "Continue paging after pre-window",
                            }
                        ]
                    }
                }
            ]
        },
        "reviews": {"nodes": []},
        "comments": {"nodes": []},
    }
    s = sweep.classify_pr(pr)
    assert s.has_codex_review is True
    assert s.severity == "P1", (
        "Badge URL in `body` must promote severity even when `bodyText` "
        "strips the image — historical bug fell through to P2 here."
    )


def test_classify_pr_worst_wins_across_badge_and_text_marker() -> None:
    """Mixed: one comment carries P1 in a badge, another carries P0 in text."""
    pr = {
        "number": 1,
        "mergedAt": "2026-05-22T10:00:00Z",
        "reviewThreads": {
            "nodes": [
                {
                    "comments": {
                        "nodes": [
                            {
                                "author": {"login": "chatgpt-codex-connector"},
                                "body": "![P1 Badge](https://img.shields.io/badge/P1-orange)",
                                "bodyText": "minor refactor suggestion",
                            }
                        ]
                    }
                }
            ]
        },
        "reviews": {
            "nodes": [
                {
                    "author": {"login": "chatgpt-codex-connector"},
                    "body": "Summary: found a P0 blocker in auth.",
                    "bodyText": "Summary: found a P0 blocker in auth.",
                }
            ]
        },
        "comments": {"nodes": []},
    }
    assert sweep.classify_pr(pr).severity == "P0"


def test_classify_pr_handles_missing_body_field_gracefully() -> None:
    """Defensive: if GraphQL returns no `body` (only `bodyText`), no crash."""
    pr = {
        "number": 2,
        "mergedAt": "2026-05-22T10:00:00Z",
        "reviewThreads": {"nodes": []},
        "reviews": {
            "nodes": [
                {
                    "author": {"login": "chatgpt-codex-connector"},
                    # No `body` key at all — only bodyText.
                    "bodyText": "P0 blocker",
                }
            ]
        },
        "comments": {"nodes": []},
    }
    assert sweep.classify_pr(pr).severity == "P0"


def test_classify_pr_with_bot_review_no_marker_defaults_to_p2() -> None:
    pr = {
        "number": 42,
        "mergedAt": "2026-05-22T10:00:00Z",
        "reviewThreads": {"nodes": []},
        "reviews": {
            "nodes": [
                {
                    "author": {"login": "chatgpt-codex-connector"},
                    "bodyText": "Some bot comment with no severity tag",
                }
            ]
        },
        "comments": {"nodes": []},
    }
    s = sweep.classify_pr(pr)
    assert s.has_codex_review is True
    assert s.severity == "P2"


def test_classify_pr_no_bot_review_returns_none_severity() -> None:
    pr = {
        "number": 43,
        "mergedAt": "2026-05-22T10:00:00Z",
        "reviewThreads": {"nodes": []},
        "reviews": {
            "nodes": [
                {"author": {"login": "human-reviewer"}, "bodyText": "P0 critical bug!"}
            ]
        },
        "comments": {"nodes": []},
    }
    s = sweep.classify_pr(pr)
    assert s.has_codex_review is False
    assert s.severity is None  # human's P0 must not be counted


def test_classify_pr_worst_severity_across_threads_wins() -> None:
    pr = {
        "number": 44,
        "mergedAt": "2026-05-22T10:00:00Z",
        "reviewThreads": {
            "nodes": [
                {
                    "comments": {
                        "nodes": [
                            {
                                "author": {"login": "chatgpt-codex-connector"},
                                "bodyText": "P2 nit",
                            }
                        ]
                    }
                },
                {
                    "comments": {
                        "nodes": [
                            {
                                "author": {"login": "chatgpt-codex-connector"},
                                "bodyText": "P0 blocker",
                            }
                        ]
                    }
                },
            ]
        },
        "reviews": {"nodes": []},
        "comments": {"nodes": []},
    }
    s = sweep.classify_pr(pr)
    assert s.severity == "P0"


def test_bucketize_assigns_pr_to_correct_daily_bucket() -> None:
    now = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
    _, intervals = sweep.make_daily_buckets(now)
    pr = sweep.PRSummary(
        number=1,
        merged_at=datetime(2026, 5, 24, 8, 30, tzinfo=timezone.utc),
        severity="P0",
        has_codex_review=True,
    )
    out = sweep.bucketize([pr], intervals)
    # Last bucket = today (2026-05-25); pr is in second-to-last (yesterday).
    assert out[-1]["total_pr"] == 0
    assert out[-2]["total_pr"] == 1
    assert out[-2]["with_p0"] == 1
    assert out[-2]["with_p1_only"] == 0
    assert out[-2]["with_p2_only"] == 0


def test_bucketize_p1_only_increments_correct_counter() -> None:
    now = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
    _, intervals = sweep.make_daily_buckets(now)
    pr = sweep.PRSummary(
        number=1,
        merged_at=now - timedelta(hours=2),
        severity="P1",
        has_codex_review=True,
    )
    out = sweep.bucketize([pr], intervals)
    assert out[-1]["with_p0"] == 0
    assert out[-1]["with_p1_only"] == 1
    assert out[-1]["with_p2_only"] == 0
    assert out[-1]["total_pr"] == 1


def test_weekly_buckets_have_12_slots_and_monday_aligned() -> None:
    now = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)  # Monday
    labels, intervals = sweep.make_weekly_buckets(now)
    assert len(labels) == 12
    assert len(intervals) == 12
    # Last interval starts on this week's Monday.
    assert intervals[-1][0].weekday() == 0
    assert intervals[-1][0].date() == now.date()


def test_aggregate_summary_sums_repos_per_bucket() -> None:
    per_repo = {
        "a": [{"total_pr": 3, "with_p0": 1, "with_p1_only": 1, "with_p2_only": 0}],
        "b": [{"total_pr": 2, "with_p0": 0, "with_p1_only": 0, "with_p2_only": 1}],
    }
    summary = sweep.aggregate_summary(per_repo, 1)
    assert summary == [
        {"total_pr": 5, "with_p0": 1, "with_p1_only": 1, "with_p2_only": 1}
    ]


def test_repo_coverage_empty_returns_zero_and_none() -> None:
    pct, first = sweep.repo_coverage([])
    assert pct == 0.0
    assert first is None


def test_repo_coverage_counts_only_bot_reviewed_prs() -> None:
    prs = [
        sweep.PRSummary(
            number=1,
            merged_at=datetime(2026, 5, 20, tzinfo=timezone.utc),
            severity=None,
            has_codex_review=False,
        ),
        sweep.PRSummary(
            number=2,
            merged_at=datetime(2026, 5, 18, tzinfo=timezone.utc),
            severity="P1",
            has_codex_review=True,
        ),
        sweep.PRSummary(
            number=3,
            merged_at=datetime(2026, 5, 22, tzinfo=timezone.utc),
            severity="P2",
            has_codex_review=True,
        ),
    ]
    pct, first = sweep.repo_coverage(prs)
    assert pct == round(100 * 2 / 3, 1)
    assert first == "2026-05-18T00:00:00+00:00"


def test_atomic_write_json_round_trip(tmp_path: Path) -> None:
    out = tmp_path / "x.json"
    sweep.atomic_write_json(out, {"hello": "мир"})
    import json as _json

    assert _json.loads(out.read_text(encoding="utf-8")) == {"hello": "мир"}
    # No leftover tmp.
    assert not (tmp_path / "x.json.tmp").exists()


# ── sweep_repo (paginate-and-filter) ──────────────────────────────────


def _pr_node(number: int, merged_at: str) -> dict:
    """Minimal PR node that classify_pr() accepts without choking."""
    return {
        "number": number,
        "mergedAt": merged_at,
        "reviewThreads": {"nodes": []},
        "reviews": {"nodes": []},
        "comments": {"nodes": []},
    }


def _page(nodes: list[dict], has_next: bool = False, end_cursor: str = "X") -> dict:
    return {
        "repository": {
            "pullRequests": {
                "nodes": nodes,
                "pageInfo": {"hasNextPage": has_next, "endCursor": end_cursor},
            }
        }
    }


def test_sweep_repo_keeps_in_window_drops_out_of_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pre-window PRs must NEVER end up in summaries (was Critical bug 1)."""
    pages = [
        _page(
            [
                _pr_node(101, "2026-05-20T00:00:00Z"),  # in window
                _pr_node(100, "2026-04-01T00:00:00Z"),  # pre-window
            ],
            has_next=False,
        )
    ]
    calls = iter(pages)
    monkeypatch.setattr(sweep, "gh_graphql", lambda *a, **kw: next(calls))
    result = sweep.sweep_repo(
        client=None,  # ignored by the stub
        token="x",
        repo="any",
        window_start=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    assert result.status == "ok"
    assert [s.number for s in result.prs] == [101]
    # repo_coverage's denominator was the regression vector — must be 1, not 2.
    pct, _first = sweep.repo_coverage(result.prs)
    assert pct == 0.0  # no codex review on the single in-window PR


def test_sweep_repo_continues_past_stale_chatter_to_find_recent_merges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """UPDATED_AT-ordered: page 1 may be all stale, in-window on page 2.

    Was Critical bug 2 — old code would have returned after the first
    pre-window PR on page 1, never fetching page 2.
    """
    pages = [
        _page(
            [
                # Floated to page 1 by a recent comment, merged long ago.
                _pr_node(50, "2024-01-15T00:00:00Z"),
                _pr_node(49, "2024-01-14T00:00:00Z"),
            ],
            has_next=True,
            end_cursor="cur1",
        ),
        _page(
            [
                _pr_node(120, "2026-05-19T00:00:00Z"),  # in window
                _pr_node(119, "2026-05-15T00:00:00Z"),  # in window
            ],
            has_next=False,
        ),
    ]
    calls = iter(pages)
    monkeypatch.setattr(sweep, "gh_graphql", lambda *a, **kw: next(calls))
    result = sweep.sweep_repo(
        client=None,
        token="x",
        repo="any",
        window_start=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    assert [s.number for s in result.prs] == [120, 119]


def test_sweep_repo_stops_after_full_empty_page_with_results_collected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Don't burn 8 pages for nothing once we've passed the window."""
    call_count = 0

    def fake_gh_graphql(*_args, **_kw):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _page(
                [_pr_node(200, "2026-05-19T00:00:00Z")],  # in window
                has_next=True,
            )
        if call_count == 2:
            return _page(
                [_pr_node(199, "2024-01-01T00:00:00Z")],  # all pre-window
                has_next=True,
            )
        raise AssertionError("should have stopped after empty page 2")

    monkeypatch.setattr(sweep, "gh_graphql", fake_gh_graphql)
    result = sweep.sweep_repo(
        client=None,
        token="x",
        repo="any",
        window_start=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    assert call_count == 2
    assert [s.number for s in result.prs] == [200]


def test_sweep_repo_null_repository_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """PAT-without-access returns `{"repository": null}` — must raise.

    Pre-fix behaviour was silent status=ok with 0 PRs, masking PAT scope
    errors that should fail the run loudly.
    """
    monkeypatch.setattr(
        sweep,
        "gh_graphql",
        lambda *a, **kw: {"repository": None},
    )
    with pytest.raises(RuntimeError, match="PAT may lack access"):
        sweep.sweep_repo(
            client=None,
            token="x",
            repo="private-repo",
            window_start=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
