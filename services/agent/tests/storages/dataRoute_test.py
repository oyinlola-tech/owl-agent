import logging
import os

from supports.projectClient_support import (
    add_project,
    create_sample_project,
    open_local_client,
)


def test_status_reports_location_schema_and_backups(tmp_path):
    with open_local_client(tmp_path) as client:
        status = client.get("/data/status").json()
        assert status["schema_version"] == status["latest_schema_version"]
        assert status["journal_mode"] == "wal" and status["foreign_keys"] is True
        assert status["integrity"] == "ok" and status["restore"] is None
        assert status["backup_policy"] == {"daily": 7, "weekly": 4, "event": 10}
        assert status["backups"][0]["kind"] == "daily"
        assert "path" not in status["backups"][0]


def test_manual_backup_endpoint(tmp_path):
    with open_local_client(tmp_path) as client:
        body = client.post("/data/backup").json()
        assert body["backup"]["kind"] == "manual"
        assert body["backups"][0]["name"] == body["backup"]["name"]


def test_data_routes_need_the_service_token(tmp_path):
    with open_local_client(tmp_path) as client:
        for method, path in (
            ("get", "/data/status"),
            ("get", "/data/export"),
            ("post", "/data/backup"),
            ("post", "/data/reset"),
            ("post", "/data/import"),
        ):
            response = getattr(client, method)(path, headers={"Authorization": ""})
            assert response.status_code == 401, path


def test_reset_requires_typed_confirmation_and_backs_up_first(tmp_path):
    project_dir = create_sample_project(tmp_path / "proj")
    with open_local_client(tmp_path) as client:
        project = add_project(client, project_dir)
        for wrong in ("", "reset", "yes"):
            response = client.post("/data/reset", json={"confirmation": wrong})
            assert response.status_code == 422
            assert response.json()["code"] == "confirmation_mismatch"
        assert client.get("/projects").json()["projects"]
        response = client.post("/data/reset", json={"confirmation": "RESET"})
        assert response.status_code == 200
        body = response.json()
        assert body["backup"]["kind"] == "pre-reset"
        assert body["cleared_rows"]["projects"] == 1
        assert client.get("/projects").json()["projects"] == []
        assert project_dir not in client.get("/workspaces").json()["roots"]
        assert os.path.isfile(os.path.join(project_dir, "README.md"))
        assert client.get(f"/projects/{project['id']}/tree").status_code == 404


def test_log_file_is_rotating_and_scrubbed(tmp_path):
    with open_local_client(tmp_path) as client:
        token = client.app.state.service_tokens.primary
        logging.getLogger("owl").warning(
            "request with Bearer %s and api_key=sk-abcdefgh12345678 ?token=%s", token, token
        )
        log_file = client.get("/data/status").json()["log_file"]
        handler = next(
            h for h in logging.getLogger().handlers if h.get_name() == "owl-rotating-file"
        )
        handler.flush()
        assert handler.maxBytes == 2 * 1024 * 1024 and handler.backupCount == 4
        text = open(log_file, encoding="utf-8").read()
        assert "redacted-secret" in text
        assert token not in text
        assert "sk-abcdefgh12345678" not in text
