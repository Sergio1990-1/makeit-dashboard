"""Tests for the /settings/* REST endpoints."""

from __future__ import annotations

import base64
import secrets
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from makeit_settings import settings_store as settings_store_mod
from makeit_settings.app import SETTINGS_TOKEN_ENV, create_app
from makeit_settings.settings_store import ENCRYPTION_KEY_ENV

TEST_TOKEN = "test-bearer-token-1234567890"


# ---------------------------------------------------------------------------
# Auth — every guard branch returns 401 with WWW-Authenticate
# ---------------------------------------------------------------------------


def test_unauthenticated_request_returns_401(client):
    r = client.get("/settings/keys")
    assert r.status_code == 401
    assert r.headers.get("WWW-Authenticate") == "Bearer"


def test_invalid_token_returns_401(client):
    r = client.get("/settings/keys", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_missing_bearer_prefix_returns_401(client):
    r = client.get("/settings/keys", headers={"Authorization": TEST_TOKEN})
    assert r.status_code == 401


def test_token_env_unset_returns_401(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv(SETTINGS_TOKEN_ENV)
    r = client.get("/settings/keys", headers={"Authorization": "Bearer x"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /settings/keys
# ---------------------------------------------------------------------------


def test_keys_empty(client, auth_headers):
    r = client.get("/settings/keys", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_keys_returns_array_not_object(client, auth_headers):
    """Phase-1.5 wire-shape: raw array, not {keys: [...]}."""
    r = client.get("/settings/keys", headers=auth_headers)
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# GET /settings (masked listing)
# ---------------------------------------------------------------------------


def test_get_all_empty(client, auth_headers):
    r = client.get("/settings", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_get_all_returns_masked_listing(client, auth_headers):
    """Phase-1.5 wire-shape: list[{key, masked_value}], no plaintext."""
    client.put("/settings/k1", headers=auth_headers, json={"value": "abcdefghij1234567890"})
    r = client.get("/settings", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["key"] == "k1"
    assert "masked_value" in body[0]
    assert "abcdefghij1234567890" not in body[0]["masked_value"]


def test_get_missing_returns_404(client, auth_headers):
    r = client.get("/settings/nonexistent", headers=auth_headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PUT /settings/{key}
# ---------------------------------------------------------------------------


def test_put_then_get_round_trip(client, auth_headers):
    r = client.put("/settings/github_token", headers=auth_headers, json={"value": "ghp_test_xyz"})
    assert r.status_code == 204
    g = client.get("/settings/github_token", headers=auth_headers)
    assert g.status_code == 200
    assert g.json() == {"key": "github_token", "value": "ghp_test_xyz"}


def test_put_overwrites_existing_value(client, auth_headers):
    client.put("/settings/k", headers=auth_headers, json={"value": "v1"})
    client.put("/settings/k", headers=auth_headers, json={"value": "v2"})
    r = client.get("/settings/k", headers=auth_headers)
    assert r.json()["value"] == "v2"


def test_put_invalid_body_returns_422(client, auth_headers):
    r = client.put("/settings/k", headers=auth_headers, json={"wrong_field": "x"})
    assert r.status_code == 422


def test_put_value_too_large_returns_422(client, auth_headers):
    r = client.put("/settings/k", headers=auth_headers, json={"value": "x" * 65537})
    assert r.status_code == 422


def test_db_path_env_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """MAKEIT_SETTINGS_DB_PATH redirects the SQLite file (covers container deploy
    where /data is the bind-mounted volume; default Path.home() lands in /home/settings)."""
    from makeit_settings.app import DB_PATH_ENV

    custom_db = tmp_path / "custom" / "x.db"
    custom_db.parent.mkdir()
    monkeypatch.setenv(ENCRYPTION_KEY_ENV, base64.b64encode(secrets.token_bytes(32)).decode())
    monkeypatch.setenv(SETTINGS_TOKEN_ENV, TEST_TOKEN)
    monkeypatch.setenv(DB_PATH_ENV, str(custom_db))
    app = create_app()
    with TestClient(app) as c:
        r = c.put("/settings/k", headers={"Authorization": f"Bearer {TEST_TOKEN}"}, json={"value": "v"})
        assert r.status_code == 204
    assert custom_db.exists(), "store didn't write to MAKEIT_SETTINGS_DB_PATH"


# ---------------------------------------------------------------------------
# DELETE /settings/{key}
# ---------------------------------------------------------------------------


def test_delete_existing_returns_204(client, auth_headers):
    client.put("/settings/k", headers=auth_headers, json={"value": "v"})
    r = client.delete("/settings/k", headers=auth_headers)
    assert r.status_code == 204
    g = client.get("/settings/k", headers=auth_headers)
    assert g.status_code == 404


def test_delete_missing_returns_404(client, auth_headers):
    r = client.delete("/settings/nonexistent", headers=auth_headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# CORS — local dev needs preflight to succeed (dashboard :4173 → settings :8768)
# ---------------------------------------------------------------------------


def test_cors_preflight_succeeds(client):
    """OPTIONS /settings from a cross-origin must return 200 with allow headers.

    Without CORSMiddleware, FastAPI returns 405 to OPTIONS, browsers block the
    actual GET, and the dashboard's loadAllSettings() fails silently in dev.
    """
    r = client.options(
        "/settings",
        headers={
            "Origin": "http://localhost:4173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "*"
    assert "GET" in r.headers.get("access-control-allow-methods", "")


# ---------------------------------------------------------------------------
# Degraded mode — encryption key missing → store init fails → 503
# ---------------------------------------------------------------------------


def test_503_when_encryption_key_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """No PIPELINE_SETTINGS_ENCRYPTION_KEY → store=None → all /settings/* → 503."""
    monkeypatch.delenv(ENCRYPTION_KEY_ENV, raising=False)
    monkeypatch.setenv(SETTINGS_TOKEN_ENV, TEST_TOKEN)
    app = create_app()
    with TestClient(app) as c:
        r = c.get("/settings/keys", headers={"Authorization": f"Bearer {TEST_TOKEN}"})
        assert r.status_code == 503
        # /health still works
        h = c.get("/health")
        assert h.status_code == 200
