import base64
import io
import json
import os
import sqlite3
import zipfile

from supports.projectClient_support import open_local_client

SECRET_VALUE = "sk-live-secretvalue-0123456789"


def plant_secret_rows(client) -> None:
    conn = client.app.state.manager.conn
    conn.execute(
        "INSERT INTO provider_settings (provider_id, key_hint, key_source, updated_at)"
        " VALUES ('openai', '…6789', 'keyring', 'x')"
    )
    conn.execute("CREATE TABLE IF NOT EXISTS provider_secret_fallback (id TEXT, value TEXT)")
    conn.execute("INSERT INTO provider_secret_fallback VALUES ('openai', ?)", (SECRET_VALUE,))
    conn.execute("CREATE TABLE IF NOT EXISTS integration (id TEXT, api_key TEXT, label TEXT)")
    conn.execute("INSERT INTO integration VALUES ('x', ?, 'kept label')", (SECRET_VALUE,))
    conn.execute(
        "INSERT INTO tasks (id, prompt, status, created_at, updated_at)"
        " VALUES ('task-export', 'export me', 'completed', 'x', 'x')"
    )
    conn.commit()


def open_export(client) -> zipfile.ZipFile:
    response = client.get("/data/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    return zipfile.ZipFile(io.BytesIO(response.content))


def test_export_never_contains_keys_or_the_service_token(tmp_path):
    with open_local_client(tmp_path) as client:
        plant_secret_rows(client)
        token = client.app.state.service_tokens.primary
        archive = open_export(client)
        names = set(archive.namelist())
        assert names == {"manifest.json", "owl.db"}
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["format"] == "owl-export" and manifest["contains_secrets"] is False
        raw = archive.read("owl.db")
        assert SECRET_VALUE.encode() not in raw
        assert token.encode() not in raw
        path = tmp_path / "exported.db"
        path.write_bytes(raw)
        conn = sqlite3.connect(path)
        assert conn.execute("SELECT COUNT(*) FROM provider_secret_fallback").fetchone()[0] == 0
        assert conn.execute("SELECT api_key, label FROM integration").fetchone() == (
            None,
            "kept label",
        )
        assert conn.execute("SELECT prompt FROM tasks").fetchone()[0] == "export me"
        conn.close()
        exports = os.listdir(client.app.state.local_storage.layout.exports_dir)
        assert all(not name.startswith(".snapshot") for name in exports)


def test_import_round_trip_backs_up_first(tmp_path):
    with open_local_client(tmp_path / "a") as source:
        plant_secret_rows(source)
        exported = source.get("/data/export").content
    archive_path = tmp_path / "owl-export.zip"
    archive_path.write_bytes(exported)
    with open_local_client(tmp_path / "b") as target:
        conn = target.app.state.manager.conn
        conn.execute(
            "INSERT INTO tasks (id, prompt, status, created_at, updated_at)"
            " VALUES ('task-local', 'before import', 'completed', 'x', 'x')"
        )
        conn.commit()
        response = target.post("/data/import", json={"path": str(archive_path)})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["imported"] is True and body["backup"]["kind"] == "pre-import"
        ids = {r[0] for r in conn.execute("SELECT id FROM tasks").fetchall()}
        assert ids == {"task-export"}
        backup = os.path.join(
            target.app.state.local_storage.layout.backups_dir, body["backup"]["name"]
        )
        old = sqlite3.connect(backup)
        assert old.execute("SELECT id FROM tasks").fetchone()[0] == "task-local"
        old.close()
        assert target.get("/data/status").json()["integrity"] == "ok"
        encoded = base64.b64encode(exported).decode()
        again = target.post("/data/import", json={"archive_base64": encoded})
        assert again.status_code == 200, again.text


def build_zip(members: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def test_import_rejects_bad_archives_without_touching_data(tmp_path):
    manifest = json.dumps({"format": "owl-export", "version": 1}).encode()
    with open_local_client(tmp_path) as client:
        cases = {
            "not-zip": b"plain text",
            "traversal": build_zip(
                {"manifest.json": manifest, "owl.db": b"x", "../../evil.txt": b"x"}
            ),
            "no-manifest": build_zip({"owl.db": b"x"}),
            "bad-db": build_zip({"manifest.json": manifest, "owl.db": b"not a database"}),
            "wrong-format": build_zip(
                {"manifest.json": b'{"format": "other", "version": 1}', "owl.db": b"x"}
            ),
        }
        for label, data in cases.items():
            response = client.post(
                "/data/import", json={"archive_base64": base64.b64encode(data).decode()}
            )
            assert response.status_code == 422, label
            assert response.json()["code"] in {"invalid_archive", "invalid_database"}, label
        assert not (tmp_path / "evil.txt").exists()
        backups = client.get("/data/status").json()["backups"]
        assert not any(b["kind"] == "pre-import" for b in backups)
        both = client.post("/data/import", json={"path": "/x", "archive_base64": "eA=="})
        assert both.status_code == 422


def test_import_refuses_exports_from_a_newer_schema(tmp_path):
    db_path = tmp_path / "newer.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE tasks (id TEXT)")
    conn.execute("CREATE TABLE schema_migrations (version INTEGER, name TEXT, applied_at TEXT)")
    conn.execute("INSERT INTO schema_migrations VALUES (999, 'future', 'x')")
    conn.commit()
    conn.close()
    manifest = json.dumps({"format": "owl-export", "version": 1}).encode()
    data = build_zip({"manifest.json": manifest, "owl.db": db_path.read_bytes()})
    with open_local_client(tmp_path / "svc") as client:
        response = client.post(
            "/data/import", json={"archive_base64": base64.b64encode(data).decode()}
        )
        assert response.status_code == 422
        assert response.json()["code"] == "newer_schema"
