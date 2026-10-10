"""Approval gating against the real loop. Scripted provider, tmp workspace."""

from conftest import ScriptedMock, make_client, wait_for

PLAN = ["Inspect", "Verify"]
ACTIONS = [
    {"tool": "exec_run", "args": {"argv": ["echo", "hello"], "cwd": "."}, "why": "smoke"},
    {"done": True, "summary": "ok"},
]


def test_approval_gate_blocks_until_backend_decision(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "gated work"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
        assert client.get(f"/tasks/{task_id}").json()["status"] == "awaiting_approval"
        assert (
            client.post(
                f"/tasks/{task_id}/approvals/nope/decision", json={"approved": True}
            ).status_code
            == 404
        )


def test_approve_continues_task(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "approve me"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
        aids = [
            a["id"]
            for a in client.get(f"/tasks/{task_id}/approvals").json()
            if a["status"] == "pending"
        ]
        assert len(aids) == 1
        decided = client.post(
            f"/tasks/{task_id}/approvals/{aids[0]}/decision",
            json={"approved": True, "by": "tester"},
        )
        assert decided.status_code == 200
        assert decided.json()["status"] == "approved"
        assert decided.json()["decided_by"] == "tester"
        assert decided.json()["action"] == "exec_run"
        assert (
            client.post(
                f"/tasks/{task_id}/approvals/{aids[0]}/decision", json={"approved": True}
            ).status_code
            == 409
        )
        final = wait_for(client, task_id, ("completed", "failed"), timeout=15.0)
        assert final["status"] == "completed"
        calls = client.get(f"/tasks/{task_id}/tool-calls").json()
        assert any(c["tool"] == "exec_run" and c["status"] == "ok" for c in calls)


def test_reject_blocks_step(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "reject me"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
        aids = [
            a["id"]
            for a in client.get(f"/tasks/{task_id}/approvals").json()
            if a["status"] == "pending"
        ]
        decided = client.post(
            f"/tasks/{task_id}/approvals/{aids[0]}/decision", json={"approved": False}
        )
        assert decided.json()["status"] == "rejected"
        final = wait_for(client, task_id, ("paused", "failed"), timeout=10.0)
        assert final["status"] == "paused"
