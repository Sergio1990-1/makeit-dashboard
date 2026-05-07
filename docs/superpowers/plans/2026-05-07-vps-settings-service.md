# VPS Settings Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `/settings/*` (encrypted secret store, bearer-auth) off the Pipeline Mac and onto the VPS as a standalone Python service so the dashboard's secret loading no longer depends on the Pipeline Mac being online.

**Architecture:** New tiny FastAPI service (`makeit_settings`, port 8768, internal-only) hosted in `services/settings/` of the dashboard repo, deployed as a Docker container on `89.167.17.79` next to the dashboard, with the existing SQLite + AES-GCM-256 store copied verbatim from Pipeline. Nginx proxies `/api/settings/*` to it. The dashboard's `settings.ts` swaps `PIPELINE_BASE_URL` → new `SETTINGS_BASE_URL`. Pipeline `/settings/*` stays alive until verified, then a separate cleanup PR removes it.

**Tech Stack:** Python 3.12, FastAPI, SQLite, AES-GCM-256 (cryptography lib), uv, Docker, nginx (existing). Dashboard side: TypeScript, Vite.

**Spec:** [docs/superpowers/specs/2026-05-07-vps-settings-service-design.md](../specs/2026-05-07-vps-settings-service-design.md)

---

## Phase A — Local Code (in `makeit-dashboard` repo on a feature branch)

### Task 0: Create feature branch

**Files:** none (git operation)

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```
Expected: `working tree clean` on `main`.

- [ ] **Step 2: Create branch**

```bash
git checkout -b feat/vps-settings-service
```

---

### Task 1: Scaffold `services/settings/` directory

**Files:**
- Create: `services/settings/pyproject.toml`
- Create: `services/settings/Dockerfile`
- Create: `services/settings/.env.example`
- Create: `services/settings/.gitignore`
- Create: `services/settings/README.md`
- Create: `services/settings/src/makeit_settings/__init__.py` (empty)
- Create: `services/settings/tests/__init__.py` (empty)
- Create: `services/settings/tests/conftest.py` (fixtures, will fill in Task 4)

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p services/settings/src/makeit_settings services/settings/tests
touch services/settings/src/makeit_settings/__init__.py services/settings/tests/__init__.py
```

- [ ] **Step 2: Write `services/settings/pyproject.toml`**

```toml
[project]
name = "makeit-settings"
version = "0.1.0"
description = "Encrypted bearer-auth settings store for the MakeIT dashboard."
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "cryptography>=43",
    "pydantic>=2.9",
]

[project.optional-dependencies]
dev = [
    "pytest>=8",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/makeit_settings"]
```

- [ ] **Step 3: Write `services/settings/.env.example`**

```bash
# Bearer token clients must send: `Authorization: Bearer <value>`.
# Generate with: openssl rand -hex 32
PIPELINE_SETTINGS_TOKEN=

# AES-GCM-256 master key, base64-encoded 32 bytes.
# Generate with: openssl rand -base64 32
PIPELINE_SETTINGS_ENCRYPTION_KEY=
```

- [ ] **Step 4: Write `services/settings/.gitignore`**

```
.env
.venv/
__pycache__/
*.pyc
.pytest_cache/
*.db
*.db-journal
dist/
*.egg-info/
```

- [ ] **Step 5: Write `services/settings/Dockerfile`**

```dockerfile
FROM python:3.12-slim AS build
WORKDIR /app
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir .

FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --uid 1001 settings && \
    mkdir -p /data && chown -R settings:settings /data
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY src/ ./src/
USER settings
ENV PYTHONPATH=/app/src
EXPOSE 8768
CMD ["uvicorn", "makeit_settings.app:app", "--host", "0.0.0.0", "--port", "8768"]
```

- [ ] **Step 6: Write `services/settings/README.md`**

```markdown
# makeit-settings

Encrypted bearer-auth secret store for the MakeIT dashboard. Replaces the
`/settings/*` endpoints that previously lived in `makeit-pipeline`.

## Endpoints

- `GET  /settings/keys`     → `["github_token", ...]`
- `GET  /settings`          → `[{key, masked_value}, ...]`
- `GET  /settings/{key}`    → `{key, value}`
- `PUT  /settings/{key}`    body `{value}` → 204
- `DELETE /settings/{key}`  → 204
- `GET  /health`            → 200

All `/settings/*` routes require `Authorization: Bearer <PIPELINE_SETTINGS_TOKEN>`.

## Local development

```bash
cp .env.example .env
# fill in PIPELINE_SETTINGS_TOKEN and PIPELINE_SETTINGS_ENCRYPTION_KEY
pip install -e ".[dev]"
PIPELINE_SETTINGS_TOKEN=dev PIPELINE_SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32) \
    uvicorn makeit_settings.app:app --port 8768 --reload
```

## Testing

```bash
pytest
```

## Deploy

Built and run on VPS via `/opt/apps/makeit-stack/docker-compose.yml`
(service `makeit_settings`).
```

- [ ] **Step 7: Verify scaffolding**

```bash
ls -la services/settings/
test -f services/settings/pyproject.toml && test -f services/settings/Dockerfile && echo OK
```

- [ ] **Step 8: Commit**

```bash
git add services/settings/
git commit -m "feat(settings): scaffold makeit-settings service"
```

---

### Task 2: Copy `settings_store.py` from Pipeline

**Files:**
- Create: `services/settings/src/makeit_settings/settings_store.py`

The store is battle-tested in production. Copy verbatim, then verify it imports.

- [ ] **Step 1: Copy file**

```bash
cp /Users/sergey/Desktop/makeit-pipeline/src/makeit_pipeline/settings_store.py \
   services/settings/src/makeit_settings/settings_store.py
```

- [ ] **Step 2: Install service in editable mode**

```bash
cd services/settings && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
```
Expected: `Successfully installed makeit-settings-0.1.0 ...`

- [ ] **Step 3: Verify import works**

```bash
python3 -c "from makeit_settings.settings_store import SettingsStore, SettingsStoreError, ENCRYPTION_KEY_ENV; print('OK')"
```
Expected: `OK`.

- [ ] **Step 4: Smoke-test encrypt/decrypt round-trip**

```bash
python3 -c "
import base64, secrets
from makeit_settings.settings_store import SettingsStore
from pathlib import Path
import tempfile
with tempfile.TemporaryDirectory() as td:
    s = SettingsStore(db_path=Path(td)/'t.db', encryption_key=secrets.token_bytes(32))
    s.put('default', 'k1', 'value-one')
    assert s.get('default', 'k1') == 'value-one'
    assert s.list_keys('default') == ['k1']
    s.delete('default', 'k1')
    assert s.get('default', 'k1') is None
print('round-trip OK')
"
```
Expected: `round-trip OK`.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add services/settings/src/makeit_settings/settings_store.py
git commit -m "feat(settings): port settings_store from makeit-pipeline"
```

---

### Task 3: Write `app.py` minimal — lifespan + `/health`

**Files:**
- Create: `services/settings/src/makeit_settings/app.py`
- Create: `services/settings/tests/test_health.py`
- Modify: `services/settings/tests/conftest.py`

- [ ] **Step 1: Write `services/settings/tests/conftest.py`**

```python
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
```

- [ ] **Step 2: Write failing test `services/settings/tests/test_health.py`**

```python
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
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd services/settings && pytest tests/test_health.py -v
```
Expected: ImportError on `from makeit_settings.app import ...` (file doesn't exist yet).

- [ ] **Step 4: Write `services/settings/src/makeit_settings/app.py`**

```python
"""FastAPI app exposing the makeit-settings store over HTTP.

Mirror of the /settings/* endpoints previously hosted by makeit-pipeline,
extracted so the dashboard's secret loading no longer depends on the Pipeline
Mac being reachable.
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, AsyncIterator

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .settings_store import SettingsStore, SettingsStoreError

logger = logging.getLogger(__name__)

SETTINGS_TOKEN_ENV = "PIPELINE_SETTINGS_TOKEN"
DB_PATH_ENV = "MAKEIT_SETTINGS_DB_PATH"


def _mask_setting_value(value: str) -> str:
    """Redact a secret for the bulk listing endpoint."""
    if value is None:  # type: ignore[redundant-expr]
        return "****"
    if len(value) <= 4:
        return "****"
    if len(value) <= 11:
        return f"{value[:3]}****"
    return f"{value[:3]}…{value[-4:]}"


async def _verify_settings_token(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Bearer auth dep for /settings/*. Returns username on success.

    Module-scope (not closure) so FastAPI's get_type_hints resolution under
    `from __future__ import annotations` can find this symbol when the
    stringified type annotations are re-evaluated.
    """
    unauthorized = HTTPException(
        status_code=401,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )
    expected = os.environ.get(SETTINGS_TOKEN_ENV) or ""
    if not expected:
        raise unauthorized
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized
    provided = authorization[len("Bearer ") :]
    if not secrets.compare_digest(provided, expected):
        raise unauthorized
    return "default"  # multi-user is a future epic


async def _get_settings_store(request: Request) -> SettingsStore:
    store = getattr(request.app.state, "settings_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="Settings store not configured")
    return store


class _SettingsValueBody(BaseModel):
    value: str = Field(..., max_length=65536)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            db_path_str = os.environ.get(DB_PATH_ENV)
            db_path = Path(db_path_str) if db_path_str else None
            app.state.settings_store = SettingsStore(db_path=db_path)
            logger.info("settings_store ready: %s", app.state.settings_store.db_path)
        except SettingsStoreError as exc:
            app.state.settings_store = None
            logger.warning("settings_store unavailable: %s", exc)
        except Exception:
            app.state.settings_store = None
            logger.exception("settings_store init crashed")
        yield

    app = FastAPI(
        title="MakeIT Settings",
        version="0.1.0",
        description="Encrypted bearer-auth secret store.",
        lifespan=_lifespan,
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pytest tests/test_health.py -v
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

The DB-path env override (`MAKEIT_SETTINGS_DB_PATH`) is in `app.py` from this task. Coverage for it lands in Task 7 (after `PUT` exists, so a test can write something and assert the file landed at the override path). Local smoke test: in Task 11.

```bash
cd ../..
git add services/settings/src/makeit_settings/app.py services/settings/tests/conftest.py services/settings/tests/test_health.py
git commit -m "feat(settings): add FastAPI app skeleton with /health and DB path env override"
```

---

### Task 4: Add `GET /settings/keys` + auth tests

**Files:**
- Modify: `services/settings/src/makeit_settings/app.py`
- Create: `services/settings/tests/test_api.py`

- [ ] **Step 1: Write failing tests `services/settings/tests/test_api.py`**

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd services/settings && pytest tests/test_api.py -v
```
Expected: 4 auth tests pass (auth dep already exists for future endpoints), 2 keys tests fail with 404 (no route yet).

- [ ] **Step 3: Add endpoint to `app.py` (inside `create_app`, after `/health`)**

```python
    @app.get("/settings/keys")
    async def settings_list_keys(
        username: Annotated[str, Depends(_verify_settings_token)],
        store: Annotated[SettingsStore, Depends(_get_settings_store)],
    ) -> list[str]:
        keys = await asyncio.to_thread(store.list_keys, username)
        logger.info("settings_access user=%s action=list_keys", username)
        return keys
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_api.py -v
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add services/settings/src/makeit_settings/app.py services/settings/tests/test_api.py
git commit -m "feat(settings): GET /settings/keys with bearer auth"
```

---

### Task 5: Add `GET /settings` (masked listing)

**Files:**
- Modify: `services/settings/src/makeit_settings/app.py`
- Modify: `services/settings/tests/test_api.py`

- [ ] **Step 1: Append failing tests to `tests/test_api.py`**

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd services/settings && pytest tests/test_api.py -k "get_all" -v
```
Expected: both fail (404 from missing GET /settings; 405 from PUT on missing route).

- [ ] **Step 3: Add endpoint to `app.py` (inside `create_app`, after `/settings/keys`)**

```python
    @app.get("/settings")
    async def settings_get_all(
        username: Annotated[str, Depends(_verify_settings_token)],
        store: Annotated[SettingsStore, Depends(_get_settings_store)],
    ) -> list[dict[str, str]]:
        values = await asyncio.to_thread(store.get_all, username)
        logger.info("settings_access user=%s action=get_all keys=%d", username, len(values))
        return [
            {"key": k, "masked_value": _mask_setting_value(v)} for k, v in sorted(values.items())
        ]
```

- [ ] **Step 4: Run; the masked-listing test still fails because PUT doesn't exist yet — defer to Task 7**

The `test_get_all_empty` test passes after this step. The `test_get_all_returns_masked_listing` test depends on PUT — keep it failing for now and pick up in Task 7. Verify:

```bash
pytest tests/test_api.py::test_get_all_empty -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add services/settings/src/makeit_settings/app.py services/settings/tests/test_api.py
git commit -m "feat(settings): GET /settings (masked listing)"
```

---

### Task 6: Add `GET /settings/{key}`

**Files:**
- Modify: `services/settings/src/makeit_settings/app.py`
- Modify: `services/settings/tests/test_api.py`

- [ ] **Step 1: Append failing test**

```python
def test_get_missing_returns_404(client, auth_headers):
    r = client.get("/settings/nonexistent", headers=auth_headers)
    assert r.status_code == 404
```

- [ ] **Step 2: Run; expect 401 or 404 from default FastAPI handling for missing route**

```bash
cd services/settings && pytest tests/test_api.py::test_get_missing_returns_404 -v
```
Expected: fail with 401 (auth dep on /settings/{key} not registered → falls through to /settings/keys path → 404 actually, but auth check happens first... let's just run it and see).

- [ ] **Step 3: Add endpoint to `app.py`**

```python
    @app.get("/settings/{key}")
    async def settings_get(
        key: str,
        username: Annotated[str, Depends(_verify_settings_token)],
        store: Annotated[SettingsStore, Depends(_get_settings_store)],
    ) -> dict[str, str]:
        value = await asyncio.to_thread(store.get, username, key)
        if value is None:
            logger.info("settings_access user=%s action=get key=%s status=404", username, key)
            raise HTTPException(status_code=404, detail="Not found")
        logger.info("settings_access user=%s action=get key=%s", username, key)
        return {"key": key, "value": value}
```

- [ ] **Step 4: Run test; expect pass**

```bash
pytest tests/test_api.py::test_get_missing_returns_404 -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add services/settings/src/makeit_settings/app.py services/settings/tests/test_api.py
git commit -m "feat(settings): GET /settings/{key}"
```

---

### Task 7: Add `PUT /settings/{key}` and complete masked-listing test

**Files:**
- Modify: `services/settings/src/makeit_settings/app.py`
- Modify: `services/settings/tests/test_api.py`

- [ ] **Step 1: Append failing tests**

```python
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
```

- [ ] **Step 2: Run tests, confirm fails (405 method not allowed)**

```bash
cd services/settings && pytest tests/test_api.py -k put -v
```

- [ ] **Step 3: Add endpoint**

```python
    @app.put("/settings/{key}", status_code=204)
    async def settings_put(
        key: str,
        body: _SettingsValueBody,
        username: Annotated[str, Depends(_verify_settings_token)],
        store: Annotated[SettingsStore, Depends(_get_settings_store)],
    ) -> Response:
        await asyncio.to_thread(store.put, username, key, body.value)
        logger.info("settings_access user=%s action=put key=%s", username, key)
        return Response(status_code=204)
```

- [ ] **Step 4: Run all api tests, confirm masked-listing test from Task 5 also now passes**

```bash
pytest tests/test_api.py -v
```
Expected: all green.

- [ ] **Step 5: Add DB-path env override test (now possible — needs PUT)**

Append to `tests/test_api.py`:

```python
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
```

- [ ] **Step 6: Run, confirm passes**

```bash
pytest tests/test_api.py::test_db_path_env_override -v
```

- [ ] **Step 7: Commit**

```bash
cd ../..
git add services/settings/src/makeit_settings/app.py services/settings/tests/test_api.py
git commit -m "feat(settings): PUT /settings/{key} + DB path override coverage"
```

---

### Task 8: Add `DELETE /settings/{key}`

**Files:**
- Modify: `services/settings/src/makeit_settings/app.py`
- Modify: `services/settings/tests/test_api.py`

- [ ] **Step 1: Append failing tests**

```python
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
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd services/settings && pytest tests/test_api.py -k delete -v
```

- [ ] **Step 3: Add endpoint**

```python
    @app.delete("/settings/{key}", status_code=204)
    async def settings_delete(
        key: str,
        username: Annotated[str, Depends(_verify_settings_token)],
        store: Annotated[SettingsStore, Depends(_get_settings_store)],
    ) -> Response:
        deleted = await asyncio.to_thread(store.delete, username, key)
        if not deleted:
            logger.info("settings_access user=%s action=delete key=%s status=404", username, key)
            raise HTTPException(status_code=404, detail="Not found")
        logger.info("settings_access user=%s action=delete key=%s", username, key)
        return Response(status_code=204)
```

- [ ] **Step 4: Run, confirm passes**

```bash
pytest tests/test_api.py -v
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add services/settings/src/makeit_settings/app.py services/settings/tests/test_api.py
git commit -m "feat(settings): DELETE /settings/{key}"
```

---

### Task 9: 503 path when encryption key is missing

**Files:**
- Modify: `services/settings/tests/test_api.py`

- [ ] **Step 1: Append failing test**

```python
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
```

- [ ] **Step 2: Run; confirm passes (lifespan already handles this via the existing try/except)**

```bash
cd services/settings && pytest tests/test_api.py::test_503_when_encryption_key_missing -v
```
Expected: 1 passed (no code change needed — `_get_settings_store` raises 503 when `app.state.settings_store is None`).

- [ ] **Step 3: Run full suite to confirm nothing regressed**

```bash
pytest -v
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add services/settings/tests/test_api.py
git commit -m "test(settings): cover 503 path when encryption key missing"
```

---

### Task 10: Update dashboard frontend to use `SETTINGS_BASE_URL`

**Files:**
- Modify: `src/utils/config.ts:175-178` (add SETTINGS_BASE_URL export)
- Modify: `src/utils/settings.ts:22` (swap import)
- Modify: `public/config.js` (add SETTINGS_URL key)
- Modify: `src/vite-env.d.ts` or wherever `__MAKEIT_CONFIG__` is typed (if it is)

- [ ] **Step 1: Find the typing for `__MAKEIT_CONFIG__`**

```bash
grep -rn "__MAKEIT_CONFIG__" src/ --include="*.ts" --include="*.tsx"
```
Note the locations. If types are inline (as in current `config.ts`), update them inline.

- [ ] **Step 2: Modify `src/utils/config.ts` — replace the `PIPELINE_BASE_URL` block**

Find lines 174-177 (current):
```ts
// Pipeline API base URL (shared by pipeline.ts, quality.ts, debate.ts, transcript.ts)
export const PIPELINE_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { PIPELINE_URL?: string } }).__MAKEIT_CONFIG__?.PIPELINE_URL
  ?? "http://127.0.0.1:8766";
```

Replace with:
```ts
// Pipeline API base URL (shared by pipeline.ts, quality.ts, debate.ts, transcript.ts)
export const PIPELINE_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { PIPELINE_URL?: string } }).__MAKEIT_CONFIG__?.PIPELINE_URL
  ?? "http://127.0.0.1:8766";

// Settings store base URL — separate from PIPELINE_URL because the store now
// lives on the VPS as its own service (makeit-settings), independent of the
// Pipeline Mac. Falls back to PIPELINE_URL so local dev (and any deploy that
// hasn't been re-configured yet) keeps working against Pipeline's /settings.
export const SETTINGS_BASE_URL =
  (window as unknown as { __MAKEIT_CONFIG__?: { SETTINGS_URL?: string } }).__MAKEIT_CONFIG__?.SETTINGS_URL
  ?? PIPELINE_BASE_URL;
```

- [ ] **Step 3: Modify `src/utils/settings.ts` — swap the import**

Find line 22:
```ts
import { PIPELINE_BASE_URL } from "./config";
```

Replace with:
```ts
import { SETTINGS_BASE_URL } from "./config";
```

Then find every use of `PIPELINE_BASE_URL` in this file (should be in `request()`):
```bash
grep -n "PIPELINE_BASE_URL" src/utils/settings.ts
```

Replace each with `SETTINGS_BASE_URL`.

- [ ] **Step 4: Modify `public/config.js` — add SETTINGS_URL**

Current content of `public/config.js`:
```bash
cat public/config.js
```

For local dev, `SETTINGS_URL` defaults to PIPELINE_URL (handled by config.ts fallback). No change needed in `public/config.js` — it stays as-is. The VPS `config.js` (separate file at `/opt/apps/makeit-stack/config.js`) gets the new key during VPS deploy (Phase B).

But: add a commented hint in `public/config.js` so dev knows the override exists. Open the file and add:
```js
window.__MAKEIT_CONFIG__ = {
  // ... existing keys ...
  // SETTINGS_URL: "http://127.0.0.1:8768",  // override only when running makeit-settings locally; else PIPELINE_URL is used
};
```
(Edit in place — exact diff depends on current contents.)

- [ ] **Step 5: Run typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/config.ts src/utils/settings.ts public/config.js
git commit -m "feat(dashboard): wire settings.ts to SETTINGS_BASE_URL"
```

---

### Task 11: Local dashboard verification (end-to-end against Pipeline)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Use the Claude Preview tool with launch config `makeit-dashboard` (port 4173).

- [ ] **Step 2: In browser console, verify SETTINGS_BASE_URL falls back correctly**

```js
// Should equal PIPELINE_URL since we didn't override SETTINGS_URL
console.log("SETTINGS_BASE_URL still uses Pipeline:", window.__MAKEIT_CONFIG__);
```

- [ ] **Step 3: Confirm dashboard loads**

If pipeline_settings_token in localStorage and Pipeline is offline: dashboard should show TokenForm (per fix `eb70b35`). If Pipeline is online with valid bootstrap token: dashboard loads dashboards.

- [ ] **Step 4: Stop dev server**

---

### Task 12: Push branch + open PR (PAUSE for user merge approval)

**Files:** none (git operation)

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/vps-settings-service
```

- [ ] **Step 2: Open PR using gh**

```bash
gh pr create --title "feat: VPS-hosted settings service" --body "$(cat <<'EOF'
## Summary
- Adds standalone `makeit_settings` Python service in `services/settings/` (FastAPI + SQLite + AES-GCM-256, copied from Pipeline).
- Wires dashboard `settings.ts` to a new `SETTINGS_BASE_URL` (falls back to `PIPELINE_BASE_URL` for local dev and any deploy not yet flipped).
- Pipeline `/settings/*` stays alive — cleanup follows in a separate PR after VPS rollout.

## Why
Pipeline Mac going offline currently takes the whole dashboard with it (settings can't load → splash stuck or TokenForm shown). After deploy of this service to the VPS, settings, dashboard, monitoring, and milestones all stay up regardless of Pipeline Mac state.

## Spec
[docs/superpowers/specs/2026-05-07-vps-settings-service-design.md](docs/superpowers/specs/2026-05-07-vps-settings-service-design.md)

## Plan
[docs/superpowers/plans/2026-05-07-vps-settings-service.md](docs/superpowers/plans/2026-05-07-vps-settings-service.md)

## Test plan
- [x] Service: `pytest` covers all 5 endpoints + auth + 503 path.
- [x] Dashboard: `npm run lint` and `npx tsc --noEmit` clean.
- [ ] VPS deploy follows after merge (separate sequence, see plan Phase B).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: STOP. Wait for user approval to merge.**

The user reviews the PR. Do not merge without explicit "merge it" instruction.

---

## Phase B — VPS Deploy (after PR merged to main)

**Pre-flight:** `ssh root@89.167.17.79 'cd /opt/apps/makeit-stack && git -C makeit-dashboard log -1 --oneline'` — confirm the merged commit is present (or `git pull` first).

### Task 13: VPS data dir + DB snapshot

**Files (on VPS):**
- Create dir: `/opt/apps/makeit-stack/settings-data/`
- Create file: `/opt/apps/makeit-stack/settings-data/settings.db` (from snapshot)

- [ ] **Step 1: Verify snapshot is on VPS**

```bash
ssh root@89.167.17.79 'ls -la /tmp/settings-snap.db'
```
Expected: file exists, size ~16 KiB (matches local snapshot).

- [ ] **Step 2: Create data dir, owned by container user (uid 1001 = `settings` in Dockerfile)**

```bash
ssh root@89.167.17.79 'mkdir -p /opt/apps/makeit-stack/settings-data && chown 1001:1001 /opt/apps/makeit-stack/settings-data && chmod 700 /opt/apps/makeit-stack/settings-data'
```

Why uid 1001: the Dockerfile creates `useradd --uid 1001 settings` and `chown`s `/data`. When we bind-mount `./settings-data:/data`, the host's ownership wins — if the host dir is owned by root, the container user can't write. `chown 1001:1001` on the host side makes the bind mount writable.

- [ ] **Step 3: Move snapshot into place with matching ownership**

```bash
ssh root@89.167.17.79 'mv /tmp/settings-snap.db /opt/apps/makeit-stack/settings-data/settings.db && chown 1001:1001 /opt/apps/makeit-stack/settings-data/settings.db && chmod 600 /opt/apps/makeit-stack/settings-data/settings.db'
```

- [ ] **Step 4: Verify**

```bash
ssh root@89.167.17.79 'ls -la /opt/apps/makeit-stack/settings-data/ && sqlite3 /opt/apps/makeit-stack/settings-data/settings.db "SELECT key FROM user_settings;"'
```
Expected: lists `anthropic_api_key` and `github_token`.

---

### Task 14: VPS settings.env

**Files (on VPS):**
- Create: `/opt/apps/makeit-stack/settings.env`

- [ ] **Step 1: Write env file (root-only)**

The token and key must NOT be put in any git-tracked file or in shell history. Pipe via stdin:

```bash
ssh root@89.167.17.79 "cat > /opt/apps/makeit-stack/settings.env && chmod 600 /opt/apps/makeit-stack/settings.env" <<'EOF'
PIPELINE_SETTINGS_TOKEN=<TOKEN_VALUE>
PIPELINE_SETTINGS_ENCRYPTION_KEY=<KEY_VALUE>
MAKEIT_SETTINGS_DB_PATH=/data/settings.db
EOF
```
(Replace placeholders with the actual values provided by the user — never commit them.)

- [ ] **Step 2: Verify**

```bash
ssh root@89.167.17.79 'ls -la /opt/apps/makeit-stack/settings.env && grep -cE "^(PIPELINE_SETTINGS_|MAKEIT_SETTINGS_)" /opt/apps/makeit-stack/settings.env'
```
Expected: file mode `-rw-------`, owner root, count `3`.

---

### Task 15: VPS docker-compose.yml — add `makeit_settings`

**Files (on VPS):**
- Backup: `/opt/apps/makeit-stack/docker-compose.yml` → `.bak.YYYYMMDD-HHMMSS`
- Modify: `/opt/apps/makeit-stack/docker-compose.yml`

- [ ] **Step 1: Backup current compose file**

```bash
ssh root@89.167.17.79 'cp /opt/apps/makeit-stack/docker-compose.yml /opt/apps/makeit-stack/docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)'
```

- [ ] **Step 2: Append new service block**

```bash
ssh root@89.167.17.79 "cat >> /opt/apps/makeit-stack/docker-compose.yml" <<'EOF'

  settings:
    build:
      context: ./makeit-dashboard/services/settings
    container_name: makeit_settings
    restart: unless-stopped
    env_file:
      - ./settings.env
    volumes:
      - ./settings-data:/data
    expose:
      - "8768"
    networks:
      - proxy_network
EOF
```

Note: `MAKEIT_SETTINGS_DB_PATH=/data/settings.db` is already in `settings.env` from Task 14, and the lifespan reads it (added in Task 3 step 4). The bind-mounted `./settings-data:/data` is owned by uid 1001 (Task 13 step 2), so the `settings` container user can write.

- [ ] **Step 3: Validate compose file**

```bash
ssh root@89.167.17.79 'cd /opt/apps/makeit-stack && docker compose config | tail -30'
```
Expected: `settings` service appears, no errors.

If validation fails: `cp .bak back to original`, do not proceed.

---

### Task 16: Build & start `makeit_settings` only (no-deps)

- [ ] **Step 1: Build & up**

```bash
ssh root@89.167.17.79 'cd /opt/apps/makeit-stack && docker compose up -d --no-deps --build settings'
```
Expected: build succeeds, container `makeit_settings` is `Up`.

- [ ] **Step 2: Verify other containers untouched**

```bash
ssh root@89.167.17.79 'docker ps --filter name=makeit --format "table {{.Names}}\t{{.Status}}"'
```
Expected: `makeit_dashboard`, `makeit_auditor`, `makeit_cache` still in their previous `Up Xh` state, plus new `makeit_settings`.

- [ ] **Step 3: Check container logs for errors**

```bash
ssh root@89.167.17.79 'docker logs makeit_settings 2>&1 | tail -20'
```
Expected: `Uvicorn running on http://0.0.0.0:8768`, `settings_store ready: /data/settings.db`. No tracebacks.

If failure: `ssh root@89.167.17.79 'docker compose stop settings && docker compose rm -f settings'` and investigate.

---

### Task 17: Smoke test container from inside docker network

- [ ] **Step 1: Health check**

```bash
ssh root@89.167.17.79 'docker exec nginx_proxy curl -sf http://makeit_settings:8768/health'
```
Expected: `{"status":"ok"}`

- [ ] **Step 2: Authenticated keys list**

```bash
TOKEN='<value of PIPELINE_SETTINGS_TOKEN>'
ssh root@89.167.17.79 "docker exec nginx_proxy curl -sf -H 'Authorization: Bearer $TOKEN' http://makeit_settings:8768/settings/keys"
```
Expected: `["anthropic_api_key","github_token"]` (same as Pipeline currently returns).

- [ ] **Step 3: Authenticated value fetch**

```bash
ssh root@89.167.17.79 "docker exec nginx_proxy curl -sf -H 'Authorization: Bearer $TOKEN' http://makeit_settings:8768/settings/github_token | head -c 80"
```
Expected: `{"key":"github_token","value":"gho..."}` — first 3 chars match what Pipeline currently returns.

- [ ] **Step 4: Verify 401 path**

```bash
ssh root@89.167.17.79 'docker exec nginx_proxy curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong" http://makeit_settings:8768/settings/keys'
```
Expected: `401`.

If any of these fail: stop, investigate. Pipeline `/settings/*` still works for the dashboard.

---

### Task 18: VPS nginx makeit.conf — add `/api/settings/` route

**Files (on VPS):**
- Backup: `/opt/apps/nginx-proxy/conf.d/makeit.conf` → `.bak.YYYYMMDD-HHMMSS`
- Modify: `/opt/apps/nginx-proxy/conf.d/makeit.conf`

⚠️ **CRITICAL: nginx_proxy serves 7+ sites. A broken reload = all sites down. Strict order: backup → edit → `nginx -t` → reload only if valid.**

- [ ] **Step 1: Backup**

```bash
ssh root@89.167.17.79 'cp /opt/apps/nginx-proxy/conf.d/makeit.conf /opt/apps/nginx-proxy/conf.d/makeit.conf.bak.$(date +%Y%m%d-%H%M%S)'
```

- [ ] **Step 2: Append `/api/settings/` block before the closing `}` of the server block**

```bash
ssh root@89.167.17.79 'python3 - <<PYEOF
from pathlib import Path
p = Path("/opt/apps/nginx-proxy/conf.d/makeit.conf")
src = p.read_text()
block = """
    # Settings store (makeit-settings on VPS, replaces Pipeline /settings/*)
    location /api/settings/ {
        rewrite ^/api/settings(/.*) \\$1 break;
        proxy_pass http://makeit_settings:8768;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
"""
# Insert before the LAST closing brace of the file
i = src.rfind("}")
patched = src[:i] + block + src[i:]
p.write_text(patched)
print("Appended location block.")
PYEOF'
```

- [ ] **Step 3: Validate nginx config**

```bash
ssh root@89.167.17.79 'docker exec nginx_proxy nginx -t'
```
Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.

If invalid: **DO NOT RELOAD**. Restore from backup:
```bash
ssh root@89.167.17.79 'cp /opt/apps/nginx-proxy/conf.d/makeit.conf.bak.* /opt/apps/nginx-proxy/conf.d/makeit.conf' # use the latest .bak
```
Investigate before retrying.

- [ ] **Step 4: Reload nginx**

```bash
ssh root@89.167.17.79 'docker exec nginx_proxy nginx -s reload'
```
Expected: no output (silent success).

- [ ] **Step 5: Verify other sites still work (sanity smoke)**

```bash
ssh root@89.167.17.79 'docker exec nginx_proxy curl -sf -o /dev/null -w "%{http_code} dashboard\n" http://makeit_dashboard:80/ && docker exec nginx_proxy curl -sf -o /dev/null -w "%{http_code} cache\n" http://makeit_cache:8767/health'
```
Expected: `200 dashboard`, `200 cache`.

---

### Task 19: Public smoke test through nginx

- [ ] **Step 1: Hit /api/settings/keys via nginx (still inside VPS shell)**

```bash
TOKEN='<value of PIPELINE_SETTINGS_TOKEN>'
ssh root@89.167.17.79 "curl -sf -H 'Authorization: Bearer $TOKEN' http://localhost/api/settings/keys"
```
Expected: `["anthropic_api_key","github_token"]`.

- [ ] **Step 2: 401 path via nginx**

```bash
ssh root@89.167.17.79 'curl -s -o /dev/null -w "%{http_code}\n" http://localhost/api/settings/keys'
```
Expected: `401`.

If either fails: rollback nginx (Step 3 of Task 18) and investigate.

---

### Task 20: Flip dashboard `config.js` on VPS

**Files (on VPS):**
- Backup: `/opt/apps/makeit-stack/config.js` → `.bak.YYYYMMDD-HHMMSS`
- Modify: `/opt/apps/makeit-stack/config.js`

- [ ] **Step 1: Backup**

```bash
ssh root@89.167.17.79 'cp /opt/apps/makeit-stack/config.js /opt/apps/makeit-stack/config.js.bak.$(date +%Y%m%d-%H%M%S)'
```

- [ ] **Step 2: Add SETTINGS_URL key**

```bash
ssh root@89.167.17.79 "cat > /opt/apps/makeit-stack/config.js" <<'EOF'
window.__MAKEIT_CONFIG__ = {
  AUDITOR_URL: "/api/auditor",
  PIPELINE_URL: "/api/pipeline",
  SETTINGS_URL: "/api/settings",
  CACHE_URL: "/api/cache",
};
EOF
```

- [ ] **Step 3: Verify**

```bash
ssh root@89.167.17.79 'cat /opt/apps/makeit-stack/config.js'
```
Expected: object has `SETTINGS_URL: "/api/settings"`.

- [ ] **Step 4: No container restart needed** — `config.js` is mounted as `:ro` at runtime in the dashboard container; the next browser request picks it up.

---

### Task 21: Browser end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Open dashboard URL in incognito**

Open the production dashboard URL in an incognito browser window (no cached config.js).

- [ ] **Step 2: Check Network tab**

Devtools → Network → filter on `settings`. Expected: requests go to `/api/settings/keys`, `/api/settings/github_token`, `/api/settings/anthropic_api_key` — all 200.

- [ ] **Step 3: Verify dashboard data loads**

Dashboard tab should populate with project cards (proves `getToken()` returned a valid token from settings cache).

- [ ] **Step 4: Quick regression check**

Click each tab: Дашборд, Проекты, Milestones, Завершённые, Мониторинг — all should load without errors. Pipeline tab will show its own offline state if Pipeline Mac is offline (expected).

If everything green: **VPS deploy complete.** Pipeline `/settings/*` is now redundant but still alive as a safety fallback.

---

### Task 22: File tracker issue for Pipeline cleanup

**Files:** none (GitHub operation)

- [ ] **Step 1: Create issue in `makeit-pipeline`**

```bash
gh issue create -R Sergio1990-1/makeit-pipeline \
  --title "tech-debt: remove /settings/* endpoints (moved to VPS)" \
  --label "tech-debt" \
  --body "$(cat <<'EOF'
The `/settings/*` endpoints and `settings_store.py` module have been migrated
to the VPS-hosted `makeit-settings` service (see makeit-dashboard PR for
context). The Pipeline copy is now dead code and should be removed once we've
confirmed the VPS service is stable (~1-2 days of normal usage).

## Scope (single PR)
- Remove `/settings/keys`, `/settings`, `/settings/{key}` (GET/PUT/DELETE) routes from `src/makeit_pipeline/api.py`.
- Remove `_verify_settings_token`, `_get_settings_store`, `_SettingsValueBody`, `_mask_setting_value`, `SETTINGS_TOKEN_ENV`.
- Remove `app.state.settings_store = SettingsStore()` block from lifespan + import.
- Delete `src/makeit_pipeline/settings_store.py`.
- Delete `tests/test_settings_api.py`.
- Drop `PIPELINE_SETTINGS_TOKEN` and `PIPELINE_SETTINGS_ENCRYPTION_KEY` from `.env.example` (and from the Pipeline Mac's `.env`).
- Operator step: `rm ~/.makeit-pipeline/settings.db` on the Pipeline Mac after PR merge.

## Acceptance
- `pytest` passes in `makeit-pipeline`.
- Pipeline boots without `PIPELINE_SETTINGS_*` env vars (no warning, no error).
- Dashboard still loads settings (proves it's hitting the new VPS service, not Pipeline).

## Don't do until
The new `makeit_settings` container has been stable on VPS for at least 24-48 hours of normal use.
EOF
)"
```

- [ ] **Step 2: Add to MakeIT Tracker**

```bash
ISSUE_URL=$(gh issue list -R Sergio1990-1/makeit-pipeline --search "remove /settings/*" --json url --jq '.[0].url')
gh project item-add 1 --owner Sergio1990-1 --url "$ISSUE_URL"
```

- [ ] **Step 3: Verify issue is on tracker**

```bash
gh issue view "$ISSUE_URL" --json title,labels,state
```

---

## Done

After Task 22, the system is in the target state:
- Settings store hosted on VPS, independent of Pipeline Mac.
- Pipeline Mac is a pure compute node for audits, transcripts, batch.
- Dashboard remains usable when Pipeline Mac is offline (degrading only audit/transcripts/pipeline tabs).
- Cleanup PR is queued in tracker for execution after stability period.
