import pytest
from supports.authorizedClient_support import open_authorized_client

from app import create_app
from app.databases.databaseConnection_database import open_database
from app.llms.modelRegistry_llm import ModelRegistry
from app.llms.modelRouter_llm import ModelRouter, classify_prompt
from app.settings.serviceSettings_setting import Settings


@pytest.fixture()
def registry():
    conn = open_database(":memory:")
    reg = ModelRegistry(conn)
    reg.save_model("code-model", status="verified", capabilities=["chat", "code", "reasoning"])
    reg.save_model("chat-model", status="available", capabilities=["chat"])
    reg.save_model("old-model", status="deprecated", capabilities=["chat"])
    return reg


def test_classify_buckets():
    assert classify_prompt("fix this traceback") == "debug"
    assert classify_prompt("implement the login endpoint") == "code"
    assert classify_prompt("plan the architecture") == "plan"
    assert classify_prompt("summarize the thread") == "summarize"
    assert classify_prompt("hello there") == "chat"


def test_auto_picks_capable_model(registry):
    router = ModelRouter(registry, default_model="chat-model")
    picked, reason = router.choose_model("implement the login endpoint")
    assert picked == "code-model"
    assert "code" in reason


def test_pinned_model_is_honored(registry):
    router = ModelRouter(registry)
    picked, reason = router.choose_model("anything", model="chat-model")
    assert picked == "chat-model"
    assert "user-pinned" in reason


def test_pinned_unusable_falls_back_with_reason(registry):
    router = ModelRouter(registry, fallback_model="chat-model")
    picked, reason = router.choose_model("anything", model="old-model")
    assert picked == "chat-model"
    assert "fallback" in reason


def test_pinned_unusable_no_fallback_raises(registry):
    from app.llms.modelRouter_llm import RoutingError

    router = ModelRouter(registry, allow_fallback=False)
    with pytest.raises(RoutingError):
        router.choose_model("anything", model="old-model")


def test_recent_failures_avoided(registry):
    router = ModelRouter(registry, default_model="code-model", recent_failures={"code-model"})
    picked, _ = router.choose_model("implement x")
    assert picked == "chat-model"


def test_no_usable_models_raises():
    from app.llms.modelRouter_llm import RoutingError

    conn = open_database(":memory:")
    with pytest.raises(RoutingError):
        ModelRouter(ModelRegistry(conn)).choose_model("hi")


def test_registry_refresh_marks_deprecated(registry):
    counts = registry.sync_with_live_catalog(["code-model", "fresh-model"])
    assert counts["added"] == 1
    assert registry.get_model("fresh-model")["status"] == "available"
    assert registry.get_model("chat-model")["status"] == "deprecated"


def test_registry_never_invents_context(registry):
    assert registry.get_model("code-model")["context_window"] is None


def test_route_endpoint_explains(tmp_path):
    settings = Settings(
        step_delay=0.01,
        db_path=str(tmp_path / "t.db"),
        _env_file=None,
        nvidia_api_key="",
        provider="mock",
    )
    with open_authorized_client(create_app(settings)) as client:
        res = client.post("/route", json={"prompt": "fix this traceback"})
        assert res.status_code == 200
        body = res.json()
        assert body["category"] == "debug"
        assert body["model"]
        assert body["reason"]
