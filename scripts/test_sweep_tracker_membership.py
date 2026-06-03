"""
Unit tests for pure helpers in `sweep_tracker_membership.py`. The GraphQL
plumbing (project-id lookup, issue pagination, add mutation round-trip) is
integration-tested by running the workflow against a real PAT.

Run from repo root:
    python -m pytest scripts/test_sweep_tracker_membership.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow running with `python scripts/test_sweep_tracker_membership.py` too.
sys.path.insert(0, str(Path(__file__).parent))

import sweep_tracker_membership as sweep  # noqa: E402


# ── issue_needs_tracking ───────────────────────────────────────────────

def test_needs_tracking_true_when_not_in_any_project() -> None:
    issue = {"id": "I_1", "number": 5, "projectItems": {"nodes": []}}
    assert sweep.issue_needs_tracking(issue, target_project_number=1) is True


def test_needs_tracking_false_when_already_in_target_project() -> None:
    issue = {
        "id": "I_2",
        "number": 6,
        "projectItems": {"nodes": [{"project": {"number": 1}}]},
    }
    assert sweep.issue_needs_tracking(issue, target_project_number=1) is False


def test_needs_tracking_true_when_only_in_other_project() -> None:
    # Issue is on Project #2 but NOT the Tracker (#1) — must still be added.
    issue = {
        "id": "I_3",
        "number": 7,
        "projectItems": {"nodes": [{"project": {"number": 2}}]},
    }
    assert sweep.issue_needs_tracking(issue, target_project_number=1) is True


def test_needs_tracking_false_when_in_target_among_several() -> None:
    issue = {
        "id": "I_4",
        "number": 8,
        "projectItems": {
            "nodes": [{"project": {"number": 3}}, {"project": {"number": 1}}]
        },
    }
    assert sweep.issue_needs_tracking(issue, target_project_number=1) is False


def test_needs_tracking_handles_missing_or_null_fields() -> None:
    # Defensive: GraphQL can hand back null nodes / absent projectItems.
    assert sweep.issue_needs_tracking({"id": "x"}, 1) is True
    assert sweep.issue_needs_tracking({"projectItems": None}, 1) is True
    assert sweep.issue_needs_tracking({"projectItems": {"nodes": [None]}}, 1) is True


# ── chunk ──────────────────────────────────────────────────────────────

def test_chunk_splits_with_remainder() -> None:
    assert sweep.chunk([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]


def test_chunk_empty_is_empty() -> None:
    assert sweep.chunk([], 10) == []


def test_chunk_size_larger_than_seq() -> None:
    assert sweep.chunk([1, 2], 10) == [[1, 2]]


# ── build_add_mutation ─────────────────────────────────────────────────

def test_build_add_mutation_aliases_each_content_id() -> None:
    q = sweep.build_add_mutation("PVT_proj", ["I_a", "I_b"])
    assert "a0: addProjectV2ItemById" in q
    assert "a1: addProjectV2ItemById" in q
    # Each content id and the project id must appear.
    assert "PVT_proj" in q
    assert "I_a" in q and "I_b" in q
    # Aliases must be unique so GitHub doesn't reject the batched mutation.
    assert q.count("addProjectV2ItemById") == 2


def test_build_add_mutation_single_item() -> None:
    q = sweep.build_add_mutation("PVT_x", ["I_only"])
    assert "a0: addProjectV2ItemById" in q
    assert q.count("addProjectV2ItemById") == 1
    assert q.strip().startswith("mutation")
