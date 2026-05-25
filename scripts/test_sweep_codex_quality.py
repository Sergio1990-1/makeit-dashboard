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

# Allow running with `python scripts/test_sweep_codex_quality.py` too.
sys.path.insert(0, str(Path(__file__).parent))

import sweep_codex_quality as sweep  # noqa: E402


def test_detect_severity_p0_beats_p1_beats_p2() -> None:
    assert sweep.detect_severity("**Severity:** P0 — fix asap") == "P0"
    assert sweep.detect_severity("priority HIGH — refactor needed") == "P1"
    assert sweep.detect_severity("just a nit, MEDIUM") == "P2"
    assert sweep.detect_severity("LOW: indentation off") == "P2"


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
