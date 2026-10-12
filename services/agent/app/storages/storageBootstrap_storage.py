from __future__ import annotations

import logging
import os
import sqlite3
import threading
import weakref
from dataclasses import dataclass, field

from ..databases.databaseBackup_database import (
    DatabaseBackupError,
    check_database_integrity,
    copy_database_with_backup_api,
    create_daily_backup_if_due,
    create_database_backup,
    restore_newest_good_backup,
)
from ..databases.databaseConnection_database import open_database, restrict_private_permissions
from ..settings.dataDirectory_setting import (
    DataLayout,
    list_legacy_database_candidates,
    resolve_data_layout,
)
from .logFile_storage import install_rotating_log_file

log = logging.getLogger("owl")
DAILY_BACKUP_CHECK_SECONDS = 3600.0
WATCHED_STORAGES: weakref.WeakSet = weakref.WeakSet()
TIMER_STARTED = threading.Event()


@dataclass(eq=False)
class LocalStorage:
    layout: DataLayout
    conn: sqlite3.Connection
    migrated_from: str = ""
    integrity: str = "ok"
    restore: dict | None = None
    notices: list[str] = field(default_factory=list)
    log_file: str = ""
    lock: threading.RLock = field(default_factory=threading.RLock)

    @property
    def in_memory(self) -> bool:
        return self.layout.database_path == ":memory:"


def create_private_data_folders(layout: DataLayout) -> None:
    for folder in layout.list_private_folders():
        os.makedirs(folder, mode=0o700, exist_ok=True)
        restrict_private_permissions(folder, 0o700)


def migrate_legacy_database_if_needed(layout: DataLayout) -> str:
    if layout.database_path == ":memory:" or os.path.exists(layout.database_path):
        return ""
    for candidate in list_legacy_database_candidates(layout):
        if not os.path.isfile(candidate):
            continue
        ok, detail = check_database_integrity(candidate)
        if not ok:
            log.warning("legacy database %s skipped: %s", candidate, detail)
            continue
        copy_database_with_backup_api(candidate, layout.database_path)
        log.info("migrated database from %s to %s (old file kept)", candidate, layout.database_path)
        return candidate
    return ""


def check_and_repair_database(layout: DataLayout) -> tuple[str, dict | None, list[str]]:
    if layout.database_path == ":memory:" or not os.path.exists(layout.database_path):
        return "ok", None, []
    ok, detail = check_database_integrity(layout.database_path)
    if ok:
        return "ok", None, []
    log.error("database integrity check failed: %s", detail)
    restore = restore_newest_good_backup(layout.database_path, layout.backups_dir)
    if restore["restored"]:
        notice = (
            f"OWL's database was damaged, so it was restored from backup {restore['backup']}. "
            f"The damaged file was kept at {restore['damaged_file']}."
        )
    else:
        notice = (
            "OWL's database was damaged and no good backup was found, so OWL started with an "
            f"empty database. The damaged file was kept at {restore['damaged_file']}."
        )
    log.error(notice)
    return "failed", restore, [notice]


def create_backup_before_migrations(layout: DataLayout):  # type: ignore[no-untyped-def]
    def back_up_before_migrating() -> None:
        try:
            create_database_backup(layout.database_path, layout.backups_dir, "pre-migration")
        except DatabaseBackupError as exc:
            log.warning("pre-migration backup failed: %s", exc)

    return back_up_before_migrating


def run_daily_backup_check(storage: LocalStorage) -> None:
    if storage.in_memory:
        return
    try:
        with storage.lock:
            created = create_daily_backup_if_due(
                storage.layout.database_path, storage.layout.backups_dir
            )
        if created:
            log.info("daily backup written: %s", created["name"])
    except DatabaseBackupError as exc:
        log.warning("daily backup failed: %s", exc)


def check_watched_storages_every_hour() -> None:
    while not threading.Event().wait(DAILY_BACKUP_CHECK_SECONDS):
        for storage in list(WATCHED_STORAGES):
            run_daily_backup_check(storage)


def start_daily_backup_timer(storage: LocalStorage) -> None:
    WATCHED_STORAGES.add(storage)
    if TIMER_STARTED.is_set():
        return
    TIMER_STARTED.set()
    threading.Thread(
        target=check_watched_storages_every_hour, name="owl-daily-backup", daemon=True
    ).start()


def prepare_local_storage(data_dir: str = "", db_path: str = "") -> LocalStorage:
    layout = resolve_data_layout(data_dir, db_path)
    create_private_data_folders(layout)
    log_file = install_rotating_log_file(layout.logs_dir)
    migrated_from = migrate_legacy_database_if_needed(layout)
    integrity, restore, notices = check_and_repair_database(layout)
    conn = open_database(layout.database_path, create_backup_before_migrations(layout))
    storage = LocalStorage(
        layout=layout,
        conn=conn,
        migrated_from=migrated_from,
        integrity=integrity,
        restore=restore,
        notices=notices,
        log_file=log_file,
    )
    if migrated_from:
        storage.notices.append(f"Your data was moved here from {migrated_from} (old file kept).")
    run_daily_backup_check(storage)
    if not storage.in_memory:
        start_daily_backup_timer(storage)
    return storage
