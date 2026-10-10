"""Persistence, checkpoints, and recovery against the real loop."""

from conftest import ScriptedMock, make_client, wait_for

PLAN = ["Inspect", "Verify"]
ACTIONS = [
    {"tool": "exec_run", "args": {"argv": ["echo", "hello"], "cwd": "."}, "why": "smoke"},
    {"done": True, "summary": "ok"},
]


def approve_gate(client, task_id):
    aids = [
        a["id"]
        for a in client.get(f"/tasks/{task_id}/approvals").json()
        if a["status"] == "pending"
    ]
    assert len(aids) == 1
    client.post(f"/tasks/{task_id}/approvals/{aids[0]}/decision", json={"approved": True})


def test_task_survives_reopen(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "persist me"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client2:
        body = client2.get(f"/tasks/{task_id}").json()
        assert body["prompt"] == "persist me"
        assert body["status"] == "paused"
        assert body["model"]
        assert body["routing"]


def test_checkpoints_record_milestones(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "checkpoint me"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
        labels = [c["label"] for c in client.get(f"/tasks/{task_id}/checkpoints").json()]
        assert "plan-ready" in labels
        manual = client.post(f"/tasks/{task_id}/checkpoints", json={"label": "reviewed"})
        assert manual.status_code == 201
        assert manual.json()["label"] == "reviewed"


def test_recovery_pauses_interrupted_tasks(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "interrupt me"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client2:
        assert client2.get(f"/tasks/{task_id}").json()["status"] == "paused"
        labels = [c["label"] for c in client2.get(f"/tasks/{task_id}/checkpoints").json()]
        assert "auto-recovery" in labels


def test_resume_continues_from_checkpoint(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "resume me"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client2:
        resumed = client2.post(f"/tasks/{task_id}/resume").json()
        assert resumed["status"] == "awaiting_approval"
        aids = [
            a["id"]
            for a in client2.get(f"/tasks/{task_id}/approvals").json()
            if a["status"] == "pending"
        ]
        assert len(aids) == 1  # gate reused, not duplicated
        client2.post(f"/tasks/{task_id}/approvals/{aids[0]}/decision", json={"approved": True})
        final = wait_for(client2, task_id, ("completed", "failed"), timeout=15.0)
        assert final["status"] == "completed"


def test_resume_does_not_duplicate_running(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "no dupes"}).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
        approve_gate(client, task_id)
        final = wait_for(client, task_id, ("completed", "failed"), timeout=15.0)
        assert final["status"] == "completed"
        assert len(client.get(f"/tasks/{task_id}/approvals").json()) == 1


def test_cancel_is_terminal(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        task_id = client.post("/tasks", json={"prompt": "cancel me"}).json()["id"]
        assert client.post(f"/tasks/{task_id}/cancel").json()["status"] == "cancelled"
        assert client.post(f"/tasks/{task_id}/resume").json()["status"] == "cancelled"


def test_db_file_created(tmp_path):
    import os

    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)):
        pass
    assert os.path.exists(str(tmp_path / "t.db"))


def test_completed_task_writes_task_memory(tmp_path):
    with make_client(tmp_path, provider=ScriptedMock(PLAN, ACTIONS)) as client:
        payload = {"prompt": "remember this", "project": "owl"}
        task_id = client.post("/tasks", json=payload).json()["id"]
        wait_for(client, task_id, ("awaiting_approval",))
        approve_gate(client, task_id)
        wait_for(client, task_id, ("completed",), timeout=15.0)
        mems = client.get("/memory", params={"project": "owl"}).json()
        assert any(m["category"] == "task" for m in mems)
        assert any(m["source"] == "project-summary:owl" for m in mems)
