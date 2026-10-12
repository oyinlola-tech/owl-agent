import asyncio
import json
import os
import signal
import subprocess
import time
from datetime import datetime

from supports.taskClient_support import make_test_client
from supports.verificationDriver_support import (
    PY,
    RecordingProvider,
    approve_until_task_settles,
    build_fake_detector,
    create_file_action,
    decline_approval,
    fetch_task_detail,
    is_command_alive,
    is_process_alive,
    list_pending_approvals,
    make_workspace_with_test,
    query_task_database,
    run_python_action,
    start_task_in_workspace,
    wait_for_pending_approval,
)

import app.requirements.requirementDetection_requirement as requirement_detection
from app.executors.commandExecutor_executor import CommandExecutor
from app.guards.environmentScrub_guard import build_environment_without_secrets
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.requirements.verificationRequirement_requirement import (
    DetectionResult,
    VerificationRequirement,
)


def wait_until_process_dead(pid: int, timeout: float = 3.0) -> bool:
    end = time.time() + timeout
    while is_process_alive(pid) and time.time() < end:
        time.sleep(0.05)
    return not is_process_alive(pid)


def insert_orphaned_run(mgr, run_id, pid, argv):
    mgr.conn.execute(
        "INSERT INTO verification_runs (id, task_id, requirement_id, kind, command_json,"
        " working_directory, status, attempt, started_at, created_at, pid)"
        " VALUES (?, 'task-x', 'req-x', 'tests', ?, '.', 'running', 1, '2000', '2000', ?)",
        (run_id, json.dumps(argv), pid),
    )
    mgr.conn.commit()


def test_cancel_kills_only_the_cancelled_tasks_process(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()

    def sleeping_command_code(name):
        return f"import os, time; open('{name}', 'w').write(str(os.getpid())); time.sleep(30)"

    def sleeping_command_action(name):
        return run_python_action(sleeping_command_code(name))

    def wait_until_command_dead(name):
        end = time.time() + 3
        while is_command_alive(sleeping_command_code(name)) and time.time() < end:
            time.sleep(0.05)
        return not is_command_alive(sleeping_command_code(name))

    def wait_for_started_pid(tid, name):
        end = time.time() + 15
        while time.time() < end:
            for a in list_pending_approvals(client, tid):
                client.post(f"/tasks/{tid}/approvals/{a['id']}/decision", json={"approved": True})
            if (ws / name).exists() and (ws / name).read_text():
                return int((ws / name).read_text())
            time.sleep(0.05)
        raise AssertionError(f"{name} never started")

    rec = RecordingProvider([sleeping_command_action("a.pid"), sleeping_command_action("b.pid")])
    with make_test_client(tmp_path, provider=rec) as client:
        task_a = start_task_in_workspace(client, ws, "task a")
        wait_for_started_pid(task_a, "a.pid")
        task_b = start_task_in_workspace(client, ws, "task b")
        wait_for_started_pid(task_b, "b.pid")
        client.post(f"/tasks/{task_a}/cancel")
        assert wait_until_command_dead("a.pid"), "cancelled task's process survived"
        assert is_command_alive(sleeping_command_code("b.pid")), (
            "cancelling one task killed another task's process"
        )
        client.post(f"/tasks/{task_b}/cancel")
        assert wait_until_command_dead("b.pid")


def test_huge_output_is_capped_without_hanging(tmp_path):
    svc = CommandExecutor(
        WorkspaceAccessGuard.from_comma_separated_roots(str(tmp_path)), output_limit=1000
    )
    code = "import sys; sys.stdout.write('x' * 5_000_000); sys.stderr.write('y' * 3_000_000)"
    began = time.monotonic()
    res = asyncio.run(svc.run_command("t", [PY, "-c", code], str(tmp_path), timeout=30))
    assert time.monotonic() - began < 15
    assert res["exit_code"] == 0 and res["truncated"] is True
    marker = "\n…[truncated at 1000 chars]"
    assert res["stdout"] == "x" * 1000 + marker
    assert res["stderr"] == "y" * 1000 + marker


def test_expired_verification_request_pauses_task(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        mgr = client.app.state.manager
        tid = start_task_in_workspace(client, ws)
        (appr,) = wait_for_pending_approval(client, tid, "verify_run")
        mgr.conn.execute(
            "UPDATE approvals SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = ?",
            (appr["id"],),
        )
        mgr.conn.commit()
        assert approve_until_task_settles(client, tid, approve=False, stop=("paused",)) == "paused"
        task = client.get(f"/tasks/{tid}").json()
        assert "expired before it was approved" in task["verification_note"]
        states = {a["id"]: a["status"] for a in client.get(f"/tasks/{tid}/approvals").json()}
        assert states[appr["id"]] == "expired"
        assert fetch_task_detail(client, tid)["verifications"] == []


def test_deciding_an_expired_approval_is_409(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        mgr = client.app.state.manager
        tid = start_task_in_workspace(client, ws)
        (appr,) = wait_for_pending_approval(client, tid, "fs_create")
        mgr.conn.execute(
            "UPDATE approvals SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = ?",
            (appr["id"],),
        )
        mgr.conn.commit()
        res = client.post(f"/tasks/{tid}/approvals/{appr['id']}/decision", json={"approved": True})
        assert res.status_code == 409
        states = {a["id"]: a["status"] for a in client.get(f"/tasks/{tid}/approvals").json()}
        assert states[appr["id"]] == "expired"
        assert not (ws / "mult.py").exists()
        end = time.time() + 10
        while time.time() < end and not list_pending_approvals(client, tid, "fs_create"):
            time.sleep(0.05)
        assert list_pending_approvals(client, tid, "fs_create")


def test_missing_toolchain_is_unverified_not_failed(tmp_path, monkeypatch):
    def detect(workspace, timeout=600.0):
        req = VerificationRequirement(
            kind="tests",
            argv=("definitely-not-installed-xyz", "test"),
            cwd=".",
            source="project_manifest",
            detail="test",
            timeout=timeout,
        )
        return DetectionResult([req])

    monkeypatch.setattr(requirement_detection, "detect_verification_requirements", detect)
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider([create_file_action("a.txt", "x")])
    with make_test_client(tmp_path, provider=rec, max_verification_attempts=1) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "completed_unverified"
        (run,) = fetch_task_detail(client, tid)["verifications"]
        assert run["status"] == "unavailable"
        task = client.get(f"/tasks/{tid}").json()
        assert "isn't installed" in task["verification_note"]
        steps = [s["title"] for s in fetch_task_detail(client, tid)["steps"]]
        assert not any(t.startswith("Fix failing") for t in steps), "nothing for the agent to fix"


def test_recovery_kills_matching_orphan_only(tmp_path):
    match = subprocess.Popen(["sleep", "30"], start_new_session=True)
    other = subprocess.Popen(["sleep", "31"], start_new_session=True)
    try:
        with make_test_client(tmp_path, provider=RecordingProvider([])) as client:
            mgr = client.app.state.manager
            insert_orphaned_run(mgr, "orphan-match", match.pid, ["sleep", "30"])
            insert_orphaned_run(mgr, "orphan-other", other.pid, ["sleep", "30"])
        with make_test_client(tmp_path, provider=RecordingProvider([])):
            pass
        end = time.time() + 3
        while match.poll() is None and time.time() < end:
            time.sleep(0.05)
        assert match.poll() is not None, "orphaned verification process survived recovery"
        assert other.poll() is None, "recovery killed a process that wasn't the recorded one"
        rows = query_task_database(tmp_path, "SELECT id, status FROM verification_runs ORDER BY id")
        assert {r["id"]: r["status"] for r in rows} == {
            "orphan-match": "interrupted",
            "orphan-other": "interrupted",
        }
    finally:
        for proc in (match, other):
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()


def test_clean_env_drops_credential_shaped_vars(monkeypatch):
    drop = {
        "GH_AUTH_HEADER": "Bearer x",
        "MY_COOKIE": "c",
        "XYZ_SESSION": "s",
        "GITHUB_PAT": "p",
        "PAT": "p",
        "DATABASE_URL": "postgres://user:hunter2@db.example/app",
        "REDIS_URL": "redis://default:pw@localhost:6379",
    }
    keep = {
        "PATTERN": "ok",
        "HOME_DIR": "/home/x",
        "SITE_URL": "https://example.com/path",
        "PROXY": "http://proxy:8080",
    }
    for k, v in {**drop, **keep}.items():
        monkeypatch.setenv(k, v)
    env = build_environment_without_secrets()
    for k in drop:
        assert k not in env, k
    for k, v in keep.items():
        assert env.get(k) == v, k


def test_resume_reruns_previously_passing_checks(tmp_path, monkeypatch):
    monkeypatch.setattr(
        requirement_detection,
        "detect_verification_requirements",
        build_fake_detector(("tests", "pass", True), ("build", "import sys; sys.exit(1)", True)),
    )
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider([create_file_action("a.txt", "x")])
    with make_test_client(tmp_path, provider=rec, max_verification_attempts=1) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "failed"
        client.post(f"/tasks/{tid}/resume")
        assert approve_until_task_settles(client, tid) == "failed"
        runs = fetch_task_detail(client, tid)["verifications"]
        passes = [r for r in runs if r["kind"] == "tests" and r["status"] == "passed"]
        assert len(passes) == 2, "a pass from before resume must not be reused"


def test_agent_approvals_use_configured_ttl(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider([create_file_action("mult.py")])
    with make_test_client(tmp_path, provider=rec, approval_ttl=120) as client:
        tid = start_task_in_workspace(client, ws)
        (tool_appr,) = wait_for_pending_approval(client, tid, "fs_create")
        client.post(f"/tasks/{tid}/approvals/{tool_appr['id']}/decision", json={"approved": True})
        (verify_appr,) = wait_for_pending_approval(client, tid, "verify_run")
        for appr in (tool_appr, verify_appr):
            created = datetime.fromisoformat(appr["created_at"])
            expires = datetime.fromisoformat(appr["expires_at"])
            assert abs((expires - created).total_seconds() - 120) < 2, appr["action"]
        decline_approval(client, tid, verify_appr)
