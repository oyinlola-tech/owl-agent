import os
import stat
import time

from supports.providerDouble_support import (
    SECRET_KEY,
    FakeAnthropicClient,
    LogCapture,
    assert_no_secret,
    build_cloud_transport,
    build_provider_client,
)

CHAT = {"messages": [{"role": "user", "content": "hi"}]}


def find_card(client, provider_id):
    body = client.get("/providers").json()
    assert_no_secret(body)
    return next(p for p in body["providers"] if p["id"] == provider_id)


def test_listing_groups_and_initial_status(tmp_path):
    with build_provider_client(tmp_path) as client:
        body = client.get("/providers").json()
        assert body["active"] == "none"
        assert body["key_storage"]["backend"] == "file"
        ids = {p["id"]: p for p in body["providers"]}
        assert {"anthropic", "openai", "gemini", "xai", "groq", "nvidia", "openrouter"} <= set(ids)
        assert {"together", "custom", "ollama", "lmstudio", "llamacpp"} <= set(ids)
        assert ids["openai"]["status"] == "key_missing"
        assert ids["ollama"]["group"] == "local" and ids["ollama"]["requires_key"] is False
        assert ids["anthropic"]["default_model"] == "claude-opus-5-5"
        assert ids["anthropic"]["options"] == {"server_fallbacks": True}
        assert all(p["key_url"] or p["id"] == "custom" for p in body["providers"])


def test_key_save_test_activate_chat_and_delete(tmp_path):
    seen = []
    with (
        LogCapture() as logs,
        build_provider_client(tmp_path, build_cloud_transport(seen=seen)) as client,
    ):
        saved = client.put("/providers/openai/key", json={"key": SECRET_KEY}).json()
        assert_no_secret(saved)
        assert saved["has_key"] is True
        assert saved["key_hint"] == "…cdef"
        assert saved["key_source"] == "file"
        key_file = tmp_path / "provider-keys.json"
        if os.name == "posix":
            assert stat.S_IMODE(os.stat(key_file).st_mode) == 0o600
        tested = client.post("/providers/openai/test").json()
        assert tested["ok"] is True and tested["model_count"] == 2
        assert tested["latency_ms"] is not None
        assert find_card(client, "openai")["status"] == "connected"
        active = client.put("/providers/active", json={"provider_id": "openai", "model": "m-a"})
        assert active.status_code == 200
        assert active.json()["model"] == "m-a"
        assert client.get("/provider").json() == {
            "name": "openai",
            "configured": True,
            "model": "m-a",
        }
        reply = client.post("/chat", json=CHAT).json()
        assert reply["reply"] == "cloud reply"
        assert reply["model"] == "m-a"
        assert reply["usage"]["estimated"] is False
        assert seen[-1].headers["authorization"] == f"Bearer {SECRET_KEY}"
        removed = client.delete("/providers/openai/key").json()
        assert removed["has_key"] is False and removed["status"] == "key_missing"
        assert client.post("/chat", json=CHAT).status_code == 409
        assert_no_secret(saved, tested, active.json(), reply, removed)
    assert all(SECRET_KEY not in line for line in logs.lines)


def test_unsaved_key_can_be_tested_without_storing_it(tmp_path):
    with build_provider_client(tmp_path) as client:
        res = client.post("/providers/groq/test", json={"key": SECRET_KEY}).json()
        assert res["ok"] is True
        assert_no_secret(res)
        assert find_card(client, "groq")["has_key"] is False
        assert not (tmp_path / "provider-keys.json").exists()


def test_rejected_key_error_is_scrubbed_everywhere(tmp_path):
    with (
        LogCapture() as logs,
        build_provider_client(tmp_path, build_cloud_transport(status=401)) as client,
    ):
        client.put("/providers/xai/key", json={"key": SECRET_KEY})
        res = client.post("/providers/xai/test").json()
        assert res["ok"] is False and res["code"] == "invalid_credentials"
        card = find_card(client, "xai")
        assert card["status"] == "error"
        client.put("/providers/xai/settings", json={"model": "grok-x"})
        client.put("/providers/active", json={"provider_id": "xai"})
        task = client.post("/tasks", json={"prompt": "write code"}).json()
        deadline = time.time() + 10
        while time.time() < deadline:
            status = client.get(f"/tasks/{task['id']}").json()["status"]
            if status not in ("running", "planning"):
                break
            time.sleep(0.05)
        detail = client.get(f"/tasks/{task['id']}/detail").json()
        assert status == "paused"
        assert_no_secret(res, card, task, detail, client.get("/usage").json())
    assert all(SECRET_KEY not in line for line in logs.lines)


def test_environment_key_is_read_only(tmp_path):
    env_key = "nvapi-ENVIRONMENT-KEY-123456"
    with build_provider_client(tmp_path, nvidia_api_key=env_key) as client:
        body = client.get("/providers").json()
        assert body["active"] == "nvidia"
        card = next(p for p in body["providers"] if p["id"] == "nvidia")
        assert card["key_source"] == "env" and card["key_read_only"] is True
        assert env_key not in str(body)
        res = client.put("/providers/nvidia/key", json={"key": SECRET_KEY})
        assert res.status_code == 409 and res.json()["code"] == "key_from_environment"


def test_claude_via_routes_with_fallback_setting(tmp_path):
    fake = FakeAnthropicClient()
    with build_provider_client(tmp_path, anthropic=fake) as client:
        client.put("/providers/anthropic/key", json={"key": SECRET_KEY})
        tested = client.post("/providers/anthropic/test").json()
        assert tested["ok"] is True and "claude-opus-5-5" in tested["models"]
        card = client.put("/providers/anthropic/settings", json={"server_fallbacks": False})
        assert card.json()["options"] == {"server_fallbacks": False}
        active = client.put("/providers/active", json={"provider_id": "anthropic"}).json()
        assert active["model"] == "claude-opus-5-5"
        assert client.post("/chat", json=CHAT).json()["reply"] == "hello"
        params = [p for kind, p in fake.calls if kind == "create"][-1]
        assert "fallbacks" not in params and "temperature" not in params


def test_custom_and_local_url_rules(tmp_path):
    with build_provider_client(tmp_path) as client:
        bad = client.put("/providers/custom/settings", json={"base_url": "http://example.com/v1"})
        assert bad.status_code == 422 and bad.json()["code"] == "invalid_base_url"
        fixed = client.put("/providers/openai/settings", json={"base_url": "https://x.example"})
        assert fixed.json()["code"] == "base_url_fixed"
        good = client.put("/providers/custom/settings", json={"base_url": "https://llm.example/v1"})
        assert good.json()["base_url"] == "https://llm.example/v1"
        assert client.post("/providers/custom/test").json()["ok"] is True
        local = client.post("/providers/ollama/test", json={"base_url": "http://127.0.0.1:9/v1"})
        assert local.json()["ok"] is True
        unknown = client.post("/providers/madeup/test")
        assert unknown.status_code == 404


def test_local_discovery_route(tmp_path):
    with build_provider_client(tmp_path) as client:
        runners = client.get("/providers/local").json()["runners"]
        assert {r["id"] for r in runners} == {"ollama", "lmstudio", "llamacpp"}
        assert all(r["running"] for r in runners)


def test_active_provider_survives_restart(tmp_path):
    with build_provider_client(tmp_path) as client:
        client.put("/providers/openai/key", json={"key": SECRET_KEY})
        client.put("/providers/active", json={"provider_id": "openai", "model": "m-b"})
    with build_provider_client(tmp_path) as client:
        assert client.get("/provider").json() == {
            "name": "openai",
            "configured": True,
            "model": "m-b",
        }
        models = client.get("/providers/openai/models").json()
        assert models["models"] == ["m-a", "m-b"] and models["model"] == "m-b"
