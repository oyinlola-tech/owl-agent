from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time

import httpx
from fastapi.testclient import TestClient
from scenarioHarness_e2e import (
    AGENT_DIR,
    SERVER_SCRIPT,
    TEST_ADD,
    TEST_SLOW,
    approve_until_task_settles,
    create_disposable_workspace,
    list_verification_runs,
    print_verification_runs,
    register_scenario,
)
from supports.scriptedProvider_support import ScriptedProvider, build_e2e_app


def find_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def list_processes_in_workspace(ws: str) -> list[int]:
    found = []
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            if os.path.realpath(os.readlink(f"/proc/{pid}/cwd")) == ws:
                found.append(int(pid))
        except OSError:
            continue
    return found


def start_server_and_kill_mid_verification(ws: str, db: str) -> str:
    port = find_free_port()
    server = subprocess.Popen(
        [sys.executable, SERVER_SCRIPT, db, ws, str(port)],
        cwd=AGENT_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:
                if httpx.get(f"{base}/health", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.1)
        api = httpx.Client(base_url=base, timeout=10)
        tid = api.post("/tasks", json={"prompt": "add add()", "workspace": ws}).json()["id"]
        end = time.time() + 60
        running = None
        while time.time() < end and running is None:
            for a in api.get(f"/tasks/{tid}/approvals").json():
                if a["status"] == "pending":
                    api.post(f"/tasks/{tid}/approvals/{a['id']}/decision", json={"approved": True})
            running = next(
                (r for r in list_verification_runs(api, tid) if r["status"] == "running"), None
            )
            time.sleep(0.1)
        assert running, "verification never started"
        print(f"    verification running: {' '.join(running['command'])}; sending SIGKILL")
    finally:
        server.send_signal(signal.SIGKILL)
        server.wait(timeout=10)
    return tid


@register_scenario("C  SIGKILL mid-verification -> interrupted, not verified -> resume -> verified")
def verify_crash_recovery():
    ws = create_disposable_workspace({"test_calc.py": TEST_SLOW})
    db = os.path.join(os.path.dirname(ws), "owl.db")
    tid = start_server_and_kill_mid_verification(ws, db)
    before_restart = list_processes_in_workspace(ws)
    print(f"    after SIGKILL: {len(before_restart)} check process(es) still running")

    with open(os.path.join(ws, "test_calc.py"), "w", encoding="utf-8") as fh:
        fh.write(TEST_ADD)
    provider = ScriptedProvider(["Implement add"], lambda p, s: {"done": True, "summary": "done"})
    app2 = build_e2e_app(db, ws, provider)
    leftover: list[int] = []
    for _ in range(20):
        leftover = list_processes_in_workspace(ws)
        if not leftover:
            break
        time.sleep(0.1)
    for pid in leftover:
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            pass
    assert not leftover, f"recover() left {len(leftover)} orphaned check process(es)"
    with TestClient(app2) as api2:
        rows = list_verification_runs(api2, tid)
        print_verification_runs(rows)
        assert rows and rows[-1]["status"] == "interrupted", rows
        after = api2.get(f"/tasks/{tid}").json()
        assert after["status"] == "paused", after
        assert not api2.get(f"/tasks/{tid}/detail").json()["verification"]["verified"]
        api2.post(f"/tasks/{tid}/resume")
        seen = approve_until_task_settles(api2, tid)
        rows = list_verification_runs(api2, tid)
        print_verification_runs(rows)
        assert seen["final"] == "verified_completed", seen
        assert rows[-1]["status"] == "passed"
    return (
        f"{len(before_restart)} orphan(s) after crash, 0 after recover(); "
        f"paused -> {' -> '.join(seen['statuses'])}"
    )
