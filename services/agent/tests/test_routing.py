"""Routing, registry, and budget tests. No network, no key."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import connect
from app.main import create_app
from app.registry import ModelRegistry
from app.routing import Router, classify


@pytest.fixture()
def registry():
    conn = connect(":memory:")
    reg = ModelRegistry(conn)
    reg.upsert("code-model", status="verified", capabilities=["chat", "code", "reasoning"])
    reg.upsert("chat-model", status="available", capabilities=["chat"])
    reg.upsert("old-model", status="deprecated", capabilities=["chat"])
    return reg


def test_classify_buckets():
    assert classify("fix this traceback") == "debug"
    assert classify("implement the login endpoint") == "code"
    assert classify("plan the architecture") == "plan"
    assert classify("summarize the thread") == "summarize"
    assert classify("hello there") == "chat"


def test_auto_picks_capable_model(registry):
    router = Router(registry, default_model="chat-model")
    picked, reason = router.route("implement the login endpoint")
    assert picked == "code-model"
    assert "code" in reason


def test_pinned_model_is_honored(registry):
    router = Router(registry)
    picked, reason = router.route("anything", model="chat-model")
    assert picked == "chat-model"
    assert "user-pinned" in reason


def test_pinned_unusable_falls_back_with_reason(registry):
    router = Router(registry, fallback_model="chat-model")
    picked, reason = router.route("anything", model="old-model")
    assert picked == "chat-model"
    assert "fallback" in reason


def test_pinned_unusable_no_fallback_raises(registry):
    from app.routing import RoutingError

    router = Router(registry, allow_fallback=False)
    with pytest.raises(RoutingError):
        router.route("anything", model="old-model")


def test_recent_failures_avoided(registry):
    router = Router(registry, default_model="code-model", recent_failures={"code-model"})
    picked, _ = router.route("implement x")
    assert picked == "chat-model"


def test_no_usable_models_raises():
    from app.routing import RoutingError

    conn = connect(":memory:")
    with pytest.raises(RoutingError):
        Router(ModelRegistry(conn)).route("hi")


def test_registry_refresh_marks_deprecated(registry):
    counts = registry.mark_seen(["code-model", "fresh-model"])
    assert counts["added"] == 1
    assert registry.get("fresh-model")["status"] == "available"
    assert registry.get("chat-model")["status"] == "deprecated"


def test_registry_never_invents_context(registry):
    assert registry.get("code-model")["context_window"] is None


def test_route_endpoint_explains(tmp_path):
    settings = Settings(step_delay=0.01, db_path=str(tmp_path / "t.db"))
    with TestClient(create_app(settings)) as client:
        res = client.post("/route", json={"prompt": "fix this traceback"})
        assert res.status_code == 200
        body = res.json()
        assert body["category"] == "debug"
        assert body["model"]
        assert body["reason"]
