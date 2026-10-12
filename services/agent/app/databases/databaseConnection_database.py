from __future__ import annotations

import os
import sqlite3

from .databaseSchema_database import DATABASE_SCHEMA_SQL


def get_default_database_path() -> str:
    base = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
    return os.path.join(base, "owl-agent", "owl.db")


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


def open_database(path: str | None = None) -> sqlite3.Connection:
    target = path or get_default_database_path()
    if target != ":memory:":
        folder = os.path.dirname(os.path.abspath(target))
        os.makedirs(folder, mode=0o700, exist_ok=True)
        restrict_private_permissions(folder, 0o700)
    conn = sqlite3.connect(target, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(DATABASE_SCHEMA_SQL)
    add_missing_columns(conn)
    if target != ":memory:":
        for suffix in ("", "-wal", "-shm"):
            restrict_private_permissions(target + suffix, 0o600)
    return conn


def get_database_folder(conn: sqlite3.Connection) -> str:
    rows = conn.execute("PRAGMA database_list").fetchall()
    for row in rows:
        if row[1] == "main" and row[2]:
            return os.path.dirname(os.path.abspath(row[2]))
    return os.path.join(os.path.expanduser("~"), ".local", "share", "owl-agent")


def add_missing_columns(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(approvals)").fetchall()}
    for name, ddl in (
        ("action", "TEXT NOT NULL DEFAULT ''"),
        ("args_hash", "TEXT NOT NULL DEFAULT ''"),
        ("scope", "TEXT NOT NULL DEFAULT 'once'"),
        ("targets", "TEXT NOT NULL DEFAULT '[]'"),
        ("expires_at", "TEXT"),
        ("consumed_at", "TEXT"),
        ("network", "INTEGER NOT NULL DEFAULT 0"),
        ("sandboxed", "INTEGER"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE approvals ADD COLUMN {name} {ddl}")
    tcols = {r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    for name, ddl in (
        ("iterations", "INTEGER NOT NULL DEFAULT 0"),
        ("model_calls", "INTEGER NOT NULL DEFAULT 0"),
        ("workspace", "TEXT NOT NULL DEFAULT ''"),
        ("verification_plan", "TEXT NOT NULL DEFAULT '[]'"),
        ("verification_attempts", "INTEGER NOT NULL DEFAULT 0"),
        ("verification_note", "TEXT NOT NULL DEFAULT ''"),
        ("verified_at", "TEXT"),
        ("reverify_after", "TEXT"),
    ):
        if name not in tcols:
            conn.execute(f"ALTER TABLE tasks ADD COLUMN {name} {ddl}")
    vcols = {r[1] for r in conn.execute("PRAGMA table_info(verification_runs)").fetchall()}
    if vcols and "pid" not in vcols:
        conn.execute("ALTER TABLE verification_runs ADD COLUMN pid INTEGER")
    for table in ("tool_calls", "verification_runs"):
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for name, ddl in (
            ("sandboxed", "INTEGER"),
            ("sandbox_backend", "TEXT NOT NULL DEFAULT ''"),
        ):
            if cols and name not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    conn.commit()
