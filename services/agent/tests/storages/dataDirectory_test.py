import os
import sqlite3
import stat

from supports.projectClient_support import open_local_client

from app.settings import dataDirectory_setting
from app.settings.dataDirectory_setting import (
    list_legacy_database_candidates,
    pick_platform_app_name,
    resolve_data_layout,
)
from app.storages.storageBootstrap_storage import prepare_local_storage


def read_mode(path) -> int:
    return stat.S_IMODE(os.stat(path).st_mode)


def test_default_layout_uses_platformdirs_owl_folder(monkeypatch, tmp_path):
    monkeypatch.delenv("OWL_DATA_DIR", raising=False)
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    layout = resolve_data_layout()
    assert pick_platform_app_name() == "owl"
    assert layout.root == str(tmp_path / "xdg" / "owl")
    assert layout.database_path == str(tmp_path / "xdg" / "owl" / "data" / "owl.db")
    assert not layout.overridden


def test_owl_data_dir_overrides_location(monkeypatch, tmp_path):
    monkeypatch.setenv("OWL_DATA_DIR", str(tmp_path / "custom"))
    layout = resolve_data_layout()
    assert layout.root == str(tmp_path / "custom")
    assert layout.overridden
    assert layout.cache_dir == str(tmp_path / "custom" / "cache")
    assert list_legacy_database_candidates(layout) == [str(tmp_path / "custom" / "owl.db")]


def test_bootstrap_creates_private_folders_and_files(tmp_path):
    storage = prepare_local_storage(data_dir=str(tmp_path / "root"))
    root = tmp_path / "root"
    for name in ("data", "screenshots", "backups", "logs", "exports", "cache"):
        assert (root / name).is_dir()
        assert read_mode(root / name) == 0o700
    assert read_mode(root) == 0o700
    assert read_mode(storage.layout.database_path) == 0o600
    assert storage.layout.database_path == str(root / "data" / "owl.db")
    assert read_mode(storage.log_file) == 0o600
    storage.conn.close()
    again = prepare_local_storage(data_dir=str(root))
    assert again.integrity == "ok"
    again.conn.close()


def test_token_file_lives_in_data_dir_with_0600(tmp_path):
    with open_local_client(tmp_path, data_dir=str(tmp_path / "root"), db_path="") as client:
        token_file = tmp_path / "root" / "service.token"
        assert token_file.read_text() == client.app.state.service_tokens.primary
        assert read_mode(token_file) == 0o600
        assert client.get("/data/status").json()["data_dir"] == str(tmp_path / "root")


def make_legacy_database(path) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, project TEXT NOT NULL"
        " DEFAULT '', status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, plan TEXT NOT"
        " NULL DEFAULT '[]', step_index INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT"
        " '', routing TEXT NOT NULL DEFAULT '', failure TEXT NOT NULL DEFAULT '', created_at TEXT"
        " NOT NULL, updated_at TEXT NOT NULL)"
    )
    conn.execute(
        "INSERT INTO tasks (id, prompt, status, created_at, updated_at)"
        " VALUES ('task-old', 'legacy prompt', 'completed', 'x', 'x')"
    )
    conn.commit()
    conn.close()
    os.chmod(path, 0o600)


def test_legacy_xdg_database_is_copied_once_and_kept(monkeypatch, tmp_path):
    monkeypatch.delenv("OWL_DATA_DIR", raising=False)
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    monkeypatch.setattr(
        dataDirectory_setting,
        "find_legacy_launcher_database_path",
        lambda: str(tmp_path / "nowhere" / "owl.db"),
    )
    legacy = tmp_path / "xdg" / "owl-agent" / "owl.db"
    make_legacy_database(str(legacy))
    storage = prepare_local_storage()
    assert storage.migrated_from == str(legacy)
    assert legacy.exists()
    row = storage.conn.execute("SELECT prompt FROM tasks WHERE id = 'task-old'").fetchone()
    assert row[0] == "legacy prompt"
    assert any("moved here" in n for n in storage.notices)
    storage.conn.close()
    second = prepare_local_storage()
    assert second.migrated_from == ""
    second.conn.close()


def test_old_launcher_layout_in_same_root_is_migrated(tmp_path):
    root = tmp_path / "launcher"
    make_legacy_database(str(root / "owl.db"))
    storage = prepare_local_storage(data_dir=str(root))
    assert storage.migrated_from == str(root / "owl.db")
    assert storage.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 1
    storage.conn.close()


def test_override_never_pulls_in_the_real_legacy_database(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    make_legacy_database(str(tmp_path / "xdg" / "owl-agent" / "owl.db"))
    storage = prepare_local_storage(data_dir=str(tmp_path / "isolated"))
    assert storage.migrated_from == ""
    assert storage.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
    storage.conn.close()
