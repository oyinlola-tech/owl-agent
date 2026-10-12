import os
import sqlite3
from datetime import UTC, datetime, timedelta

from supports.projectClient_support import open_local_client

from app.databases.databaseBackup_database import (
    check_database_integrity,
    create_daily_backup_if_due,
    create_database_backup,
    list_database_backups,
    rotate_database_backups,
)
from app.storages.storageBootstrap_storage import prepare_local_storage


def make_database(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS t (v TEXT)")
    conn.execute("INSERT INTO t VALUES ('x')")
    conn.commit()
    conn.close()


def touch_backup(folder, when: datetime, kind: str = "daily") -> str:
    name = f"owl-{when.strftime('%Y%m%d-%H%M%S-%f')}-{kind}.db"
    (folder / name).write_bytes(b"x")
    return name


def test_rotation_keeps_seven_daily_and_four_weekly(tmp_path):
    folder = tmp_path / "backups"
    folder.mkdir()
    start = datetime(2026, 10, 12, 3, 0, tzinfo=UTC)
    names = [touch_backup(folder, start - timedelta(days=d)) for d in range(60)]
    extra_same_day = touch_backup(folder, start - timedelta(hours=1))
    rotate_database_backups(str(folder))
    kept = {b["name"] for b in list_database_backups(str(folder))}
    assert set(names[:7]) <= kept
    assert extra_same_day not in kept
    weekly = kept - set(names[:7])
    assert len(weekly) <= 4
    weeks = {
        tuple(datetime.fromisoformat(b["created_at"]).isocalendar()[:2])
        for b in list_database_backups(str(folder))
    }
    assert len(kept) <= 11
    assert len(weeks) >= 4


def test_event_backups_rotate_separately(tmp_path):
    folder = tmp_path / "backups"
    folder.mkdir()
    start = datetime(2026, 10, 12, tzinfo=UTC)
    for minute in range(15):
        touch_backup(folder, start - timedelta(minutes=minute), "manual")
    daily = touch_backup(folder, start, "daily")
    rotate_database_backups(str(folder))
    kept = list_database_backups(str(folder))
    assert len([b for b in kept if b["kind"] == "manual"]) == 10
    assert daily in {b["name"] for b in kept}


def test_daily_backup_is_written_at_most_once_a_day(tmp_path):
    db = str(tmp_path / "live.db")
    make_database(db)
    first = create_daily_backup_if_due(db, str(tmp_path / "b"))
    assert first is not None and first["kind"] == "daily"
    assert create_daily_backup_if_due(db, str(tmp_path / "b")) is None
    assert oct(os.stat(first["path"]).st_mode & 0o777) == "0o600"
    ok, _ = check_database_integrity(first["path"])
    assert ok


def corrupt_file(path: str) -> None:
    for suffix in ("-wal", "-shm"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    with open(path, "r+b") as fh:
        fh.write(b"this is not a sqlite database at all" * 4)


def test_damaged_database_is_restored_from_newest_good_backup(tmp_path):
    root = tmp_path / "root"
    storage = prepare_local_storage(data_dir=str(root))
    storage.conn.execute(
        "INSERT INTO tasks (id, prompt, status, created_at, updated_at)"
        " VALUES ('task-saved', 'p', 'completed', 'x', 'x')"
    )
    storage.conn.commit()
    create_database_backup(storage.layout.database_path, storage.layout.backups_dir, "manual")
    storage.conn.close()
    corrupt_file(storage.layout.database_path)
    restored = prepare_local_storage(data_dir=str(root))
    assert restored.integrity == "failed"
    assert restored.restore["restored"] is True
    assert restored.restore["backup"].endswith("manual.db")
    assert os.path.exists(restored.restore["damaged_file"])
    assert restored.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 1
    assert "restored from backup" in restored.notices[0]
    restored.conn.close()


def test_damaged_database_without_backup_starts_empty_and_says_so(tmp_path):
    root = tmp_path / "root"
    os.makedirs(root / "data")
    db = root / "data" / "owl.db"
    db.write_bytes(b"garbage" * 100)
    with open_local_client(tmp_path, data_dir=str(root), db_path="") as client:
        status = client.get("/data/status").json()
    assert status["integrity"] == "failed"
    assert status["restore"]["restored"] is False
    assert "no good backup" in status["notices"][0]
    assert any(n.startswith("owl.db.damaged-") for n in os.listdir(root / "data"))
