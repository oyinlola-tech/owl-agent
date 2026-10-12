from __future__ import annotations

import os
import re
import sqlite3
from datetime import UTC, datetime

from .recordStamp_database import current_utc_time

BACKUP_FILE_PATTERN = re.compile(r"^owl-(\d{8}-\d{6}-\d{6})-([a-z-]+)\.db$")
BACKUP_TIME_FORMAT = "%Y%m%d-%H%M%S-%f"
DAILY_BACKUP_KIND = "daily"
EVENT_BACKUP_KINDS = ("manual", "pre-migration", "pre-import", "pre-reset", "pre-restore")
KEEP_DAILY_BACKUPS = 7
KEEP_WEEKLY_BACKUPS = 4
KEEP_EVENT_BACKUPS = 10


class DatabaseBackupError(Exception):
    pass


def make_file_private(path: str) -> None:
    # Security: backups hold the same task history as the live database, so only the owner
    # may read them.
    if os.name == "posix" and os.path.exists(path):
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass


def check_database_integrity(path: str) -> tuple[bool, str]:
    if not os.path.isfile(path):
        return False, "file does not exist"
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            rows = conn.execute("PRAGMA integrity_check").fetchall()
        finally:
            conn.close()
    except sqlite3.DatabaseError as exc:
        return False, str(exc)
    result = "; ".join(str(r[0]) for r in rows[:5])
    return result == "ok", result


def copy_database_with_backup_api(source_path: str, target_path: str) -> None:
    temporary = target_path + ".partial"
    if os.path.exists(temporary):
        os.remove(temporary)
    source = sqlite3.connect(source_path)
    try:
        target = sqlite3.connect(temporary)
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()
    make_file_private(temporary)
    os.replace(temporary, target_path)


def describe_backup_file(backups_dir: str, name: str) -> dict | None:
    match = BACKUP_FILE_PATTERN.match(name)
    if match is None:
        return None
    created = datetime.strptime(match.group(1), BACKUP_TIME_FORMAT).replace(tzinfo=UTC)
    path = os.path.join(backups_dir, name)
    return {
        "name": name,
        "kind": match.group(2),
        "created_at": created.isoformat(),
        "bytes": os.path.getsize(path) if os.path.isfile(path) else 0,
        "path": path,
    }


def list_database_backups(backups_dir: str) -> list[dict]:
    if not os.path.isdir(backups_dir):
        return []
    found = [describe_backup_file(backups_dir, name) for name in os.listdir(backups_dir)]
    return sorted((b for b in found if b), key=lambda b: b["name"][4:26], reverse=True)


def create_database_backup(
    database_path: str, backups_dir: str, kind: str, now: datetime | None = None
) -> dict:
    if kind != DAILY_BACKUP_KIND and kind not in EVENT_BACKUP_KINDS:
        raise DatabaseBackupError(f"unknown backup kind {kind}")
    if not os.path.isfile(database_path):
        raise DatabaseBackupError("database file does not exist")
    os.makedirs(backups_dir, mode=0o700, exist_ok=True)
    stamp = (now or current_utc_time()).strftime(BACKUP_TIME_FORMAT)
    name = f"owl-{stamp}-{kind}.db"
    try:
        copy_database_with_backup_api(database_path, os.path.join(backups_dir, name))
    except (sqlite3.Error, OSError) as exc:
        raise DatabaseBackupError(f"backup failed: {exc}") from exc
    rotate_database_backups(backups_dir)
    info = describe_backup_file(backups_dir, name)
    assert info is not None
    return info


def choose_daily_backups_to_keep(daily: list[dict]) -> set[str]:
    keep: set[str] = set()
    days: list[str] = []
    weeks: list[tuple[int, int]] = []
    for backup in daily:
        created = datetime.fromisoformat(backup["created_at"])
        day = created.date().isoformat()
        week = tuple(created.isocalendar()[:2])
        if day not in days and len(days) < KEEP_DAILY_BACKUPS:
            days.append(day)
            keep.add(backup["name"])
        if week not in weeks and len(weeks) < KEEP_WEEKLY_BACKUPS:
            weeks.append(week)
            keep.add(backup["name"])
    return keep


def rotate_database_backups(backups_dir: str) -> list[str]:
    backups = list_database_backups(backups_dir)
    daily = [b for b in backups if b["kind"] == DAILY_BACKUP_KIND]
    events = [b for b in backups if b["kind"] != DAILY_BACKUP_KIND]
    keep = choose_daily_backups_to_keep(daily) | {b["name"] for b in events[:KEEP_EVENT_BACKUPS]}
    removed = []
    for backup in backups:
        if backup["name"] not in keep:
            try:
                os.remove(backup["path"])
                removed.append(backup["name"])
            except OSError:
                pass
    return removed


def create_daily_backup_if_due(database_path: str, backups_dir: str) -> dict | None:
    if not os.path.isfile(database_path):
        return None
    today = current_utc_time().date().isoformat()
    for backup in list_database_backups(backups_dir):
        if backup["kind"] == DAILY_BACKUP_KIND and backup["created_at"][:10] == today:
            return None
    return create_database_backup(database_path, backups_dir, DAILY_BACKUP_KIND)


def set_aside_damaged_database(database_path: str) -> str:
    stamp = current_utc_time().strftime(BACKUP_TIME_FORMAT)
    kept = f"{database_path}.damaged-{stamp}"
    os.replace(database_path, kept)
    make_file_private(kept)
    for suffix in ("-wal", "-shm"):
        if os.path.exists(database_path + suffix):
            os.replace(database_path + suffix, kept + suffix)
    return kept


def restore_newest_good_backup(database_path: str, backups_dir: str) -> dict:
    kept = set_aside_damaged_database(database_path)
    for backup in list_database_backups(backups_dir):
        ok, _ = check_database_integrity(backup["path"])
        if ok:
            copy_database_with_backup_api(backup["path"], database_path)
            return {"restored": True, "backup": backup["name"], "damaged_file": kept}
    return {"restored": False, "backup": "", "damaged_file": kept}
