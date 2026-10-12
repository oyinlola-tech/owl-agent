from __future__ import annotations

import os
import sqlite3
from collections.abc import Callable

from ..settings.dataDirectory_setting import resolve_data_layout
from .databaseMigration_database import apply_pending_migrations

BUSY_TIMEOUT_MILLISECONDS = 5000


def get_default_database_path() -> str:
    return resolve_data_layout().database_path


def restrict_private_permissions(path: str, mode: int) -> None:
    # Security: the data folder holds task history, tokens, and screenshots; on POSIX only
    # the owner may read it. Folders we don't own (e.g. a shared /tmp) are left alone.
    if os.name != "posix" or not os.path.exists(path):
        return
    try:
        if os.stat(path).st_uid == os.getuid():
            os.chmod(path, mode)
    except OSError:
        pass


def configure_connection_pragmas(conn: sqlite3.Connection, in_memory: bool) -> None:
    if not in_memory:
        conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MILLISECONDS}")


def restrict_database_file_permissions(target: str) -> None:
    for suffix in ("", "-wal", "-shm"):
        restrict_private_permissions(target + suffix, 0o600)


def open_database(
    path: str | None = None, before_migrations: Callable[[], None] | None = None
) -> sqlite3.Connection:
    target = path or get_default_database_path()
    in_memory = target == ":memory:"
    if not in_memory:
        folder = os.path.dirname(os.path.abspath(target))
        os.makedirs(folder, mode=0o700, exist_ok=True)
        restrict_private_permissions(folder, 0o700)
    conn = sqlite3.connect(target, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    configure_connection_pragmas(conn, in_memory)
    apply_pending_migrations(conn, before_migrations)
    if not in_memory:
        restrict_database_file_permissions(target)
    return conn


def get_database_file_path(conn: sqlite3.Connection) -> str:
    for row in conn.execute("PRAGMA database_list").fetchall():
        if row[1] == "main" and row[2]:
            return os.path.abspath(row[2])
    return ""


def get_database_folder(conn: sqlite3.Connection) -> str:
    path = get_database_file_path(conn)
    return os.path.dirname(path) if path else resolve_data_layout().root
