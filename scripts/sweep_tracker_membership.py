#!/usr/bin/env python3
"""
Reconcile MakeIT Tracker (Projects V2 #1) membership: make sure EVERY open
issue across all MakeIT repos is on the board — without relying on an agent
(or a human) remembering to run `gh project item-add`.

Why a sweep and not the built-in "Auto-add to project" workflow
---------------------------------------------------------------
GitHub's built-in auto-add workflow is one-repo-per-workflow and capped by
plan, so it doesn't scale to our 12 repos. A scheduled reconciliation sweep
instead is:
  * source-agnostic — catches issues created by agents, the UI, the API, or
    `gh issue create`, regardless of whether anyone ran the add step;
  * self-healing — anything that slips through is picked up on the next run,
    so a single missed add never becomes a permanent gap;
  * self-backfilling — the first run adds every pre-existing untracked issue.

Idempotency
-----------
`addProjectV2ItemById` is idempotent: adding an issue that's already on the
board returns the existing item, no error, no duplicate. So even if the diff
is imperfect (pagination race, projectItems cap), re-adding is harmless — the
worst case is a wasted GraphQL point, never a double entry.

Membership check is per-issue, not per-project
----------------------------------------------
We ask each open issue for its own `projectItems` and look for project #1,
rather than enumerating the whole board (~4500 items). Cost scales with the
number of OPEN issues (~hundreds), not board size (~thousands).

Token
-----
`GH_TRACKER_PAT` must read issues on every repo AND read+write Project #1.
Project #1 is USER-owned, and fine-grained PATs cannot access user-owned
Projects at all (GitHub limitation — there is no "Projects" permission to
grant for a personal project), so use a **classic PAT** with scopes
`repo` + `project`. The default GITHUB_TOKEN can't write a user-owned
project across repos either, which is why a PAT secret is required.

Set DRY_RUN=1 to log what WOULD be added without mutating — handy for the
first manual `workflow_dispatch`.

Dependency-light (only `httpx`) on purpose — a batch job, not a service.
"""
from __future__ import annotations

import os
import sys
import time
from typing import Any

import httpx

# ── Configuration ──────────────────────────────────────────────────────

GITHUB_OWNER = "Sergio1990-1"
PROJECT_NUMBER = 1  # the MakeIT Tracker

# Kept in sync with `src/utils/config.ts DEFAULT_PROJECTS` and
# `scripts/sweep_codex_quality.py REPOS`. Add a repo in all three.
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

GRAPHQL_URL = "https://api.github.com/graphql"

PAGE_SIZE = 50
MAX_PAGES = 40  # 2000 open issues/repo — far above any real repo.
ADD_BATCH_SIZE = 20  # aliased mutations per request.

PROJECT_ID_QUERY = """
query($owner: String!, $number: Int!) {
  user(login: $owner) { projectV2(number: $number) { id title } }
}
"""

OPEN_ISSUES_QUERY = """
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: %(page_size)d, after: $cursor,
           orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        number
        projectItems(first: 20) { nodes { project { number } } }
      }
    }
  }
}
""" % {"page_size": PAGE_SIZE}


# ── Pure helpers (unit-tested) ─────────────────────────────────────────


def issue_needs_tracking(issue: dict[str, Any], target_project_number: int) -> bool:
    """True if `issue` is NOT already an item of project #target_project_number."""
    project_items = issue.get("projectItems") or {}
    nodes = project_items.get("nodes") or []
    for node in nodes:
        proj = (node or {}).get("project") or {}
        if proj.get("number") == target_project_number:
            return False
    return True


def chunk(seq: list[Any], size: int) -> list[list[Any]]:
    """Split `seq` into consecutive lists of at most `size` items."""
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def build_add_mutation(project_id: str, content_ids: list[str]) -> str:
    """Batched addProjectV2ItemById mutation — one aliased call per content id."""
    parts = [
        f'a{i}: addProjectV2ItemById('
        f'input: {{projectId: "{project_id}", contentId: "{cid}"}}'
        f') {{ item {{ id }} }}'
        for i, cid in enumerate(content_ids)
    ]
    return "mutation {\n  " + "\n  ".join(parts) + "\n}"


# ── GraphQL plumbing ───────────────────────────────────────────────────


def gh_graphql(
    client: httpx.Client, token: str, query: str, variables: dict[str, Any]
) -> dict[str, Any]:
    """POST one GraphQL request with basic retry on transient 5xx."""
    for attempt in range(4):
        r = client.post(
            GRAPHQL_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "makeit-tracker-sweep",
            },
            json={"query": query, "variables": variables},
        )
        if r.status_code == 200:
            body = r.json()
            if body.get("errors"):
                raise RuntimeError(f"GraphQL error: {body['errors'][0]}")
            return body["data"]
        if r.status_code in (502, 503, 504) and attempt < 3:
            time.sleep(2**attempt)
            continue
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    raise RuntimeError("retry budget exhausted")


def fetch_project_id(client: httpx.Client, token: str) -> str:
    data = gh_graphql(
        client, token, PROJECT_ID_QUERY,
        {"owner": GITHUB_OWNER, "number": PROJECT_NUMBER},
    )
    project = (data.get("user") or {}).get("projectV2")
    if not project or not project.get("id"):
        raise RuntimeError(
            f"Project #{PROJECT_NUMBER} not found for {GITHUB_OWNER} — "
            "check PAT has Projects read access."
        )
    return project["id"]


def fetch_untracked_open_issues(
    client: httpx.Client, token: str, repo: str
) -> list[dict[str, Any]]:
    """Return open issues in `repo` that are NOT yet on the Tracker."""
    out: list[dict[str, Any]] = []
    cursor: str | None = None
    for _page in range(MAX_PAGES):
        data = gh_graphql(
            client, token, OPEN_ISSUES_QUERY,
            {"owner": GITHUB_OWNER, "name": repo, "cursor": cursor},
        )
        repo_node = data.get("repository")
        if repo_node is None:
            raise RuntimeError(
                f"repository null — PAT may lack Issues:Read on {GITHUB_OWNER}/{repo}"
            )
        conn = repo_node.get("issues") or {}
        for node in conn.get("nodes") or []:
            if issue_needs_tracking(node, PROJECT_NUMBER):
                out.append(node)
        page_info = conn.get("pageInfo") or {}
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
    return out


def add_items(
    client: httpx.Client, token: str, project_id: str, content_ids: list[str]
) -> None:
    """Add content ids to the project in batched, idempotent mutations."""
    for group in chunk(content_ids, ADD_BATCH_SIZE):
        gh_graphql(client, token, build_add_mutation(project_id, group), {})


# ── Main ───────────────────────────────────────────────────────────────


def main() -> int:
    token = os.environ.get("GH_TRACKER_PAT", "").strip()
    if not token:
        print("ERROR: GH_TRACKER_PAT env var is required", file=sys.stderr)
        return 2
    dry_run = os.environ.get("DRY_RUN", "").strip() in ("1", "true", "yes")

    total_added = 0
    n_errors = 0
    with httpx.Client(timeout=30.0) as client:
        project_id = fetch_project_id(client, token)
        print(f"Tracker project id: {project_id} (DRY_RUN={dry_run})")
        for repo in REPOS:
            try:
                missing = fetch_untracked_open_issues(client, token, repo)
            except Exception as exc:  # noqa: BLE001 — keep sweeping other repos
                print(f"[{repo}] FAILED: {exc}", file=sys.stderr)
                n_errors += 1
                continue
            if not missing:
                print(f"[{repo}] ok — all open issues tracked")
                continue
            nums = ", ".join(f"#{m['number']}" for m in missing)
            if dry_run:
                print(f"[{repo}] WOULD add {len(missing)}: {nums}")
                continue
            add_items(client, token, project_id, [m["id"] for m in missing])
            total_added += len(missing)
            print(f"[{repo}] added {len(missing)}: {nums}")

    verb = "would add" if dry_run else "added"
    print(f"\nDone — {verb} {total_added} issue(s) to the Tracker.")
    if n_errors:
        print(f"WARNING: {n_errors}/{len(REPOS)} repos failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
