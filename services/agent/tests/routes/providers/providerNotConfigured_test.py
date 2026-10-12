from supports.authorizedClient_support import open_authorized_client
from supports.providerDouble_support import build_provider_client

from app import create_app
from app.settings.serviceSettings_setting import Settings

CHAT = {"messages": [{"role": "user", "content": "hi"}]}


def test_nothing_configured_reports_none_and_refuses_chat_and_tasks(tmp_path):
    with build_provider_client(tmp_path) as client:
        assert client.get("/provider").json() == {"name": "none", "configured": False, "model": ""}
        health = client.get("/health").json()
        assert health["provider"] == "none" and health["provider_configured"] is False
        for path in ("/chat", "/chat/stream"):
            res = client.post(path, json=CHAT)
            assert res.status_code == 409
            assert res.json()["code"] == "provider_not_configured"
        res = client.post("/tasks", json={"prompt": "do something"})
        assert res.status_code == 409
        assert res.json()["code"] == "provider_not_configured"
        assert client.get("/tasks").json() == []
        verify = client.post("/provider/verify").json()
        assert verify["ok"] is False and verify["code"] == "provider_not_configured"


def test_mock_only_when_explicitly_selected(tmp_path):
    settings = Settings(
        step_delay=0.01,
        db_path=str(tmp_path / "t.db"),
        _env_file=None,
        nvidia_api_key="",
        provider="mock",
    )
    with open_authorized_client(create_app(settings)) as client:
        assert client.get("/provider").json()["name"] == "mock"
        assert client.post("/chat", json=CHAT).status_code == 200


def test_none_cannot_be_selected_as_a_provider_card(tmp_path):
    with build_provider_client(tmp_path) as client:
        res = client.put("/providers/active", json={"provider_id": "mock"})
        assert res.status_code == 404
        assert res.json()["code"] == "unknown_provider"
        res = client.put("/providers/active", json={"provider_id": "none"})
        assert res.json() == {"active": "none", "model": "", "provider": None}
