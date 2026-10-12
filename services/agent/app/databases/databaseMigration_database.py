from __future__ import annotations

import sqlite3
from collections.abc import Callable
from dataclasses import dataclass

from .databaseSchema_database import DATABASE_SCHEMA_SQL
from .recordStamp_database import current_utc_time

MIGRATION_TABLE_SQL = (
    "CREATE TABLE IF NOT EXISTS schema_migrations ("
    " version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
)

PROJECT_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    stack TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT
);
CREATE TABLE IF NOT EXISTS command_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    argv_json TEXT NOT NULL DEFAULT '[]',
    cwd TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    exit_code INTEGER,
    risk TEXT NOT NULL DEFAULT 'ok',
    risk_reason TEXT NOT NULL DEFAULT '',
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    truncated INTEGER NOT NULL DEFAULT 0,
    sandboxed INTEGER,
    sandbox_backend TEXT NOT NULL DEFAULT '',
    network INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_command_runs_project ON command_runs(project_id, started_at);
"""


@dataclass(frozen=True)
class SchemaMigration:
    version: int
    name: str
    apply: Callable[[sqlite3.Connection], None]


def split_sql_statements(script: str) -> list[str]:
    statements: list[str] = []
    buffer = ""
    for line in script.splitlines(keepends=True):
        buffer += line
        if sqlite3.complete_statement(buffer):
            statements.append(buffer.strip())
            buffer = ""
    return [s for s in statements if s]


def run_sql_script_inside_transaction(conn: sqlite3.Connection, script: str) -> None:
    for statement in split_sql_statements(script):
        conn.execute(statement)


def read_column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def add_columns_when_missing(
    conn: sqlite3.Connection, table: str, columns: tuple[tuple[str, str], ...]
) -> None:
    existing = read_column_names(conn, table)
    if not existing:
        return
    for name, ddl in columns:
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def create_baseline_tables(conn: sqlite3.Connection) -> None:
    run_sql_script_inside_transaction(conn, DATABASE_SCHEMA_SQL)


def add_missing_columns(conn: sqlite3.Connection) -> None:
    add_columns_when_missing(
        conn,
        "approvals",
        (
            ("action", "TEXT NOT NULL DEFAULT ''"),
            ("args_hash", "TEXT NOT NULL DEFAULT ''"),
            ("scope", "TEXT NOT NULL DEFAULT 'once'"),
            ("targets", "TEXT NOT NULL DEFAULT '[]'"),
            ("expires_at", "TEXT"),
            ("consumed_at", "TEXT"),
            ("network", "INTEGER NOT NULL DEFAULT 0"),
            ("sandboxed", "INTEGER"),
        ),
    )
    add_columns_when_missing(
        conn,
        "tasks",
        (
            ("iterations", "INTEGER NOT NULL DEFAULT 0"),
            ("model_calls", "INTEGER NOT NULL DEFAULT 0"),
            ("workspace", "TEXT NOT NULL DEFAULT ''"),
            ("verification_plan", "TEXT NOT NULL DEFAULT '[]'"),
            ("verification_attempts", "INTEGER NOT NULL DEFAULT 0"),
            ("verification_note", "TEXT NOT NULL DEFAULT ''"),
            ("verified_at", "TEXT"),
            ("reverify_after", "TEXT"),
        ),
    )
    add_columns_when_missing(conn, "verification_runs", (("pid", "INTEGER"),))
    for table in ("tool_calls", "verification_runs"):
        add_columns_when_missing(
            conn,
            table,
            (("sandboxed", "INTEGER"), ("sandbox_backend", "TEXT NOT NULL DEFAULT ''")),
        )


def add_project_tables(conn: sqlite3.Connection) -> None:
    run_sql_script_inside_transaction(conn, PROJECT_TABLES_SQL)
    add_columns_when_missing(
        conn,
        "change_journal",
        (("source", "TEXT NOT NULL DEFAULT 'agent'"), ("project_id", "TEXT NOT NULL DEFAULT ''")),
    )


def add_profile_and_provider_tables(conn: sqlite3.Connection) -> None:
    from ..llms.connections.providerConfig_connection import PROVIDER_SCHEMA_SQL
    from ..memories.promptKnowledge_memory import KNOWLEDGE_SCHEMA_SQL
    from ..memories.userProfile_memory import PROFILE_SCHEMA_SQL

    for script in (PROFILE_SCHEMA_SQL, PROVIDER_SCHEMA_SQL, KNOWLEDGE_SCHEMA_SQL):
        run_sql_script_inside_transaction(conn, script)


SCHEMA_MIGRATIONS: tuple[SchemaMigration, ...] = (
    SchemaMigration(1, "baseline tables", create_baseline_tables),
    SchemaMigration(2, "approval, task and sandbox columns", add_missing_columns),
    SchemaMigration(3, "projects, user commands and journal source", add_project_tables),
    SchemaMigration(
        4, "profile, onboarding, provider settings and memory uses", add_profile_and_provider_tables
    ),
)


def find_latest_schema_version() -> int:
    return max(m.version for m in SCHEMA_MIGRATIONS)


def read_applied_schema_versions(conn: sqlite3.Connection) -> set[int]:
    exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
    ).fetchone()
    if exists is None:
        return set()
    return {int(r[0]) for r in conn.execute("SELECT version FROM schema_migrations").fetchall()}


def read_current_schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
    ).fetchone()
    if row is None:
        return 0
    value = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
    return int(value or 0)


def database_has_user_tables(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'"
        " AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'"
    ).fetchone()
    return bool(row[0])


def list_pending_migrations(conn: sqlite3.Connection) -> list[SchemaMigration]:
    applied = read_applied_schema_versions(conn)
    return [m for m in SCHEMA_MIGRATIONS if m.version not in applied]


def apply_pending_migrations(
    conn: sqlite3.Connection, before_first_migration: Callable[[], None] | None = None
) -> list[int]:
    had_tables = database_has_user_tables(conn)
    pending = list_pending_migrations(conn)
    if pending and had_tables and before_first_migration is not None:
        before_first_migration()
    conn.execute(MIGRATION_TABLE_SQL)
    conn.commit()
    applied: list[int] = []
    for migration in pending:
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")
        try:
            migration.apply(conn)
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (migration.version, migration.name, current_utc_time().isoformat()),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        applied.append(migration.version)
    conn.executescript(DATABASE_SCHEMA_SQL)
    conn.commit()
    return applied
