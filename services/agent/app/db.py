"""SQLite persistence. stdlib only; interface stays replaceable."""

from __future__ import annotations

import os
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    plan TEXT NOT NULL DEFAULT '[]',
    step_index INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    routing TEXT NOT NULL DEFAULT '',
    failure TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id);
CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    command TEXT,
    files TEXT NOT NULL DEFAULT '[]',
    reason TEXT NOT NULL DEFAULT '',
    risk TEXT NOT NULL DEFAULT 'Low',
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    label TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_cat ON memories(category, project);
CREATE TABLE IF NOT EXISTS memory_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL,
    action TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    requested_model TEXT NOT NULL DEFAULT '',
    routing_reason TEXT NOT NULL DEFAULT '',
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    estimated INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    retries INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS compressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL,
    before_tokens INTEGER NOT NULL,
    after_tokens INTEGER NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    context_window INTEGER,
    context_source TEXT NOT NULL DEFAULT '',
    capabilities TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'untested',
    last_seen TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    path TEXT NOT NULL,
    old_text TEXT NOT NULL,
    new_text TEXT NOT NULL,
    diff TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS change_journal (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    path TEXT NOT NULL,
    before_text TEXT NOT NULL,
    after_text TEXT NOT NULL,
    approval_id TEXT NOT NULL DEFAULT '',
    applied_at TEXT NOT NULL,
    reverted_at TEXT
);
CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    step INTEGER NOT NULL DEFAULT 0,
    tool TEXT NOT NULL,
    args_json TEXT NOT NULL DEFAULT '{}',
    approval_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ok',
    exit_code INTEGER,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    output_excerpt TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
"""


def default_db_path() -> str:
    base = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
    return os.path.join(base, "owl-agent", "owl.db")


def connect(path: str | None = None) -> sqlite3.Connection:
    target = path or default_db_path()
    if target != ":memory:":
        os.makedirs(os.path.dirname(target), exist_ok=True)
    conn = sqlite3.connect(target, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    _migrate(conn)
    return conn


def conn_path(conn: sqlite3.Connection) -> str:
    rows = conn.execute("PRAGMA database_list").fetchall()
    for row in rows:
        if row[1] == "main" and row[2]:
            return os.path.dirname(os.path.abspath(row[2]))
    return os.path.join(os.path.expanduser("~"), ".local", "share", "owl-agent")


def _migrate(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(approvals)").fetchall()}
    for name, ddl in (
        ("action", "TEXT NOT NULL DEFAULT ''"),
        ("args_hash", "TEXT NOT NULL DEFAULT ''"),
        ("scope", "TEXT NOT NULL DEFAULT 'once'"),
        ("targets", "TEXT NOT NULL DEFAULT '[]'"),
        ("expires_at", "TEXT"),
        ("consumed_at", "TEXT"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE approvals ADD COLUMN {name} {ddl}")
    tcols = {r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    for name, ddl in (
        ("iterations", "INTEGER NOT NULL DEFAULT 0"),
        ("model_calls", "INTEGER NOT NULL DEFAULT 0"),
        ("workspace", "TEXT NOT NULL DEFAULT ''"),
    ):
        if name not in tcols:
            conn.execute(f"ALTER TABLE tasks ADD COLUMN {name} {ddl}")
    conn.commit()
