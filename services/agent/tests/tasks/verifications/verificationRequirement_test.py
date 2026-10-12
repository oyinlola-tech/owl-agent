import json
import os
import sqlite3
import time

import pytest
from supports.taskClient_support import make_test_client
from supports.verificationDriver_support import (
    DONE,
    PY,
    RecordingProvider,
    approve_until_task_settles,
    build_fake_detector,
    create_file_action,
    fetch_task_detail,
    is_command_alive,
    list_pending_approvals,
    make_workspace_with_test,
    query_task_database,
    run_python_action,
    start_task_in_workspace,
    wait_for_pending_approval,
)

import app.requirements.requirementDetection_requirement as requirement_detection


def test_all_requirements_must_pass(tmp_path, monkeypatch):
    monkeypatch.setattr(
        requirement_detection,
        "detect_verification_requirements",
        build_fake_detector(
            ("typecheck", "pass", True), ("tests", "pass", True), ("build", "pass", True)
        ),
    )
    ws = tmp_path / "ws"
    ws.mkdir()
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("a.txt", "x")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "verified_completed"
        runs = fetch_task_detail(client, tid)["verifications"]
        assert [(r["kind"], r["status"]) for r in runs] == [
            ("typecheck", "passed"),
            ("tests", "passed"),
            ("build", "passed"),
        ]
        verify_approvals = [
            a for a in client.get(f"/tasks/{tid}/approvals").json() if a["action"] == "verify_run"
        ]
        assert len(verify_approvals) == 1, "one bound approval covers the attempt"
        assert verify_approvals[0]["consumed_at"], "the approval is consumed once used"


def test_one_required_failure_blocks_and_stops_later_checks(tmp_path, monkeypatch):
    monkeypatch.setattr(
        requirement_detection,
        "detect_verification_requirements",
        build_fake_detector(
            ("typecheck", "import sys; sys.exit(2)", True),
            ("tests", "pass", True),
            ("build", "pass", True),
        ),
    )
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider([create_file_action("a.txt", "x")])
    with make_test_client(tmp_path, provider=rec, max_verification_attempts=1) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "failed"
        runs = fetch_task_detail(client, tid)["verifications"]
        assert [(r["kind"], r["status"], r["exit_code"]) for r in runs] == [
            ("typecheck", "failed", 2)
        ], "tests and build must not run after a required failure"


def test_optional_lint_failure_does_not_block(tmp_path, monkeypatch):
    monkeypatch.setattr(
        requirement_detection,
        "detect_verification_requirements",
        build_fake_detector(("tests", "pass", True), ("lint", "import sys; sys.exit(1)", False)),
    )
    ws = tmp_path / "ws"
    ws.mkdir()
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("a.txt", "x")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "verified_completed"
        runs = {r["kind"]: r for r in fetch_task_detail(client, tid)["verifications"]}
        assert runs["lint"]["status"] == "failed" and runs["lint"]["required"] is False


def test_timeout_is_persisted_and_not_verified(tmp_path, monkeypatch):
    monkeypatch.setattr(
        requirement_detection,
        "detect_verification_requirements",
        build_fake_detector(("tests", "import time; time.sleep(5)", True)),
    )
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider([create_file_action("a.txt", "x")])
    with make_test_client(
        tmp_path, provider=rec, verify_timeout=1, max_verification_attempts=1
    ) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "failed"
        (run,) = fetch_task_detail(client, tid)["verifications"]
        assert run["status"] == "timeout" and run["exit_code"] is None
        assert "timed out" in run["error"]


def test_changed_command_does_not_satisfy_requirement(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(tmp_path, provider=RecordingProvider([])) as client:
        mgr = client.app.state.manager
        tid = start_task_in_workspace(client, ws)
        approve_until_task_settles(client, tid)
        (req,) = requirement_detection.detect_verification_requirements(str(ws)).requirements
        cwd = os.path.realpath(ws)
        insert = (
            "INSERT INTO verification_runs (id, task_id, requirement_id, kind, command_json,"
            " working_directory, status, exit_code, attempt, started_at, created_at)"
            " VALUES (?, ?, ?, 'tests', ?, ?, 'passed', 0, 9, ?, ?)"
        )
        future = "2999-01-01T00:00:00+00:00"
        other = json.dumps([PY, "-m", "pytest", "-q", "tests/test_other.py"])
        mgr.conn.execute(insert, ("r1", tid, req.id, other, cwd, future, future))
        mgr.conn.execute(
            insert, ("r2", tid, req.id, json.dumps(list(req.argv)), "/elsewhere", future, future)
        )
        mgr.conn.commit()
        assert mgr.find_passed_requirement_ids(tid, [req], "2000") == set()
        mgr.conn.execute(
            insert, ("r3", tid, req.id, json.dumps(list(req.argv)), cwd, future, future)
        )
        mgr.conn.commit()
        assert mgr.find_passed_requirement_ids(tid, [req], "2000") == {req.id}
        assert mgr.find_passed_requirement_ids(tid, [req], "3000") == set()


def test_cancel_during_verification_kills_process_and_never_verifies(tmp_path, monkeypatch):
    code = "import os, time; open('pid', 'w').write(str(os.getpid())); time.sleep(30)"
    monkeypatch.setattr(
        requirement_detection,
        "detect_verification_requirements",
        build_fake_detector(("tests", code, True)),
    )
    ws = tmp_path / "ws"
    ws.mkdir()
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("a.txt", "x")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        end = time.time() + 20
        while not (ws / "pid").exists() and time.time() < end:
            for a in list_pending_approvals(client, tid):
                client.post(f"/tasks/{tid}/approvals/{a['id']}/decision", json={"approved": True})
            time.sleep(0.05)
        while not (ws / "pid").read_text() and time.time() < end:
            time.sleep(0.05)
        assert client.post(f"/tasks/{tid}/cancel").json()["status"] == "cancelled"
        (run,) = fetch_task_detail(client, tid)["verifications"]
        assert run["status"] == "cancelled"
        assert client.get(f"/tasks/{tid}").json()["verified_at"] is None
    end = time.time() + 3
    while is_command_alive(code) and time.time() < end:
        time.sleep(0.05)
    assert not is_command_alive(code), "verification process survived cancellation"


def test_restart_mid_verification_recovers_safely(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        wait_for_pending_approval(client, tid, "verify_run")
    conn = sqlite3.connect(str(tmp_path / "t.db"))
    conn.execute(
        "INSERT INTO verification_runs (id, task_id, requirement_id, kind, command_json,"
        " working_directory, status, attempt, started_at, created_at)"
        " VALUES ('ghost', ?, 'req-x', 'tests', '[]', ?, 'running', 1, ?, ?)",
        (tid, str(ws), "2999-01-01T00:00:00+00:00", "2999-01-01T00:00:00+00:00"),
    )
    conn.commit()
    conn.close()
    with make_test_client(tmp_path, provider=RecordingProvider([])) as client:
        assert client.get(f"/tasks/{tid}").json()["status"] == "paused"
        ghost = query_task_database(
            tmp_path, "SELECT status FROM verification_runs WHERE id='ghost'"
        )
        assert ghost[0]["status"] == "interrupted"
        client.post(f"/tasks/{tid}/resume")
        time.sleep(0.5)
        assert len(list_pending_approvals(client, tid, "verify_run")) == 1
        assert approve_until_task_settles(client, tid) == "verified_completed"
        statuses = sorted(r["status"] for r in fetch_task_detail(client, tid)["verifications"])
        assert statuses == ["interrupted", "passed"]
        assert (
            len(
                [
                    a
                    for a in client.get(f"/tasks/{tid}/approvals").json()
                    if a["action"] == "verify_run"
                ]
            )
            == 1
        )


def test_no_transient_paused_while_waiting_for_approval(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        seen = set()
        end = time.time() + 15
        while time.time() < end:
            status = client.get(f"/tasks/{tid}").json()["status"]
            seen.add(status)
            if status in DONE:
                break
            for a in list_pending_approvals(client, tid):
                client.post(f"/tasks/{tid}/approvals/{a['id']}/decision", json={"approved": True})
        assert "paused" not in seen, seen
        assert status == "verified_completed"


def test_exec_run_records_real_exit_code(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider([run_python_action("import sys; sys.exit(3)")])
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        approve_until_task_settles(client, tid)
        calls = [
            c for c in client.get(f"/tasks/{tid}/tool-calls").json() if c["tool"] == "exec_run"
        ]
        assert calls and calls[0]["exit_code"] == 3


@pytest.mark.parametrize("event", ["verification.started", "verification.completed"])
def test_verification_events_published(tmp_path, event):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "verified_completed"
        bus = client.app.state.manager.bus
        types = [e.type for e in bus.list_recent_events(tid, limit=200)]
        assert event in types
