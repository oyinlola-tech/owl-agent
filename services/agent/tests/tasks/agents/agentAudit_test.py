import sqlite3

from supports.taskClient_support import ScriptedMockProvider, make_test_client, wait_for_task_status


def list_pending_approval_ids(client, task_id):
    return [
        a["id"]
        for a in client.get(f"/tasks/{task_id}/approvals").json()
        if a["status"] == "pending"
    ]


def test_expired_approval_cannot_execute(tmp_path):
    script = [
        {"tool": "exec_run", "args": {"argv": ["echo", "x"], "cwd": "."}, "why": "t"},
        {"done": True, "summary": "ok"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["A"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "expire me"}).json()["id"]
        wait_for_task_status(client, task_id, ("awaiting_approval",))
        aids = list_pending_approval_ids(client, task_id)
        assert len(aids) == 1
        db = sqlite3.connect(str(tmp_path / "t.db"))
        db.execute(
            "UPDATE approvals SET expires_at = ? WHERE id = ?",
            ("2000-01-01T00:00:00+00:00", aids[0]),
        )
        db.commit()
        db.close()
        client.post(f"/tasks/{task_id}/approvals/{aids[0]}/decision", json={"approved": True})
        import time

        end = time.time() + 8
        fresh = []
        while time.time() < end:
            fresh = [
                a["id"]
                for a in client.get(f"/tasks/{task_id}/approvals").json()
                if a["status"] == "pending"
            ]
            if fresh and fresh != aids:
                break
            time.sleep(0.1)
        assert fresh and fresh != aids, "expired approval must force a fresh request"
        client.post(f"/tasks/{task_id}/approvals/{fresh[0]}/decision", json={"approved": True})
        final = wait_for_task_status(
            client,
            task_id,
            ("completed_unverified", "verified_completed", "failed", "paused"),
            timeout=15.0,
        )
        assert final["status"] == "completed_unverified"
        calls = client.get(f"/tasks/{task_id}/tool-calls").json()
        assert any(c["tool"] == "exec_run" and c["status"] == "ok" for c in calls)


def test_changed_args_require_new_approval(tmp_path):
    script = [
        {"tool": "exec_run", "args": {"argv": ["echo", "one"], "cwd": "."}, "why": "t1"},
        {"tool": "exec_run", "args": {"argv": ["echo", "two"], "cwd": "."}, "why": "t2"},
        {"done": True, "summary": "ok"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["A", "B"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "two commands"}).json()["id"]
        wait_for_task_status(client, task_id, ("awaiting_approval",))
        first = list_pending_approval_ids(client, task_id)
        client.post(f"/tasks/{task_id}/approvals/{first[0]}/decision", json={"approved": True})
        import time

        end = time.time() + 10
        second = []
        while time.time() < end:
            second = [a for a in list_pending_approval_ids(client, task_id) if a not in first]
            if second:
                break
            time.sleep(0.1)
        assert second, "changed arguments must trigger a fresh approval"
        client.post(f"/tasks/{task_id}/approvals/{second[0]}/decision", json={"approved": True})
        final = wait_for_task_status(
            client,
            task_id,
            ("completed_unverified", "verified_completed", "failed", "paused"),
            timeout=15.0,
        )
        assert final["status"] == "completed_unverified"


def test_duplicate_execution_skipped_not_reapplied(tmp_path):
    (tmp_path / "ws").mkdir()
    script = [
        {"tool": "exec_run", "args": {"argv": ["echo", "dup"], "cwd": "."}, "why": "t1"},
        {"tool": "exec_run", "args": {"argv": ["echo", "dup"], "cwd": "."}, "why": "t2"},
        {"done": True, "summary": "ok"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["A", "B"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "same twice"}).json()["id"]
        wait_for_task_status(client, task_id, ("awaiting_approval",))
        first = list_pending_approval_ids(client, task_id)
        client.post(f"/tasks/{task_id}/approvals/{first[0]}/decision", json={"approved": True})
        final = wait_for_task_status(
            client,
            task_id,
            ("completed_unverified", "verified_completed", "failed", "paused"),
            timeout=15.0,
        )
        assert final["status"] == "completed_unverified"
        assert len(client.get(f"/tasks/{task_id}/approvals").json()) == 1
        calls = client.get(f"/tasks/{task_id}/tool-calls").json()
        assert sum(1 for c in calls if c["status"] == "ok") >= 1


def test_cancel_during_execution_kills_process(tmp_path):
    (tmp_path / "ws").mkdir()
    script = [
        {"tool": "exec_run", "args": {"argv": ["sleep", "30"], "cwd": "."}, "why": "long"},
        {"done": True, "summary": "ok"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["Sleep"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "sleep tight"}).json()["id"]
        wait_for_task_status(client, task_id, ("awaiting_approval",))
        aids = list_pending_approval_ids(client, task_id)
        client.post(f"/tasks/{task_id}/approvals/{aids[0]}/decision", json={"approved": True})
        import time

        time.sleep(1.5)
        started = time.monotonic()
        cancelled = client.post(f"/tasks/{task_id}/cancel").json()
        elapsed = time.monotonic() - started
        assert cancelled["status"] == "cancelled"
        assert elapsed < 10, "cancel must not wait out the full command"
        assert client.get(f"/tasks/{task_id}").json()["status"] == "cancelled"


def test_model_call_budget_pauses(tmp_path):
    script = [{"tool": "fs_list", "args": {"path": "."}, "why": "x"}] * 5
    provider = ScriptedMockProvider(["A", "B", "C"], script)
    with make_test_client(tmp_path, provider=provider, max_model_calls=2) as client:
        task_id = client.post("/tasks", json={"prompt": "budget me"}).json()["id"]
        final = wait_for_task_status(
            client,
            task_id,
            ("paused", "completed_unverified", "verified_completed", "failed"),
            timeout=15.0,
        )
        assert final["status"] == "paused"


def test_sudo_is_refused_without_approval(tmp_path):
    (tmp_path / "ws").mkdir()
    script = [
        {"tool": "exec_run", "args": {"argv": ["sudo", "ls"], "cwd": "."}, "why": "evil"},
        {"done": True, "summary": "moved on"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["Do"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "escalate"}).json()["id"]
        final = wait_for_task_status(
            client,
            task_id,
            ("completed_unverified", "verified_completed", "failed", "paused"),
            timeout=15.0,
        )
        assert final["status"] == "completed_unverified"
        assert client.get(f"/tasks/{task_id}/approvals").json() == []
        calls = client.get(f"/tasks/{task_id}/tool-calls").json()
        assert any(c["status"] == "error" for c in calls)


def test_unknown_tool_never_executes(tmp_path):
    (tmp_path / "ws").mkdir()
    script = [
        {"tool": "nope_tool", "args": {}, "why": "???"},
        {"done": True, "summary": "moved on"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["Do"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "mystery"}).json()["id"]
        final = wait_for_task_status(
            client,
            task_id,
            ("completed_unverified", "verified_completed", "failed", "paused"),
            timeout=15.0,
        )
        assert final["status"] == "completed_unverified"
        assert client.get(f"/tasks/{task_id}/approvals").json() == []


def test_key_never_leaks_in_errors():
    import asyncio

    import httpx

    from app.llms.providers.nvidiaProvider_provider import NvidiaProvider
    from app.llms.providers.providerError_provider import InvalidCredentialsError
    from app.settings.serviceSettings_setting import Settings

    def handler(request):
        return httpx.Response(401, json={"detail": "bad key nvapi-SECRETXYZ999"})

    async def go():
        provider = NvidiaProvider(
            Settings(nvidia_api_key="nvapi-SECRETXYZ999"),
            transport=httpx.MockTransport(handler),
        )
        try:
            await provider.complete([{"role": "user", "content": "hi"}])
            raise AssertionError("should have raised")
        except InvalidCredentialsError as exc:
            assert "SECRETXYZ" not in str(exc)
        await provider.aclose()

    asyncio.run(go())


class FlakyProvider:
    name = "mock"

    def __init__(self, failures, reply="recovered"):
        self._failures = list(failures)
        self._reply = reply

    async def complete(self, messages, model=None):
        if self._failures:
            raise self._failures.pop(0)
        return self._reply

    async def complete_stream(self, messages, model=None):
        yield await self.complete(messages, model)

    async def list_models(self):
        return ["mock-1"]

    def describe(self):
        return {"name": "mock", "configured": True, "model": "mock-1"}

    def pop_usage(self):
        return None


def test_rate_limit_retries_then_succeeds(tmp_path):
    from app.llms.providers.providerError_provider import RateLimitedError

    provider = FlakyProvider(
        [RateLimitedError("slow"), RateLimitedError("slow")], reply='{"done": true}'
    )
    with make_test_client(tmp_path, provider=provider, max_retries=3) as client:
        task_id = client.post("/tasks", json={"prompt": "retry me"}).json()["id"]
        final = wait_for_task_status(
            client,
            task_id,
            ("completed_unverified", "verified_completed", "failed", "paused"),
            timeout=20.0,
        )
        assert final["status"] == "completed_unverified"
        rows = client.get("/usage", params={"task_id": task_id}).json()
        assert any("recovered after 2 retries" in r["error"] for r in rows)


def test_rate_limit_exhaustion_pauses(tmp_path):
    from app.llms.providers.providerError_provider import RateLimitedError

    provider = FlakyProvider([RateLimitedError("slow")] * 5)
    with make_test_client(tmp_path, provider=provider, max_retries=1) as client:
        task_id = client.post("/tasks", json={"prompt": "limit me"}).json()["id"]
        final = wait_for_task_status(client, task_id, ("paused", "failed"), timeout=20.0)
        assert final["status"] == "paused"


def test_invalid_credentials_pause_with_note(tmp_path):
    from app.llms.providers.providerError_provider import InvalidCredentialsError

    provider = FlakyProvider([InvalidCredentialsError("bad key")])
    with make_test_client(tmp_path, provider=provider) as client:
        task_id = client.post("/tasks", json={"prompt": "auth me"}).json()["id"]
        final = wait_for_task_status(client, task_id, ("paused", "failed"), timeout=15.0)
        assert final["status"] == "paused"
