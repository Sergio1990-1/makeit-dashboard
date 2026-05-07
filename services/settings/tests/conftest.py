"""Shared fixtures for makeit-settings tests."""

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


@pytest.fixture
def settings_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Seed env + isolated DB path so SettingsStore() in lifespan succeeds."""
    monkeypatch.setenv(ENCRYPTION_KEY_ENV, base64.b64encode(secrets.token_bytes(32)).decode())
    monkeypatch.setenv(SETTINGS_TOKEN_ENV, TEST_TOKEN)
    monkeypatch.setattr(settings_store_mod, "DEFAULT_DB_PATH", tmp_path / "settings.db")


@pytest.fixture
def client(settings_env):
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}
