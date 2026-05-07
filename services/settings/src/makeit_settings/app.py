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

    @app.get("/settings/keys")
    async def settings_list_keys(
        username: Annotated[str, Depends(_verify_settings_token)],
        store: Annotated[SettingsStore, Depends(_get_settings_store)],
    ) -> list[str]:
        keys = await asyncio.to_thread(store.list_keys, username)
        logger.info("settings_access user=%s action=list_keys", username)
        return keys

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

    return app


app = create_app()
