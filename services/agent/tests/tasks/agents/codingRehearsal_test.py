import subprocess
import sys
import time

from supports.taskClient_support import ScriptedMockProvider, make_test_client

MULT = "def multiply(a, b):\n    return a * b\n"
TEST = "from mult import multiply\n\n\ndef test_multiply():\n    assert multiply(3, 4) == 12\n"

SCRIPT = [
    {"tool": "fs_list", "args": {"path": "."}, "why": "inspect"},
    {"tool": "fs_read", "args": {"path": "test_calc.py"}, "why": "read failing test"},
    {
        "tool": "fs_create",
        "args": {"path": "mult.py", "content": MULT},
        "why": "implement multiply",
    },
    {
        "tool": "exec_run",
        "args": {"argv": [sys.executable, "-m", "pytest", "-q"], "cwd": "."},
        "why": "run project tests",
    },
    {"done": True, "summary": "multiply implemented, tests green"},
]


def approve_until_terminal_state(client, task_id, timeout=40.0):
    end = time.time() + timeout
    while time.time() < end:
        state = client.get(f"/tasks/{task_id}").json()["status"]
        if state in ("completed_unverified", "verified_completed", "failed", "cancelled"):
            return state
        for approval in client.get(f"/tasks/{task_id}/approvals").json():
            if approval["status"] == "pending":
                client.post(
                    f"/tasks/{task_id}/approvals/{approval['id']}/decision",
                    json={"approved": True},
                )
        time.sleep(0.2)
    raise AssertionError("task never reached a terminal state")


def test_full_coding_task_rehearsal(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "test_calc.py").write_text(TEST)
    plan = ["Inspect project", "Implement multiply", "Run tests", "Report"]
    with make_test_client(tmp_path, provider=ScriptedMockProvider(plan, list(SCRIPT))) as client:
        task_id = client.post(
            "/tasks", json={"prompt": "Add multiply so the failing test passes"}
        ).json()["id"]
        assert approve_until_terminal_state(client, task_id) == "completed_unverified"

        assert (ws / "mult.py").read_text() == MULT

        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", str(ws)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert proc.returncode == 0, proc.stdout + proc.stderr

        journal = client.get(f"/tasks/{task_id}/journal").json()
        assert any(j["path"] == "mult.py" and not j["reverted_at"] for j in journal)
        labels = [c["label"] for c in client.get(f"/tasks/{task_id}/checkpoints").json()]
        assert "plan-ready" in labels and "final" in labels
        usage = client.get("/usage", params={"task_id": task_id}).json()
        assert usage
        task_detail = client.get(f"/tasks/{task_id}/detail").json()
        assert task_detail["task"]["model"]
        assert task_detail["task"]["routing"]
        assert any(
            c["tool"] == "exec_run" and c["status"] == "ok" for c in task_detail["tool_calls"]
        )
