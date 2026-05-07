"""Encrypted persistent storage for user secrets (Epic-004 / Task-01).

Backed by sqlite + AES-GCM-256. Master encryption key from environment
variable :data:`ENCRYPTION_KEY_ENV` (base64-encoded 32 bytes).

This module is deliberately HTTP-free: it provides a pure Python API that
``api.py`` mounts under ``/settings/*`` with Bearer-token auth (Task-02).

Invariants:
* Each PUT generates a fresh 12-byte nonce; nonces are never reused for the
  same (username, key) pair.
* Encryption is bound to the row identity ``(username, key)`` via AES-GCM
  AAD, so a DB-write-capable attacker cannot move ciphertext between rows
  (e.g. swap alice's ``github_token`` into bob's row) without triggering
  :class:`cryptography.exceptions.InvalidTag` on read.
* Decryption uses authenticated AES-GCM, so tampering with ciphertext,
  nonce, or row identity raises :class:`InvalidTag`.
* Plaintext values escape the store only via :meth:`SettingsStore.get` /
  :meth:`SettingsStore.get_all`. :meth:`SettingsStore.list_keys` is
  metadata-only.

Concurrency: ``sqlite3`` is *blocking* I/O. Callers running under FastAPI
async should wrap CRUD methods in :func:`asyncio.to_thread` (Task-02).
"""

from __future__ import annotations

import base64
import binascii
import contextlib
import logging
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path.home() / ".makeit-pipeline" / "settings.db"
ENCRYPTION_KEY_ENV = "PIPELINE_SETTINGS_ENCRYPTION_KEY"
NONCE_BYTES = 12  # AES-GCM standard
KEY_BYTES = 32  # AES-256


class SettingsStoreError(RuntimeError):
    """Raised for settings store configuration errors (bad key, bad env)."""


def _load_encryption_key(raw: str | None = None) -> bytes:
    if raw is None:
        raw = os.environ.get(ENCRYPTION_KEY_ENV)
    if not raw:
        raise SettingsStoreError(
            f"{ENCRYPTION_KEY_ENV} is not set. Generate one with:\n"
            f"    openssl rand -base64 32\n"
            f"and add it to ~/.makeit-pipeline/.env"
        )
    try:
        key = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise SettingsStoreError(f"{ENCRYPTION_KEY_ENV} is not valid base64: {exc}") from exc
    if len(key) != KEY_BYTES:
        raise SettingsStoreError(
            f"{ENCRYPTION_KEY_ENV} must decode to {KEY_BYTES} bytes (AES-256), got {len(key)}"
        )
    return key


class SettingsStore:
    """Encrypted persistent storage for user-scoped secrets.

    Keys are stored in plaintext (needed for ``WHERE key = ?`` lookups).
    Values are AES-GCM encrypted with a fresh per-write 12-byte nonce.
    Multi-user is supported via the ``username`` column; today every caller
    passes ``"default"`` (see Task-02 — JWT claims will replace this).
    """

    def __init__(
        self,
        db_path: Path | None = None,
        encryption_key: bytes | None = None,
    ) -> None:
        self._db_path = db_path or DEFAULT_DB_PATH
        parent = self._db_path.parent
        parent.mkdir(parents=True, exist_ok=True)
        # Tighten parent dir to owner-only (best-effort: chmod silently
        # ignored on filesystems that do not support POSIX modes).
        with contextlib.suppress(OSError):
            os.chmod(parent, 0o700)
        if encryption_key is None:
            encryption_key = _load_encryption_key()
        elif len(encryption_key) != KEY_BYTES:
            raise SettingsStoreError(
                f"encryption_key must be {KEY_BYTES} bytes, got {len(encryption_key)}"
            )
        self._aesgcm = AESGCM(encryption_key)
        self._init_schema()
        # The DB file is created lazily by sqlite on first ``connect``;
        # _init_schema has just done that, so tighten its mode now.
        with contextlib.suppress(OSError):
            os.chmod(self._db_path, 0o600)

    @staticmethod
    def _aad(username: str, key: str) -> bytes:
        """AES-GCM additional authenticated data — binds ciphertext to row.

        ``|`` is not a valid byte sequence inside well-formed UTF-8 codepoints
        of the surrounding identifiers but appears literally as a separator;
        moving (username, key) across rows changes the AAD and triggers
        ``InvalidTag`` on decrypt. Cheap defense-in-depth against a DB-write
        attacker who can read the row layout but not the master key.
        """
        return f"{username}|{key}".encode()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def _init_schema(self) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_settings (
                    username TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value_encrypted BLOB NOT NULL,
                    nonce BLOB NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (username, key)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_settings_username ON user_settings(username)"
            )

    def get(self, username: str, key: str) -> str | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT value_encrypted, nonce FROM user_settings WHERE username = ? AND key = ?",
                (username, key),
            ).fetchone()
        if row is None:
            return None
        ciphertext, nonce = row
        plaintext = self._aesgcm.decrypt(nonce, ciphertext, self._aad(username, key))
        return plaintext.decode("utf-8")

    def get_all(self, username: str) -> dict[str, str]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT key, value_encrypted, nonce FROM user_settings WHERE username = ?",
                (username,),
            ).fetchall()
        return {
            row_key: self._aesgcm.decrypt(nonce, ciphertext, self._aad(username, row_key)).decode(
                "utf-8"
            )
            for row_key, ciphertext, nonce in rows
        }

    def list_keys(self, username: str) -> list[str]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT key FROM user_settings WHERE username = ? ORDER BY key",
                (username,),
            ).fetchall()
        return [row[0] for row in rows]

    def put(self, username: str, key: str, value: str) -> None:
        nonce = secrets.token_bytes(NONCE_BYTES)
        ciphertext = self._aesgcm.encrypt(nonce, value.encode("utf-8"), self._aad(username, key))
        now = datetime.now(UTC).isoformat()
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                INSERT INTO user_settings (username, key, value_encrypted, nonce, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(username, key) DO UPDATE SET
                    value_encrypted = excluded.value_encrypted,
                    nonce = excluded.nonce,
                    updated_at = excluded.updated_at
                """,
                (username, key, ciphertext, nonce, now),
            )

    def delete(self, username: str, key: str) -> bool:
        with closing(self._connect()) as conn, conn:
            cur = conn.execute(
                "DELETE FROM user_settings WHERE username = ? AND key = ?",
                (username, key),
            )
            return cur.rowcount > 0
