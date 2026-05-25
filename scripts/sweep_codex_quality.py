#!/usr/bin/env python3
"""
Sweep Codex review findings across MakeIT repos and produce one JSON
file consumed by the «Качество кода» dashboard tab.

Run shape
---------
    GH_FINE_GRAINED_PAT=...  python scripts/sweep_codex_quality.py
    # writes  ./out/codex-quality.json  (override with OUT_DIR=...)

Why a fine-grained PAT and not GITHUB_TOKEN
-------------------------------------------
The default GITHUB_TOKEN in Actions is scoped to the repository running
the workflow. The dashboard repo has 11 sibling repos to sweep, and a
repo-scoped token would silently return zero PRs for all of them — the
GraphQL endpoint returns nulls rather than 403s, so the failure is
invisible. The fine-grained PAT lists every target repo explicitly and
needs only `Pull requests: Read` + `Contents: Read`.

Severity classification
-----------------------
chatgpt-codex-connector[bot] leaves review comments with an explicit
severity marker in the body. We grep for `P0` / `P1` / `P2` (and the
synonyms BLOCKER / CRITICAL / HIGH / MEDIUM / LOW). If multiple comments
on a single PR have different severities, worst wins. PRs with at least
one bot comment but no recognisable severity marker default to P2 — that
way new bot output formats degrade to "low signal" rather than dropping
off the chart entirely.

This file is intentionally dependency-light (only `httpx`). It's a
batch job, not a service — being small and obvious matters more than
being fast.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import httpx

# ── Configuration ──────────────────────────────────────────────────────

GITHUB_OWNER = "Sergio1990-1"

# Kept in sync with `src/utils/config.ts DEFAULT_PROJECTS` — both lists
# define "the 12 MakeIT repos the dashboard tracks". If you add a repo
# here, add it there too (and vice versa). When this duplication starts
# to bite (third consumer joins), promote to `data/projects.json` and
# read from both sides.
REPOS: list[str] = [
    "Sewing-ERP",
    "mankassa-app",
    "solotax-kg",
    "Business-News",
    "Beer_bot",
    "Uchet_bot",
    "quiet-walls",
    "moliyakg",
    "MyMoney",
    "makeit-auditor",
    "makeit-pipeline",
    "makeit-dashboard",
]

CODEX_BOT_LOGIN = "chatgpt-codex-connector"

GRAPHQL_URL = "https://api.github.com/graphql"

# How far back to look. 12w + slack so the oldest weekly bucket has a
# full 7-day window of source data even when this Sunday's run lands
# late. Keep a bit of extra padding — GitHub's `mergedAt` filter is per
# PR, not per cursor.
WINDOW_WEEKS = 12
WINDOW_SLACK_DAYS = 9

# Pagination caps. 8 × 50 = 400 PRs per repo is comfortably above what
# any of our repos pushes through in 12 weeks; raise if Sewing-ERP /
# mankassa grow. With GraphQL's ~150-points-per-page cost (nested
# reviewThreads/reviews/comments) and 12 repos, the worst-case budget is
# ~14k points — well within the 5k/hour PAT limit because we typically
# stop early (see sweep_repo's empty-page break condition).
PAGE_SIZE = 50
MAX_PAGES = 8

# Severity regex — case-insensitive, word-boundaried. We look at the
# whole comment body, not just leading words: bot output sometimes wraps
# the marker in markdown headers, brackets, or backticks.
#
# Deliberately NARROW: we only match explicit markers (P0/P1/P2 + a few
# named synonyms specific to bot output). Earlier versions matched bare
# English adjectives HIGH / MEDIUM / LOW — false positives were rampant
# ("HIGH availability", "MEDIUM priority feature", "LOW hanging fruit"
# in PR descriptions all triggered findings). The codex bot's own output
# uses P0/P1/P2 structurally, so we lose nothing real by dropping the
# adjectives.
SEVERITY_PATTERNS: dict[str, re.Pattern[str]] = {
    "P0": re.compile(r"\b(P0|BLOCKER|CRITICAL)\b", re.IGNORECASE),
    "P1": re.compile(r"\bP1\b", re.IGNORECASE),
    "P2": re.compile(r"\b(P2|NIT)\b", re.IGNORECASE),
}
SEVERITY_RANK = {"P0": 0, "P1": 1, "P2": 2}  # lower = worse

# ── GraphQL query ──────────────────────────────────────────────────────
# One round trip per page per repo. We fetch reviewThreads + reviews +
# (top-level) comments because the bot sometimes leaves a summary as a
# review, sometimes as a thread comment, depending on review mode.

PR_QUERY = """
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      states: [MERGED],
      first: %(page_size)d,
      after: $cursor,
      orderBy: {field: UPDATED_AT, direction: DESC}
    ) {
      nodes {
        number
        mergedAt
        reviewThreads(first: 100) {
          nodes {
            comments(first: 50) {
              nodes {
                author { login }
                bodyText
              }
            }
          }
        }
        reviews(first: 50) {
          nodes {
            author { login }
            bodyText
          }
        }
        comments(first: 100) {
          nodes {
            author { login }
            bodyText
          }
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
""" % {"page_size": PAGE_SIZE}


@dataclass
class PRSummary:
    number: int
    merged_at: datetime
    severity: str | None  # "P0" / "P1" / "P2" / None (no codex finding)
    has_codex_review: bool


@dataclass
class RepoResult:
    status: str  # "ok" | "error"
    message: str | None = None
    prs: list[PRSummary] = field(default_factory=list)


# ── GraphQL plumbing ──────────────────────────────────────────────────


def gh_graphql(
    client: httpx.Client,
    token: str,
    query: str,
    variables: dict[str, Any],
) -> dict[str, Any]:
    """POST one GraphQL request with basic retry on transient errors."""
    for attempt in range(4):
        r = client.post(
            GRAPHQL_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "makeit-codex-quality-sweep",
            },
            json={"query": query, "variables": variables},
        )
        if r.status_code == 200:
            body = r.json()
            if "errors" in body and body["errors"]:
                # Surface the first error message — it's almost always
                # either rate-limit or "Resource not accessible by
                # integration" (PAT scope mistake).
                raise RuntimeError(f"GraphQL error: {body['errors'][0]}")
            return body["data"]
        # 502/503/504 → bounce and retry; everything else is fatal.
        if r.status_code in (502, 503, 504) and attempt < 3:
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    raise RuntimeError("retry budget exhausted")


# ── PR classification ─────────────────────────────────────────────────


def detect_severity(body: str) -> str | None:
    """Return worst severity found in `body` (string), or None if none."""
    worst: str | None = None
    for sev in ("P0", "P1", "P2"):
        if SEVERITY_PATTERNS[sev].search(body):
            if worst is None or SEVERITY_RANK[sev] < SEVERITY_RANK[worst]:
                worst = sev
    return worst


def classify_pr(pr_node: dict[str, Any]) -> PRSummary:
    """Walk all bot-authored bodies, return worst severity + coverage flag."""
    bot_bodies: list[str] = []

    for thread in pr_node.get("reviewThreads", {}).get("nodes", []):
        for comment in thread.get("comments", {}).get("nodes", []):
            author = (comment.get("author") or {}).get("login") or ""
            if author.lower() == CODEX_BOT_LOGIN.lower():
                bot_bodies.append(comment.get("bodyText", "") or "")

    for review in pr_node.get("reviews", {}).get("nodes", []):
        author = (review.get("author") or {}).get("login") or ""
        if author.lower() == CODEX_BOT_LOGIN.lower():
            bot_bodies.append(review.get("bodyText", "") or "")

    for comment in pr_node.get("comments", {}).get("nodes", []):
        author = (comment.get("author") or {}).get("login") or ""
        if author.lower() == CODEX_BOT_LOGIN.lower():
            bot_bodies.append(comment.get("bodyText", "") or "")

    has_codex = len(bot_bodies) > 0
    severity: str | None = None
    if has_codex:
        for body in bot_bodies:
            s = detect_severity(body)
            if s is not None and (severity is None or SEVERITY_RANK[s] < SEVERITY_RANK[severity]):
                severity = s
        if severity is None:
            # Bot left a comment but no recognisable severity tag — count
            # as low-severity so the data point doesn't vanish. Comment
            # in the docstring explains the trade-off.
            severity = "P2"

    merged_at = datetime.fromisoformat(pr_node["mergedAt"].replace("Z", "+00:00"))
    return PRSummary(
        number=pr_node["number"],
        merged_at=merged_at,
        severity=severity,
        has_codex_review=has_codex,
    )


# ── Repo sweep ────────────────────────────────────────────────────────


def sweep_repo(
    client: httpx.Client,
    token: str,
    repo: str,
    window_start: datetime,
) -> RepoResult:
    """Paginate merged PRs for one repo, return summaries within window.

    Pagination notes
    ----------------
    PRs are ordered by UPDATED_AT DESC, but UPDATED_AT can lag mergedAt
    (a PR merged inside our window might receive a comment that bumps
    its UPDATED_AT to the head of the list) or get ahead of it (a stale
    PR merged years ago might get a new comment today and float to page
    1 above newly-merged PRs).

    Two consequences:

    1. We must NOT stop on the first pre-window PR — that PR might be
       a stale-and-recently-commented one, with in-window PRs still
       behind it.
    2. We DO stop after a full page with zero in-window PRs, AND after
       we've already collected at least one in-window PR. Without the
       "already collected" guard, a hot repo with lots of stale chatter
       but no recent merges would stop at page 1 with 0 PRs and report
       falsely 0 even when in-window PRs exist 2-3 pages back.

    A PAT-without-access case shows up as `data["repository"] is None`
    with NO top-level GraphQL `errors` field — we must explicitly raise
    so the outer per-repo try/except marks status=error rather than
    silently producing an empty bucket.
    """
    cursor: str | None = None
    summaries: list[PRSummary] = []
    for _page in range(MAX_PAGES):
        data = gh_graphql(
            client,
            token,
            PR_QUERY,
            {"owner": GITHUB_OWNER, "name": repo, "cursor": cursor},
        )
        repo_node = data.get("repository")
        if repo_node is None:
            # GitHub returns `{"data": {"repository": null}}` (no errors
            # field) when the token can see the repo's existence but not
            # its PRs — or when the repo simply isn't visible to this
            # PAT at all. Bubble up so the caller logs status=error
            # instead of silently writing zeros.
            raise RuntimeError(
                f"repository null — PAT may lack access to {GITHUB_OWNER}/{repo}"
            )
        prs = repo_node.get("pullRequests") or {}
        nodes = prs.get("nodes") or []
        in_window_this_page = 0
        for node in nodes:
            if not node.get("mergedAt"):
                continue
            summary = classify_pr(node)
            if summary.merged_at >= window_start:
                summaries.append(summary)
                in_window_this_page += 1
            # else: silently skip out-of-window PR — do NOT append it.
            # Earlier versions appended pre-window PRs before returning,
            # which inflated repo_coverage's denominator and skewed the
            # coverage_pct number in the published JSON.
        page_info = prs.get("pageInfo") or {}
        if not page_info.get("hasNextPage"):
            break
        # Stop once we've collected at least one in-window PR AND just
        # saw a full page with none. Both conditions matter — see
        # docstring for the "stale chatter on page 1" case.
        if in_window_this_page == 0 and summaries:
            break
        cursor = page_info.get("endCursor")
    return RepoResult(status="ok", prs=summaries)


# ── Bucketization ─────────────────────────────────────────────────────


def date_floor_utc(d: datetime) -> datetime:
    return d.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def iso_week_start(d: datetime) -> datetime:
    """Monday of the ISO week of `d`, in UTC, at 00:00."""
    floored = date_floor_utc(d)
    return floored - timedelta(days=floored.weekday())


def make_daily_buckets(now: datetime) -> tuple[list[str], list[tuple[datetime, datetime]]]:
    """30 daily buckets ending today (UTC). Returns (labels, intervals)."""
    today = date_floor_utc(now)
    labels: list[str] = []
    intervals: list[tuple[datetime, datetime]] = []
    for offset in range(29, -1, -1):
        start = today - timedelta(days=offset)
        end = start + timedelta(days=1)
        labels.append(start.strftime("%d.%m"))
        intervals.append((start, end))
    return labels, intervals


def make_weekly_buckets(now: datetime) -> tuple[list[str], list[tuple[datetime, datetime]]]:
    """12 weekly buckets ending in the current ISO week (UTC, Mon-start)."""
    this_week = iso_week_start(now)
    labels: list[str] = []
    intervals: list[tuple[datetime, datetime]] = []
    for offset in range(11, -1, -1):
        start = this_week - timedelta(weeks=offset)
        end = start + timedelta(weeks=1)
        iso = start.isocalendar()
        labels.append(f"W{iso.week:02d}")
        intervals.append((start, end))
    return labels, intervals


def empty_bucket() -> dict[str, int]:
    return {"total_pr": 0, "with_p0": 0, "with_p1_only": 0, "with_p2_only": 0}


def bucketize(
    prs: Iterable[PRSummary],
    intervals: list[tuple[datetime, datetime]],
) -> list[dict[str, int]]:
    out = [empty_bucket() for _ in intervals]
    for pr in prs:
        for i, (start, end) in enumerate(intervals):
            if start <= pr.merged_at < end:
                out[i]["total_pr"] += 1
                if pr.severity == "P0":
                    out[i]["with_p0"] += 1
                elif pr.severity == "P1":
                    out[i]["with_p1_only"] += 1
                elif pr.severity == "P2":
                    out[i]["with_p2_only"] += 1
                break
    return out


def aggregate_summary(
    per_repo: dict[str, list[dict[str, int]]],
    bucket_count: int,
) -> list[dict[str, int]]:
    summary = [empty_bucket() for _ in range(bucket_count)]
    for repo_buckets in per_repo.values():
        for i, b in enumerate(repo_buckets):
            summary[i]["total_pr"] += b["total_pr"]
            summary[i]["with_p0"] += b["with_p0"]
            summary[i]["with_p1_only"] += b["with_p1_only"]
            summary[i]["with_p2_only"] += b["with_p2_only"]
    return summary


def repo_coverage(prs: list[PRSummary]) -> tuple[float, str | None]:
    """% of PRs with any codex review, plus first-seen ISO timestamp."""
    if not prs:
        return 0.0, None
    with_review = [pr for pr in prs if pr.has_codex_review]
    pct = round(100.0 * len(with_review) / len(prs), 1) if prs else 0.0
    first = min((pr.merged_at for pr in with_review), default=None)
    return pct, (first.isoformat() if first else None)


# ── Main ───────────────────────────────────────────────────────────────


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write JSON to a sibling .tmp then rename — partial reads impossible."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def main() -> int:
    token = os.environ.get("GH_FINE_GRAINED_PAT", "").strip()
    if not token:
        print("ERROR: GH_FINE_GRAINED_PAT env var is required", file=sys.stderr)
        return 2

    out_dir = Path(os.environ.get("OUT_DIR", "out"))
    out_path = out_dir / "codex-quality.json"

    now = datetime.now(timezone.utc)
    window_end = now
    window_start = now - timedelta(weeks=WINDOW_WEEKS, days=WINDOW_SLACK_DAYS)

    daily_labels, daily_intervals = make_daily_buckets(now)
    weekly_labels, weekly_intervals = make_weekly_buckets(now)

    repo_status: dict[str, dict[str, str]] = {}
    per_repo_30d: dict[str, list[dict[str, int]]] = {}
    per_repo_12w: dict[str, list[dict[str, int]]] = {}
    coverage: dict[str, dict[str, Any]] = {}

    with httpx.Client(timeout=30.0) as client:
        for repo in REPOS:
            try:
                result = sweep_repo(client, token, repo, window_start)
            except Exception as exc:  # noqa: BLE001 — we want to keep going
                print(f"[{repo}] FAILED: {exc}", file=sys.stderr)
                repo_status[repo] = {"status": "error", "message": str(exc)[:200]}
                per_repo_30d[repo] = [empty_bucket() for _ in daily_intervals]
                per_repo_12w[repo] = [empty_bucket() for _ in weekly_intervals]
                coverage[repo] = {"codex_coverage_pct": 0.0, "codex_first_seen": None}
                continue
            repo_status[repo] = {"status": "ok"}
            per_repo_30d[repo] = bucketize(result.prs, daily_intervals)
            per_repo_12w[repo] = bucketize(result.prs, weekly_intervals)
            pct, first_seen = repo_coverage(result.prs)
            coverage[repo] = {
                "codex_coverage_pct": pct,
                "codex_first_seen": first_seen,
            }
            print(
                f"[{repo}] {len(result.prs)} PRs in window, "
                f"coverage {pct}%, first-seen {first_seen}"
            )

    payload = {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "bucket_tz": "UTC",
        "repo_status": repo_status,
        "buckets": {
            "30d": {
                "labels": daily_labels,
                "summary": aggregate_summary(per_repo_30d, len(daily_intervals)),
                "per_repo": {
                    repo: {
                        "buckets": per_repo_30d[repo],
                        "codex_coverage_pct": coverage[repo]["codex_coverage_pct"],
                        "codex_first_seen": coverage[repo]["codex_first_seen"],
                    }
                    for repo in REPOS
                },
            },
            "12w": {
                "labels": weekly_labels,
                "summary": aggregate_summary(per_repo_12w, len(weekly_intervals)),
                "per_repo": {
                    repo: {
                        "buckets": per_repo_12w[repo],
                        "codex_coverage_pct": coverage[repo]["codex_coverage_pct"],
                        "codex_first_seen": coverage[repo]["codex_first_seen"],
                    }
                    for repo in REPOS
                },
            },
        },
    }

    atomic_write_json(out_path, payload)
    print(f"\nWrote {out_path} ({out_path.stat().st_size} bytes)")
    n_errors = sum(1 for s in repo_status.values() if s["status"] != "ok")
    if n_errors:
        print(f"WARNING: {n_errors}/{len(REPOS)} repos failed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
