"""/health is the only unauthenticated endpoint — used by nginx upstream check."""

from __future__ import annotations


def test_health_returns_200(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_does_not_require_auth(client):
    """nginx upstream probe sends no Authorization header."""
    r = client.get("/health")
    assert r.status_code == 200
