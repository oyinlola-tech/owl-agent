import asyncio
import sqlite3

import pytest
from supports.taskClient_support import ScriptedMockProvider, make_test_client, wait_for_task_status

from app.executors.commandExecutor_executor import CommandExecutor, CommandRefusedError
from app.guards.commandRisk_guard import command_needs_network
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.sandboxes.sandboxPolicy_sandbox import SandboxPolicy, resolve_mode_and_backend
from app.sandboxes.sandboxRunner_sandbox import SandboxRunner


def build_executor_without_backend(tmp_path, mode):
    ws = tmp_path / "ws"
    ws.mkdir(exist_ok=True)
    runner = SandboxRunner(SandboxPolicy(mode=mode, backend="no-such-backend"), str(tmp_path))
    runner.run_startup_self_test()
    return CommandExecutor(WorkspaceAccessGuard([str(ws)]), sandbox=runner)


def test_required_mode_refuses_without_backend(tmp_path):
    executor = build_executor_without_backend(tmp_path, "required")
    with pytest.raises(CommandRefusedError, match="OWL_SANDBOX=required"):
        asyncio.run(executor.run_command("t1", ["echo", "hi"], "."))


def test_preferred_mode_runs_unsandboxed_and_says_so(tmp_path):
    executor = build_executor_without_backend(tmp_path, "preferred")
    res = asyncio.run(executor.run_command("t1", ["echo", "hi"], "."))
    assert res["exit_code"] == 0
    assert res["sandboxed"] is False and res["sandbox_backend"] == "none"


def test_unknown_mode_fails_closed_and_container_names_map():
    assert resolve_mode_and_backend("bogus", "auto") == ("required", "auto")
    assert resolve_mode_and_backend("docker", "auto") == ("required", "docker")
    assert resolve_mode_and_backend("off", "auto") == ("off", "auto")


def test_network_need_detection():
    assert command_needs_network(["pip", "install", "requests"])
    assert command_needs_network(["git", "push", "origin"])
    assert command_needs_network(["curl", "https://example.com"])
    assert not command_needs_network(["pytest", "-q"])
    assert not command_needs_network(["git", "status"])


def approve_pending(client, task_id):
    approvals = client.get(f"/tasks/{task_id}/approvals").json()
    pending = [a for a in approvals if a["status"] == "pending"]
    client.post(f"/tasks/{task_id}/approvals/{pending[0]['id']}/decision", json={"approved": True})
    return pending[0]


def test_preferred_mode_records_unsandboxed_tool_call_and_warns(tmp_path):
    script = [
        {"tool": "exec_run", "args": {"argv": ["echo", "hi"], "cwd": "."}, "why": "say hi"},
        {"done": True, "summary": "ok"},
    ]
    provider = ScriptedMockProvider(["Echo"], script)
    with make_test_client(tmp_path, provider=provider, sandbox_backend="no-such") as client:
        task_id = client.post("/tasks", json={"prompt": "echo"}).json()["id"]
        wait_for_task_status(client, task_id, ("awaiting_approval",))
        approval = approve_pending(client, task_id)
        assert "WITHOUT a sandbox" in approval["reason"]
        assert approval["sandboxed"] is False and approval["network"] is False
        wait_for_task_status(client, task_id, ("completed_unverified", "verified_completed"))
        status = client.get("/security/status").json()
        assert status["sandbox"]["active"] is False
    conn = sqlite3.connect(str(tmp_path / "t.db"))
    row = conn.execute("SELECT sandboxed, sandbox_backend FROM tool_calls").fetchone()
    assert row == (0, "none")


def test_network_command_approval_states_network_access(tmp_path):
    script = [
        {"tool": "exec_run", "args": {"argv": ["pip", "install", "x"], "cwd": "."}, "why": "dep"},
        {"done": True, "summary": "ok"},
    ]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(["Install"], script)) as client:
        task_id = client.post("/tasks", json={"prompt": "install"}).json()["id"]
        wait_for_task_status(client, task_id, ("awaiting_approval",))
        approval = client.get(f"/tasks/{task_id}/approvals").json()[0]
        assert approval["network"] is True
        assert approval["title"].endswith("with network access")
        client.post(f"/tasks/{task_id}/cancel")
