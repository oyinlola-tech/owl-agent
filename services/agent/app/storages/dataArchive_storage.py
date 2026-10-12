from __future__ import annotations

import base64
import binascii
import json
import os
import re
import sqlite3
import zipfile

from ..databases.databaseBackup_database import (
    BACKUP_TIME_FORMAT,
    check_database_integrity,
    create_database_backup,
    make_file_private,
)
from ..databases.databaseMigration_database import (
    apply_pending_migrations,
    find_latest_schema_version,
    read_current_schema_version,
)
from ..databases.recordStamp_database import current_utc_time
from .storageBootstrap_storage import LocalStorage

EXPORT_FORMAT = "owl-export"
EXPORT_VERSION = 1
EXPORT_DATABASE_NAME = "owl.db"
EXPORT_MANIFEST_NAME = "manifest.json"
KEEP_EXPORT_FILES = 5
MAX_IMPORT_MEMBERS = 5000
MAX_IMPORT_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024
SCREENSHOT_MEMBER_PATTERN = re.compile(r"^screenshots/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")
SECRET_COLUMN_PATTERN = re.compile(
    r"(api_?key|secret|password|passwd|credential|private_key|(^|_)token$)", re.I
)
SECRET_TABLE_PATTERN = re.compile(r"(api_?key|secret|credential|keyring)", re.I)


class DataArchiveError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


def snapshot_live_database(storage: LocalStorage, target: str) -> None:
    with storage.lock:
        storage.conn.commit()
        dest = sqlite3.connect(target)
        try:
            storage.conn.backup(dest)
        finally:
            dest.close()
    make_file_private(target)


def blank_value_for_column(column: sqlite3.Row | tuple) -> str:
    declared_type = str(column[2] or "").upper()
    if not column[3]:
        return "NULL"
    return "0" if "INT" in declared_type or "REAL" in declared_type else "''"


def remove_secrets_from_snapshot(path: str) -> list[str]:
    # Security: an export is meant to be shared or moved; API keys, tokens and credentials
    # never leave the machine this way, even if some table ends up holding one.
    scrubbed: list[str] = []
    conn = sqlite3.connect(path)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        ]
        for table in tables:
            if SECRET_TABLE_PATTERN.search(table):
                conn.execute(f'DELETE FROM "{table}"')
                scrubbed.append(table)
                continue
            for column in conn.execute(f'PRAGMA table_info("{table}")').fetchall():
                if SECRET_COLUMN_PATTERN.search(column[1]):
                    blank = blank_value_for_column(column)
                    conn.execute(f'UPDATE "{table}" SET "{column[1]}" = {blank}')
                    scrubbed.append(f"{table}.{column[1]}")
        conn.commit()
        conn.execute("VACUUM")
    finally:
        conn.close()
    return scrubbed


def prune_old_exports(exports_dir: str) -> None:
    names = sorted(
        (n for n in os.listdir(exports_dir) if n.startswith("owl-export-") and n.endswith(".zip")),
        reverse=True,
    )
    for name in names[KEEP_EXPORT_FILES:]:
        try:
            os.remove(os.path.join(exports_dir, name))
        except OSError:
            pass


def export_local_data(storage: LocalStorage) -> dict:
    exports_dir = storage.layout.exports_dir
    os.makedirs(exports_dir, mode=0o700, exist_ok=True)
    stamp = current_utc_time().strftime(BACKUP_TIME_FORMAT)
    snapshot = os.path.join(exports_dir, f".snapshot-{stamp}.db")
    name = f"owl-export-{stamp}.zip"
    target = os.path.join(exports_dir, name)
    try:
        snapshot_live_database(storage, snapshot)
        remove_secrets_from_snapshot(snapshot)
        conn = sqlite3.connect(snapshot)
        schema_version = read_current_schema_version(conn)
        conn.close()
        screenshots = []
        if os.path.isdir(storage.layout.screenshots_dir):
            screenshots = sorted(os.listdir(storage.layout.screenshots_dir))
        manifest = {
            "format": EXPORT_FORMAT,
            "version": EXPORT_VERSION,
            "schema_version": schema_version,
            "created_at": current_utc_time().isoformat(),
            "contains_secrets": False,
        }
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(EXPORT_MANIFEST_NAME, json.dumps(manifest, indent=2))
            archive.write(snapshot, EXPORT_DATABASE_NAME)
            for shot in screenshots:
                member = f"screenshots/{shot}"
                full = os.path.join(storage.layout.screenshots_dir, shot)
                if SCREENSHOT_MEMBER_PATTERN.match(member) and os.path.isfile(full):
                    archive.write(full, member)
    finally:
        if os.path.exists(snapshot):
            os.remove(snapshot)
    make_file_private(target)
    prune_old_exports(exports_dir)
    return {"name": name, "path": target, "bytes": os.path.getsize(target)}


def write_base64_archive(storage: LocalStorage, encoded: str) -> str:
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise DataArchiveError("invalid_archive", "archive_base64 is not valid base64") from exc
    stamp = current_utc_time().strftime(BACKUP_TIME_FORMAT)
    path = os.path.join(storage.layout.exports_dir, f".upload-{stamp}.zip")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(raw)
    return path


def validate_archive_members(archive: zipfile.ZipFile) -> dict:
    # Security: an archive is untrusted input; only the expected members are read, never
    # extracted by name, so "../" or absolute member names can't write outside the data dir.
    infos = archive.infolist()
    if len(infos) > MAX_IMPORT_MEMBERS:
        raise DataArchiveError("invalid_archive", "archive has too many entries")
    if sum(i.file_size for i in infos) > MAX_IMPORT_UNCOMPRESSED_BYTES:
        raise DataArchiveError("invalid_archive", "archive is too large")
    names = {i.filename for i in infos}
    if EXPORT_MANIFEST_NAME not in names or EXPORT_DATABASE_NAME not in names:
        raise DataArchiveError("invalid_archive", "archive is not an OWL export")
    for name in names - {EXPORT_MANIFEST_NAME, EXPORT_DATABASE_NAME}:
        if not SCREENSHOT_MEMBER_PATTERN.match(name):
            raise DataArchiveError("invalid_archive", "archive contains unexpected files")
    try:
        manifest = json.loads(archive.read(EXPORT_MANIFEST_NAME).decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise DataArchiveError("invalid_archive", "manifest is not valid JSON") from exc
    if not isinstance(manifest, dict) or manifest.get("format") != EXPORT_FORMAT:
        raise DataArchiveError("invalid_archive", "archive is not an OWL export")
    if manifest.get("version") != EXPORT_VERSION:
        raise DataArchiveError("unsupported_version", "this export version isn't supported")
    return manifest


def extract_and_check_database(storage: LocalStorage, archive: zipfile.ZipFile) -> str:
    stamp = current_utc_time().strftime(BACKUP_TIME_FORMAT)
    path = os.path.join(storage.layout.exports_dir, f".import-{stamp}.db")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as out, archive.open(EXPORT_DATABASE_NAME) as src:
        while chunk := src.read(1024 * 1024):
            out.write(chunk)
    ok, detail = check_database_integrity(path)
    if not ok:
        os.remove(path)
        raise DataArchiveError("invalid_database", f"the exported database is damaged: {detail}")
    conn = sqlite3.connect(path)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        version = read_current_schema_version(conn)
    finally:
        conn.close()
    if "tasks" not in tables:
        os.remove(path)
        raise DataArchiveError("invalid_database", "the archive database has no OWL tables")
    if version > find_latest_schema_version():
        os.remove(path)
        raise DataArchiveError(
            "newer_schema", "this export comes from a newer OWL; update OWL first"
        )
    return path


def replace_screenshots_from_archive(storage: LocalStorage, archive: zipfile.ZipFile) -> int:
    folder = storage.layout.screenshots_dir
    os.makedirs(folder, mode=0o700, exist_ok=True)
    count = 0
    for info in archive.infolist():
        if not SCREENSHOT_MEMBER_PATTERN.match(info.filename):
            continue
        target = os.path.join(folder, os.path.basename(info.filename))
        with archive.open(info) as src, open(target, "wb") as out:
            out.write(src.read())
        make_file_private(target)
        count += 1
    return count


def import_local_data(storage: LocalStorage, archive_path: str) -> dict:
    if not os.path.isfile(archive_path) or not zipfile.is_zipfile(archive_path):
        raise DataArchiveError("invalid_archive", "the file is not a zip archive")
    with zipfile.ZipFile(archive_path) as archive:
        manifest = validate_archive_members(archive)
        imported_db = extract_and_check_database(storage, archive)
        try:
            backup = None
            if not storage.in_memory:
                backup = create_database_backup(
                    storage.layout.database_path, storage.layout.backups_dir, "pre-import"
                )
            with storage.lock:
                storage.conn.commit()
                source = sqlite3.connect(imported_db)
                try:
                    source.backup(storage.conn)
                finally:
                    source.close()
                if not storage.in_memory:
                    storage.conn.execute("PRAGMA journal_mode=WAL")
                storage.conn.execute("PRAGMA foreign_keys=ON")
                apply_pending_migrations(storage.conn)
        finally:
            os.remove(imported_db)
        screenshots = replace_screenshots_from_archive(storage, archive)
    return {
        "imported": True,
        "backup": backup,
        "schema_version": read_current_schema_version(storage.conn),
        "exported_at": str(manifest.get("created_at", "")),
        "screenshots": screenshots,
    }
