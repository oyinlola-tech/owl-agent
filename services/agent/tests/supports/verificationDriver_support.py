import json
import os
import sqlite3
import sys
import time

from app.requirements.verificationRequirement_requirement import (
    DetectionResult,
    VerificationRequirement,
)

PY = sys.executable
GOOD = "def multiply(a, b):\n    return a * b\n"
# Security: BAD differs in length from GOOD on purpose. Python's .pyc cache keys on
# mtime (seconds) + size, so a same-size rewrite within one second could import stale code.
BAD = "def multiply(a, b):\n    return a + b  # wrong\n"
TEST = "from mult import multiply\n\n\ndef test_multiply():\n    assert multiply(3, 4) == 12\n"
DONE = ("completed_unverified", "verified_completed", "failed", "cancelled")


class RecordingProvider:
    name = "mock"

    def __init__(self, actions, plan=("Implement",), claim="All tests passed."):
        self.plan = list(plan)
        self.actions = list(actions)
        self.claim = claim
        self.prompts: list[str] = []

    async def complete(self, messages, model=None):
        last = messages[-1]["content"] if messages else ""
        self.prompts.append(last)
        if "RETURN-JSON-PLAN" in last:
            return json.dumps({"plan": [{"title": t} for t in self.plan], "summary": "s"})
        if last.startswith("VERIFY"):
            return json.dumps({"done": True, "summary": self.claim})
        if self.actions:
            return json.dumps(self.actions.pop(0))
        return json.dumps({"done": True, "summary": "step done"})

    async def complete_stream(self, messages, model=None):
        yield await self.complete(messages, model)

    async def list_models(self):
        return ["mock-1"]

    def describe(self):
        return {"name": "mock", "configured": True, "model": "mock-1"}

    def pop_usage(self):
        return None


def create_file_action(path, content=GOOD):
    return {"tool": "fs_create", "args": {"path": path, "content": content}, "why": "impl"}


def run_python_action(code):
    return {"tool": "exec_run", "args": {"argv": [PY, "-c", code]}, "why": "run"}


def make_workspace_with_test(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir(exist_ok=True)
    (ws / "test_calc.py").write_text(TEST)
    return ws


def start_task_in_workspace(client, ws, prompt="add multiply"):
    return client.post("/tasks", json={"prompt": prompt, "workspace": str(ws)}).json()["id"]


def list_pending_approvals(client, tid, action=None):
    return [
        a
        for a in client.get(f"/tasks/{tid}/approvals").json()
        if a["status"] == "pending" and (action is None or a["action"] == action)
    ]


def approve_until_task_settles(client, tid, *, approve=True, stop=DONE, timeout=40.0):
    end = time.time() + timeout
    while time.time() < end:
        status = client.get(f"/tasks/{tid}").json()["status"]
        if status in stop:
            return status
        if approve:
            for a in list_pending_approvals(client, tid):
                client.post(f"/tasks/{tid}/approvals/{a['id']}/decision", json={"approved": True})
        time.sleep(0.05)
    raise AssertionError(f"task {tid} stuck at {client.get(f'/tasks/{tid}').json()['status']}")


def wait_for_pending_approval(client, tid, action, timeout=20.0):
    end = time.time() + timeout
    while time.time() < end:
        found = list_pending_approvals(client, tid, action)
        if found:
            return found
        approve_all_except(client, tid, action)
        time.sleep(0.05)
    raise AssertionError(f"no pending {action} approval")


def approve_all_except(client, tid, action):
    for a in list_pending_approvals(client, tid):
        if a["action"] != action:
            client.post(f"/tasks/{tid}/approvals/{a['id']}/decision", json={"approved": True})


def decline_approval(client, tid, approval):
    client.post(f"/tasks/{tid}/approvals/{approval['id']}/decision", json={"approved": False})


def fetch_task_detail(client, tid):
    return client.get(f"/tasks/{tid}/detail").json()


def query_task_database(tmp_path, sql, args=()):
    conn = sqlite3.connect(str(tmp_path / "t.db"))
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def build_fake_detector(*reqs):

    def detect(workspace, timeout=600.0):
        built = [
            VerificationRequirement(
                kind=kind,
                argv=(PY, "-c", code),
                cwd=".",
                source="project_configuration",
                detail="test",
                required=required,
                timeout=timeout,
            )
            for kind, code, required in reqs
        ]
        return DetectionResult(built)

    return detect


def is_process_alive(pid: int) -> bool:
    try:
        with open(f"/proc/{pid}/stat") as fh:
            return fh.read().split(")")[-1].split()[0] != "Z"
    except OSError:
        return False


def is_command_alive(command_text: str) -> bool:
    # Security: sandboxed commands run in their own pid namespace, so the pid they report
    # is not a host pid; find them by their command line instead.
    needle = command_text.encode()
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            with open(f"/proc/{entry}/cmdline", "rb") as fh:
                if needle not in fh.read():
                    continue
        except OSError:
            continue
        if is_process_alive(int(entry)):
            return True
    return False
