from __future__ import annotations

import os
import tempfile
import time
import traceback

from fastapi.testclient import TestClient
from supports.scriptedProvider_support import ScriptedProvider, build_e2e_app, open_e2e_client

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT_DIR = os.path.dirname(os.path.dirname(HERE))
SERVER_SCRIPT = os.path.join(HERE, "supports", "e2eServer_support.py")

TEST_ADD = "from calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n"
TEST_SLOW = (
    "import time\n\nfrom calc import add\n\n\ndef test_add():\n"
    "    time.sleep(30)\n    assert add(2, 3) == 5\n"
)
CALC_WRONG = "def add(a, b):\n    return a - b\n"

results: list[tuple[str, bool, str]] = []
created_roots: list[str] = []


def create_disposable_workspace(files: dict[str, str]) -> str:
    root = tempfile.mkdtemp(prefix="owl-e2e-")
    created_roots.append(root)
    ws = os.path.join(root, "ws")
    os.makedirs(ws)
    for name, body in files.items():
        with open(os.path.join(ws, name), "w", encoding="utf-8") as fh:
            fh.write(body)
    return os.path.realpath(ws)


def read_task_status(api, task_id: str) -> str:
    return api.get(f"/tasks/{task_id}").json()["status"]


def approve_until_task_settles(
    api, task_id: str, *, approve_verify=True, timeout=90.0, stop_on=()
) -> dict:
    seen = {"verify_requests": 0, "statuses": []}
    end = time.time() + timeout
    terminal = {"verified_completed", "completed_unverified", "failed", "cancelled", "paused"}
    while time.time() < end:
        state = read_task_status(api, task_id)
        if not seen["statuses"] or seen["statuses"][-1] != state:
            seen["statuses"].append(state)
        if state in terminal or state in stop_on:
            seen["final"] = state
            return seen
        for a in api.get(f"/tasks/{task_id}/approvals").json():
            if a["status"] != "pending":
                continue
            is_verify = a.get("action") == "verify_run"
            if is_verify:
                seen["verify_requests"] += 1
                assert read_task_status(api, task_id) != "verified_completed"
            api.post(
                f"/tasks/{task_id}/approvals/{a['id']}/decision",
                json={"approved": approve_verify or not is_verify},
            )
        time.sleep(0.1)
    raise AssertionError(f"task {task_id} never settled; saw {seen['statuses']}")


def list_verification_runs(api, task_id: str) -> list[dict]:
    return api.get(f"/tasks/{task_id}/detail").json()["verifications"]


def print_verification_runs(rows: list[dict]) -> None:
    for r in rows:
        print(
            f"    attempt {r['attempt']} {r['kind']:<9} {r['status']:<11} "
            f"exit={r['exit_code']!s:<4} {r['duration_ms']!s:>6}ms  "
            f"{' '.join(r['command'])}  (cwd {r['working_directory']})"
        )


def register_scenario(name: str):
    def wrap_scenario(fn):
        def run_and_record():
            print(f"\n== {name}")
            try:
                note = fn() or ""
                results.append((name, True, note))
                print(f"   PASS {note}")
            except Exception as exc:  # noqa: BLE001 - report every failure, keep going
                traceback.print_exc()
                results.append((name, False, f"{type(exc).__name__}: {exc}"))
                print(f"   FAIL {exc}")

        return run_and_record

    return wrap_scenario


def build_test_client(ws: str, provider: ScriptedProvider, **extra) -> tuple[TestClient, str]:
    db = os.path.join(os.path.dirname(ws), "owl.db")
    return open_e2e_client(build_e2e_app(db, ws, provider, **extra)), db
