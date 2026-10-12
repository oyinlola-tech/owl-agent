from fastapi.testclient import TestClient

LIVE_SERVER_TOKEN = "live-server-test-token-0123456789"
TEST_BASE_URL = "http://127.0.0.1:8000"


def build_auth_headers(app) -> dict[str, str]:
    token = app.state.service_tokens.primary
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def open_authorized_client(app, **kwargs) -> TestClient:
    return TestClient(app, base_url=TEST_BASE_URL, headers=build_auth_headers(app), **kwargs)
