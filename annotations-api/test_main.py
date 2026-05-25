"""
Unit tests for the annotations mini-API.

Each test gets its own isolated $ANNOT_FILE (tmp_path) via monkeypatch
*before* importlib loads main.py, so the module-level constants pick up
the override. Module is re-imported per test to avoid global state
bleeding between cases.

Run from repo root:
    pip install -r annotations-api/requirements.txt fastapi pytest httpx
    pytest annotations-api/test_main.py -v
"""
from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Fresh main.py bound to a tmp data dir, isolated per-test."""
    data_file = tmp_path / "annotations.json"
    monkeypatch.setenv("ANNOT_FILE", str(data_file))
    monkeypatch.setenv("ANNOT_LOCK", str(data_file) + ".lock")
    monkeypatch.setenv("ANNOT_BACKUPS", str(data_file) + ".backups")
    # Drop a previously-imported copy so module-level Path()s pick up
    # the new env.
    sys.path.insert(0, str(Path(__file__).parent))
    if "main" in sys.modules:
        del sys.modules["main"]
    import main as _main  # noqa: WPS433 — intentional fresh import
    importlib.reload(_main)
    return _main


@pytest.fixture
def client(app_module):
    return TestClient(app_module.app)


def _sample_payload(**overrides) -> dict:
    base = {
        "occurred_at": "2026-05-22T00:00:00Z",
        "category": "skill",
        "scope": "global",
        "title": "test event",
        "desc": "details",
    }
    base.update(overrides)
    return base


def test_healthz_does_not_require_data_file(client) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_empty_when_no_file(client) -> None:
    r = client.get("/")
    assert r.status_code == 200
    assert r.json() == []


def test_create_then_list_round_trips(client) -> None:
    r = client.post("/", json=_sample_payload())
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["id"]
    assert created["created_by"] == "shared-basic-auth"
    assert created["title"] == "test event"

    r2 = client.get("/")
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert r2.json()[0]["id"] == created["id"]


def test_create_persists_device_hint_when_present(client) -> None:
    r = client.post("/", json=_sample_payload(device_hint="Mac Sergey"))
    assert r.status_code == 201
    assert r.json()["device_hint"] == "Mac Sergey"
    items = client.get("/").json()
    assert items[0]["device_hint"] == "Mac Sergey"


def test_create_rejects_oversize_title(client) -> None:
    r = client.post("/", json=_sample_payload(title="x" * 121))
    assert r.status_code == 422


def test_create_rejects_invalid_iso(client) -> None:
    r = client.post("/", json=_sample_payload(occurred_at="not-a-date"))
    assert r.status_code == 422


def test_create_rejects_unknown_category(client) -> None:
    r = client.post("/", json=_sample_payload(category="rumour"))
    assert r.status_code == 422


def test_create_rejects_oversize_device_hint(client) -> None:
    r = client.post("/", json=_sample_payload(device_hint="z" * 41))
    assert r.status_code == 422


def test_delete_existing_then_404_after(client) -> None:
    created = client.post("/", json=_sample_payload()).json()
    r1 = client.delete(f"/{created['id']}")
    assert r1.status_code == 204
    r2 = client.delete(f"/{created['id']}")
    assert r2.status_code == 404


def test_delete_unknown_id_is_404(client) -> None:
    r = client.delete("/does-not-exist")
    assert r.status_code == 404


def test_writes_create_snapshots_in_backup_dir(client, app_module) -> None:
    client.post("/", json=_sample_payload(title="first"))
    client.post("/", json=_sample_payload(title="second"))
    snaps = sorted(app_module.BACKUP_DIR.glob("annotations-*.json"))
    # First write has nothing to snapshot (empty state), second produces
    # one snapshot. So we expect ≥1.
    assert len(snaps) >= 1


def test_fifo_cap_drops_oldest_when_over_limit(
    client, app_module, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Tighten the cap so we don't have to insert 501 events.
    monkeypatch.setattr(app_module, "MAX_EVENTS", 3)
    for i in range(5):
        r = client.post(
            "/",
            json=_sample_payload(
                title=f"event-{i}",
                occurred_at=f"2026-05-{20 + i:02d}T00:00:00Z",
            ),
        )
        assert r.status_code == 201
    items = client.get("/").json()
    assert len(items) == 3
    # FIFO by occurred_at — the three most recent wins.
    titles = [e["title"] for e in items]
    assert "event-0" not in titles
    assert "event-4" in titles


def test_corrupted_file_returns_500(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_file = tmp_path / "annotations.json"
    data_file.write_text("{not json")
    monkeypatch.setenv("ANNOT_FILE", str(data_file))
    monkeypatch.setenv("ANNOT_LOCK", str(data_file) + ".lock")
    monkeypatch.setenv("ANNOT_BACKUPS", str(data_file) + ".backups")
    sys.path.insert(0, str(Path(__file__).parent))
    if "main" in sys.modules:
        del sys.modules["main"]
    import main as _main  # noqa: WPS433

    importlib.reload(_main)
    with TestClient(_main.app, raise_server_exceptions=False) as c:
        r = c.get("/")
        assert r.status_code == 500


def test_atomic_write_leaves_no_tmp_artifact(client, app_module) -> None:
    client.post("/", json=_sample_payload())
    leftovers = list(app_module.DATA_FILE.parent.glob("*.tmp"))
    assert leftovers == []


def test_reads_legacy_dict_shape(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Older format: `{"annotations": [...]}` (single-document JSON)."""
    data_file = tmp_path / "annotations.json"
    data_file.write_text(json.dumps({"annotations": [
        {
            "id": "abc",
            "occurred_at": "2026-05-22T00:00:00Z",
            "category": "deploy",
            "scope": "global",
            "title": "legacy",
            "desc": "",
            "created_by": "shared-basic-auth",
            "created_at": "2026-05-22T00:00:00Z",
        }
    ]}))
    monkeypatch.setenv("ANNOT_FILE", str(data_file))
    monkeypatch.setenv("ANNOT_LOCK", str(data_file) + ".lock")
    monkeypatch.setenv("ANNOT_BACKUPS", str(data_file) + ".backups")
    sys.path.insert(0, str(Path(__file__).parent))
    if "main" in sys.modules:
        del sys.modules["main"]
    import main as _main  # noqa: WPS433

    importlib.reload(_main)
    with TestClient(_main.app) as c:
        items = c.get("/").json()
        assert len(items) == 1
        assert items[0]["title"] == "legacy"
