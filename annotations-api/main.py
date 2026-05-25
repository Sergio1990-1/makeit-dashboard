"""
annotations-api — tiny FastAPI service backing /api/annotations on the VPS.

What this owns
--------------
One JSON file (default: $ANNOT_FILE, defaults to /data/annotations.json
inside the container). Stores manually-authored timeline events for the
«Качество кода» tab (skill updates, deploys, ad-hoc notes).

Why a service and not a static file
-----------------------------------
We need writes from any device the team uses. A static file under nginx
can't accept POSTs, and giving every browser SSH access to /opt isn't
serious. This is the smallest write-side surface that still keeps the
read side cache-friendly (browser hits the same nginx that serves the
SPA — no third-party token, no CORS).

Concurrency + durability
------------------------
- `filelock` around the read-modify-write — protects against simultaneous
  POST/DELETE from the same uvicorn worker pool.
- Before any change, snapshot the current file to `<file>.backups/<ts>.json`
  (so a bad write can be hand-recovered without restoring from a VPS
  backup). Snapshots are pruned to MAX_SNAPSHOTS most-recent.
- New content is written to `<file>.tmp` + fsync, then atomically renamed
  over `<file>` (POSIX rename(2)). A reader never sees a half-written file.

Auth
----
None at the app layer. This sits behind the same nginx Basic Auth that
gates the rest of the dashboard. If you expose it to the open internet
without Basic Auth, anybody can wipe your annotations — there are no
accounts here, the `created_by` field is a fixed string.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from filelock import FileLock
from pydantic import BaseModel, Field, field_validator
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# ── Config (env-driven) ───────────────────────────────────────────────

DATA_FILE = Path(os.environ.get("ANNOT_FILE", "/data/annotations.json"))
LOCK_FILE = Path(os.environ.get("ANNOT_LOCK", str(DATA_FILE) + ".lock"))
BACKUP_DIR = Path(os.environ.get("ANNOT_BACKUPS", str(DATA_FILE) + ".backups"))

# Hard cap on stored events. Old ones get dropped from the head once we
# cross this — keeps the JSON small enough to GET every page load and
# stops a clipboard accident from filling the disk.
MAX_EVENTS = int(os.environ.get("ANNOT_MAX_EVENTS", "500"))

# Backup retention. Each successful write produces one snapshot; we keep
# the most recent N. 100 ≈ a few months of normal use even if someone
# fat-fingers the dashboard.
MAX_SNAPSHOTS = int(os.environ.get("ANNOT_MAX_SNAPSHOTS", "100"))

# Content-Length cap. Pydantic enforces per-field maxes, but a request
# body bigger than this can't fit a single legitimate event — reject
# early before parsing rather than building up huge buffers.
MAX_BODY_BYTES = int(os.environ.get("ANNOT_MAX_BODY_BYTES", str(4 * 1024)))

# ── Models ────────────────────────────────────────────────────────────


class AnnotationCreate(BaseModel):
    """Inbound payload — client-supplied fields only."""

    occurred_at: str = Field(..., description="UTC ISO8601 when the event happened")
    category: Literal["skill", "deploy", "manual"]
    scope: Literal["global", "repo"] = "global"
    repos: list[str] | None = None
    title: str = Field(..., min_length=1, max_length=120)
    desc: str = Field(default="", max_length=600)
    # device_hint is a *display* label, not auth — see device-hint.ts.
    device_hint: str | None = Field(default=None, max_length=40)

    @field_validator("occurred_at")
    @classmethod
    def _check_iso(cls, v: str) -> str:
        # Accept ...Z or ...+00:00; normalise to ...+00:00 form.
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("occurred_at must be ISO8601")
        return v


class Annotation(AnnotationCreate):
    """Stored shape — adds server-assigned fields."""

    id: str
    created_by: str = "shared-basic-auth"
    created_at: str


# ── Storage helpers ───────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _load() -> list[dict]:
    """Read current events list, treating missing/empty file as []."""
    if not DATA_FILE.exists():
        return []
    raw = DATA_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Corrupted file → don't blow away in-flight requests; surface 500
        # so we notice. Hand-recovery: copy the latest backup into place.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="annotations file is corrupted; restore from backup",
        )
    if isinstance(data, dict) and "annotations" in data:
        return list(data["annotations"])  # legacy shape tolerance
    if not isinstance(data, list):
        return []
    return list(data)


def _snapshot_current() -> None:
    """Copy the current file into BACKUP_DIR before mutating it."""
    if not DATA_FILE.exists():
        return
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    # `time.time_ns()` suffix breaks ties when two writes land in the
    # same second (rare but happens during test loops / quick redo).
    backup_path = BACKUP_DIR / f"annotations-{ts}-{time.time_ns()}.json"
    backup_path.write_bytes(DATA_FILE.read_bytes())


def _prune_snapshots() -> None:
    snaps = sorted(BACKUP_DIR.glob("annotations-*.json"))
    if len(snaps) <= MAX_SNAPSHOTS:
        return
    for old in snaps[: -MAX_SNAPSHOTS]:
        try:
            old.unlink()
        except OSError:
            pass  # next prune will retry


def _atomic_write(events: list[dict]) -> None:
    """tmp + fsync + rename — readers never see a partial JSON."""
    tmp = DATA_FILE.with_suffix(DATA_FILE.suffix + ".tmp")
    payload = json.dumps(events, ensure_ascii=False, indent=2)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


def _save(events: list[dict]) -> None:
    """One transactional write: snapshot + cap + atomic rename + prune."""
    _ensure_dirs()
    # FIFO cap — drop oldest by occurred_at. Anything pruned here is
    # already in the latest snapshot, so it's recoverable.
    if len(events) > MAX_EVENTS:
        events = sorted(events, key=lambda e: e.get("occurred_at", ""))[-MAX_EVENTS:]
    _snapshot_current()
    _atomic_write(events)
    _prune_snapshots()


# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="makeit-annotations-api",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Enforce MAX_BODY_BYTES on the actual body, not just Content-Length.

    The earlier Content-Length-only check left a hole: a chunked-transfer
    POST omits `Content-Length`, so a malicious client could stream an
    arbitrarily large body that this app would buffer through Pydantic
    before rejecting on per-field maxes. Nginx caps at 4KB in production
    too, but this is defence-in-depth (and protects the dev/test setup
    where there's no nginx in front).

    We read the full body, count bytes, then re-inject it into the
    receive channel so downstream handlers see it normally. Only POST
    bodies matter — GET and DELETE here have no body.
    """

    async def dispatch(self, request: Request, call_next):
        # Cheap path: header-based pre-check still wins when it's present
        # — saves a full body read on accidentally-huge requests.
        cl = request.headers.get("content-length")
        if cl and int(cl) > MAX_BODY_BYTES:
            return JSONResponse(
                {"detail": f"body exceeds {MAX_BODY_BYTES} bytes"},
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        # Real check: read once, measure, then put it back. ASGI receive
        # channels are single-use, so we buffer and replay.
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            return JSONResponse(
                {"detail": f"body exceeds {MAX_BODY_BYTES} bytes"},
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        async def _replay() -> dict:
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = _replay  # type: ignore[attr-defined]
        return await call_next(request)


app.add_middleware(BodySizeLimitMiddleware)

# In production the dashboard hits us same-origin via nginx, so CORS is
# a no-op. Allow localhost during dev so you can run `npm run dev`
# against a locally-running container without proxying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

_lock = FileLock(str(LOCK_FILE), timeout=10)


@app.get("/healthz")
def healthz() -> dict:
    """Liveness — does NOT touch the data file (no lock contention)."""
    return {"status": "ok"}


@app.get("/")
def list_annotations() -> list[dict]:
    with _lock:
        return _load()


@app.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=Annotation,
)
def create_annotation(payload: AnnotationCreate) -> Annotation:
    # Body-size cap is enforced by BodySizeLimitMiddleware — by the time
    # this handler runs, the body is guaranteed ≤ MAX_BODY_BYTES.
    item = Annotation(
        **payload.model_dump(),
        id=str(uuid.uuid4()),
        created_by="shared-basic-auth",
        created_at=_now_iso(),
    )
    with _lock:
        events = _load()
        events.append(item.model_dump(exclude_none=False))
        _save(events)
    return item


# `response_model=None` is required: FastAPI infers `response_model=type(None)`
# from `-> None`, then asserts that 204 routes can't have a response body and
# refuses to start. Explicit None opts out of the inference.
@app.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_annotation(annotation_id: str) -> None:
    with _lock:
        events = _load()
        before = len(events)
        events = [e for e in events if e.get("id") != annotation_id]
        if len(events) == before:
            # Idempotent — 404 lets the client distinguish "actually gone"
            # from "you raced someone", which our React client treats as
            # success but other consumers may want to log.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        _save(events)
