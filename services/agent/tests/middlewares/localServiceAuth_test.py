import os
import stat

import httpx
from fastapi.testclient import TestClient
from supports.authorizedClient_support import (
    LIVE_SERVER_TOKEN,
    TEST_BASE_URL,
    build_auth_headers,
    open_authorized_client,
)

from app import create_app
from app.settings.serviceSettings_setting import Settings

DEV_TOKEN = "dev-token-for-qa-0123456789"


def build_app(tmp_path, **overrides):
    params = {"step_delay": 0.01, "db_path": str(tmp_path / "t.db"), "_env_file": None}
    params.update(overrides)
    return create_app(Settings(nvidia_api_key="", **params))


def test_requests_without_or_with_wrong_token_are_rejected(tmp_path):
    with TestClient(build_app(tmp_path), base_url=TEST_BASE_URL) as client:
        assert client.get("/tasks").status_code == 401
        wrong = client.get("/tasks", headers={"Authorization": "Bearer not-the-token"})
        assert wrong.status_code == 401
        assert wrong.headers["www-authenticate"] == "Bearer"


def test_health_is_open_and_token_works(tmp_path):
    app = build_app(tmp_path)
    with TestClient(app, base_url=TEST_BASE_URL) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/tasks", headers=build_auth_headers(app)).status_code == 200


def test_rebinding_host_header_is_rejected(tmp_path):
    app = build_app(tmp_path)
    headers = build_auth_headers(app)
    with TestClient(app, base_url=TEST_BASE_URL) as client:
        evil = client.get("/tasks", headers={**headers, "Host": "evil.example:8000"})
        assert evil.status_code == 421
        wrong_port = client.get("/tasks", headers={**headers, "Host": "127.0.0.1:9999"})
        assert wrong_port.status_code == 421
        assert (
            client.get("/tasks", headers={**headers, "Host": "localhost:8000"}).status_code == 200
        )


def test_mutating_request_needs_json_content_type(tmp_path):
    app = build_app(tmp_path)
    with open_authorized_client(app) as client:
        res = client.post(
            "/tasks", content='{"prompt": "x"}', headers={"Content-Type": "text/plain"}
        )
        assert res.status_code == 415
        assert client.post("/tasks", json={"prompt": "x"}).status_code in (200, 201)


def test_token_file_is_private_and_matches(tmp_path):
    app = build_app(tmp_path)
    token_file = tmp_path / "service.token"
    assert token_file.read_text() == app.state.service_tokens.primary
    assert stat.S_IMODE(os.stat(token_file).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(tmp_path / "t.db").st_mode) == 0o600
    assert stat.S_IMODE(os.stat(tmp_path).st_mode) == 0o700


def test_dev_token_accepted_only_without_configured_token(tmp_path):
    dev_app = build_app(tmp_path / "a", dev_token=DEV_TOKEN)
    with TestClient(dev_app, base_url=TEST_BASE_URL) as client:
        ok = client.get("/tasks", headers={"Authorization": f"Bearer {DEV_TOKEN}"})
        assert ok.status_code == 200
    strict = build_app(tmp_path / "b", dev_token=DEV_TOKEN, require_token=True)
    with TestClient(strict, base_url=TEST_BASE_URL) as client:
        assert (
            client.get("/tasks", headers={"Authorization": f"Bearer {DEV_TOKEN}"}).status_code
            == 401
        )
    fixed = build_app(tmp_path / "c", dev_token=DEV_TOKEN, service_token=LIVE_SERVER_TOKEN)
    with TestClient(fixed, base_url=TEST_BASE_URL) as client:
        assert (
            client.get("/tasks", headers={"Authorization": f"Bearer {DEV_TOKEN}"}).status_code
            == 401
        )
        good = client.get("/tasks", headers={"Authorization": f"Bearer {LIVE_SERVER_TOKEN}"})
        assert good.status_code == 200


def test_event_stream_accepts_token_query_param(live_server):
    auth = {"Authorization": f"Bearer {LIVE_SERVER_TOKEN}", "Content-Type": "application/json"}
    with httpx.Client(base_url=live_server, timeout=10.0) as client:
        task_id = client.post("/tasks", json={"prompt": "sse"}, headers=auth).json()["id"]
        assert client.get(f"/tasks/{task_id}?token={LIVE_SERVER_TOKEN}").status_code == 401
        with client.stream("GET", f"/tasks/{task_id}/events") as denied:
            assert denied.status_code == 401
        url = f"/tasks/{task_id}/events?token={LIVE_SERVER_TOKEN}"
        with client.stream("GET", url) as stream:
            assert stream.status_code == 200
            first = next(line for line in stream.iter_lines() if line)
            assert first == "event: snapshot"
        client.post(f"/tasks/{task_id}/cancel", headers=auth)
