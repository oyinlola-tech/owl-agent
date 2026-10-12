import os
import sqlite3

import pytest

from app.databases import databaseMigration_database as migrations
from app.databases.databaseConnection_database import open_database
from app.databases.databaseMigration_database import (
    find_latest_schema_version,
    read_current_schema_version,
)
from app.databases.databaseSchema_database import DATABASE_SCHEMA_SQL
from app.storages.storageBootstrap_storage import prepare_local_storage


def build_pre_migration_database(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(DATABASE_SCHEMA_SQL)
    conn.execute(
        "INSERT INTO tasks (id, prompt, status, created_at, updated_at)"
        " VALUES ('task-1', 'keep me', 'completed', 'x', 'x')"
    )
    conn.execute(
        "INSERT INTO approvals (id, task_id, title, kind, created_at)"
        " VALUES ('ap-1', 'task-1', 't', 'exec', 'x')"
    )
    conn.commit()
    conn.close()


def read_columns(conn, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def test_fresh_database_records_every_migration_in_order():
    conn = open_database(":memory:")
    versions = [r[0] for r in conn.execute("SELECT version FROM schema_migrations ORDER BY 1")]
    assert versions == list(range(1, find_latest_schema_version() + 1))
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000


def test_old_database_gets_columns_and_keeps_rows(tmp_path):
    path = str(tmp_path / "old.db")
    build_pre_migration_database(path)
    conn = open_database(path)
    assert {"action", "args_hash", "network", "sandboxed"} <= read_columns(conn, "approvals")
    assert {"workspace", "verification_note", "reverify_after"} <= read_columns(conn, "tasks")
    assert {"source", "project_id"} <= read_columns(conn, "change_journal")
    assert {"projects", "command_runs", "user_profile", "provider_settings"} <= {
        r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert conn.execute("SELECT prompt FROM tasks").fetchone()[0] == "keep me"
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert read_current_schema_version(conn) == find_latest_schema_version()
    conn.close()
    reopened = open_database(path)
    assert reopened.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0] == len(
        migrations.SCHEMA_MIGRATIONS
    )
    reopened.close()


def test_old_database_is_backed_up_before_migrating(tmp_path):
    root = tmp_path / "root"
    build_pre_migration_database(str(root / "data" / "owl.db"))
    storage = prepare_local_storage(data_dir=str(root))
    backup = next(n for n in os.listdir(root / "backups") if n.endswith("pre-migration.db"))
    old = sqlite3.connect(str(root / "backups" / backup))
    assert "schema_migrations" not in {
        r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    old.close()
    storage.conn.close()


def test_fresh_database_is_not_backed_up_before_migrating(tmp_path):
    storage = prepare_local_storage(data_dir=str(tmp_path / "root"))
    names = os.listdir(tmp_path / "root" / "backups")
    assert not any(n.endswith("pre-migration.db") for n in names)
    storage.conn.close()


def test_failed_migration_rolls_back_and_is_not_recorded(tmp_path, monkeypatch):
    path = str(tmp_path / "fail.db")
    open_database(path).close()
    latest = find_latest_schema_version()

    def break_halfway(conn):
        conn.execute("CREATE TABLE half_done (id INTEGER)")
        raise RuntimeError("boom")

    broken = migrations.SchemaMigration(99, "broken", break_halfway)
    monkeypatch.setattr(migrations, "SCHEMA_MIGRATIONS", (*migrations.SCHEMA_MIGRATIONS, broken))
    with pytest.raises(RuntimeError):
        open_database(path)
    conn = sqlite3.connect(path)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "half_done" not in tables
    assert conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0] == latest
    conn.close()
