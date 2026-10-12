from __future__ import annotations

import os

from ..databases.databaseBackup_database import (
    KEEP_DAILY_BACKUPS,
    KEEP_EVENT_BACKUPS,
    KEEP_WEEKLY_BACKUPS,
    create_database_backup,
    list_database_backups,
)
from ..databases.databaseMigration_database import (
    find_latest_schema_version,
    read_current_schema_version,
)
from .storageBootstrap_storage import LocalStorage

RESET_CONFIRMATION_PHRASE = "RESET"
TABLES_KEPT_ON_RESET = frozenset(
    {"schema_migrations", "models", "provider_settings", "provider_preferences"}
)
COUNTED_TABLES = ("tasks", "projects", "memories", "command_runs", "usage_records")


def describe_backup_for_client(backup: dict | None) -> dict | None:
    if backup is None:
        return None
    return {k: backup[k] for k in ("name", "kind", "created_at", "bytes")}


def count_rows_in_known_tables(storage: LocalStorage) -> dict[str, int]:
    existing = {
        r[0] for r in storage.conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    return {
        table: int(storage.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        for table in COUNTED_TABLES
        if table in existing
    }


def read_data_status(storage: LocalStorage) -> dict:
    layout = storage.layout
    backups = list_database_backups(layout.backups_dir)
    database_bytes = 0
    if not storage.in_memory:
        for suffix in ("", "-wal"):
            if os.path.isfile(layout.database_path + suffix):
                database_bytes += os.path.getsize(layout.database_path + suffix)
    with storage.lock:
        journal_mode = str(storage.conn.execute("PRAGMA journal_mode").fetchone()[0])
        foreign_keys = bool(storage.conn.execute("PRAGMA foreign_keys").fetchone()[0])
        schema_version = read_current_schema_version(storage.conn)
        counts = count_rows_in_known_tables(storage)
    return {
        "data_dir": layout.root,
        "data_dir_overridden": layout.overridden,
        "database_path": layout.database_path,
        "database_bytes": database_bytes,
        "directories": {
            "data": layout.data_dir,
            "screenshots": layout.screenshots_dir,
            "backups": layout.backups_dir,
            "logs": layout.logs_dir,
            "exports": layout.exports_dir,
            "cache": layout.cache_dir,
        },
        "schema_version": schema_version,
        "latest_schema_version": find_latest_schema_version(),
        "journal_mode": journal_mode,
        "foreign_keys": foreign_keys,
        "integrity": storage.integrity,
        "restore": storage.restore,
        "migrated_from": storage.migrated_from,
        "notices": list(storage.notices),
        "log_file": storage.log_file,
        "backups": [describe_backup_for_client(b) for b in backups],
        "last_backup_at": backups[0]["created_at"] if backups else None,
        "backup_policy": {
            "daily": KEEP_DAILY_BACKUPS,
            "weekly": KEEP_WEEKLY_BACKUPS,
            "event": KEEP_EVENT_BACKUPS,
        },
        "counts": counts,
    }


def create_backup_now(storage: LocalStorage, kind: str = "manual") -> dict:
    with storage.lock:
        storage.conn.commit()
        return create_database_backup(
            storage.layout.database_path, storage.layout.backups_dir, kind
        )


def remove_screenshot_files(folder: str) -> int:
    if not os.path.isdir(folder):
        return 0
    removed = 0
    for name in os.listdir(folder):
        path = os.path.join(folder, name)
        if os.path.isfile(path) and not os.path.islink(path):
            os.remove(path)
            removed += 1
    return removed


def reset_local_data(storage: LocalStorage) -> dict:
    backup = None if storage.in_memory else create_backup_now(storage, "pre-reset")
    cleared: dict[str, int] = {}
    with storage.lock:
        conn = storage.conn
        conn.commit()
        conn.execute("PRAGMA foreign_keys=OFF")
        try:
            tables = [
                r[0]
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                    " AND name NOT LIKE 'sqlite_%'"
                ).fetchall()
            ]
            for table in tables:
                if table in TABLES_KEPT_ON_RESET:
                    continue
                cleared[table] = conn.execute(f'DELETE FROM "{table}"').rowcount
            if conn.execute(
                "SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'"
            ).fetchone():
                conn.execute("DELETE FROM sqlite_sequence")
            conn.commit()
        finally:
            conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("VACUUM")
    screenshots = remove_screenshot_files(storage.layout.screenshots_dir)
    return {
        "reset": True,
        "backup": describe_backup_for_client(backup),
        "cleared_rows": cleared,
        "screenshots_removed": screenshots,
    }
