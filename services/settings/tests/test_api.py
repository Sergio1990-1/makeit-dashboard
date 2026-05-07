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
