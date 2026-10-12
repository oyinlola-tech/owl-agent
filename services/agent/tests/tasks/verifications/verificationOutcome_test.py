import os

from supports.taskClient_support import make_test_client
from supports.verificationDriver_support import (
    BAD,
    DONE,
    GOOD,
    PY,
    RecordingProvider,
    approve_until_task_settles,
    create_file_action,
    fetch_task_detail,
    make_workspace_with_test,
    query_task_database,
    run_python_action,
    start_task_in_workspace,
    wait_for_pending_approval,
)


def test_real_passing_test_is_verified_with_exact_record(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "verified_completed"
        d = fetch_task_detail(client, tid)
        (run,) = d["verifications"]
        assert run["status"] == "passed" and run["exit_code"] == 0
        assert run["command"] == [PY, "-m", "pytest", "-q"]
        assert run["working_directory"] == os.path.realpath(ws)
        req = d["verification"]["requirements"][0]
        assert run["requirement_id"] == req["id"] and req["argv"] == run["command"]
        assert d["verification"]["verified"] is True and d["verification"]["verified_at"]
        assert client.get(f"/tasks/{tid}").json()["verified_at"]


def test_model_claim_without_runtime_run_is_not_verified(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider(
        [create_file_action("mult.py")], claim="All tests passed, I verified everything."
    )
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        (appr,) = wait_for_pending_approval(client, tid, "verify_run")
        client.post(f"/tasks/{tid}/approvals/{appr['id']}/decision", json={"approved": False})
        assert (
            approve_until_task_settles(client, tid, approve=False, stop=("paused",) + DONE)
            == "paused"
        )
        assert fetch_task_detail(client, tid)["verifications"] == []
        row = query_task_database(
            tmp_path, "SELECT verification_attempts, status FROM tasks WHERE id=?", (tid,)
        )
        assert row[0]["verification_attempts"] == 0, "a declined run must not burn an attempt"
        assert "declined" in client.get(f"/tasks/{tid}").json()["verification_note"]


def test_no_detected_command_is_completed_unverified(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider([create_file_action("notes.txt", "hello")], claim="Tests passed.")
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "completed_unverified"
        task = client.get(f"/tasks/{tid}").json()
        assert "No reliable project verification command" in task["verification_note"]
        assert task["verified_at"] is None
        assert fetch_task_detail(client, tid)["verifications"] == []


def test_no_changes_is_completed_unverified_without_approvals(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider([{"tool": "fs_read", "args": {"path": "test_calc.py"}, "why": "read"}])
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid, approve=False) == "completed_unverified"
        assert "nothing to verify" in client.get(f"/tasks/{tid}").json()["verification_note"]
        assert client.get(f"/tasks/{tid}/approvals").json() == []


def test_model_invented_verification_does_not_count(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    rec = RecordingProvider(
        [create_file_action("notes.txt", "x"), run_python_action("print('5 passed in 0.1s')")],
        plan=("Write", "Test"),
        claim="All 5 tests passed.",
    )
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "completed_unverified"
        assert fetch_task_detail(client, tid)["verifications"] == []


def test_model_run_of_the_real_command_still_reverified_by_runtime(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider(
        [
            create_file_action("mult.py"),
            {"tool": "exec_run", "args": {"argv": [PY, "-m", "pytest", "-q"]}},
        ],
        plan=("Write", "Test"),
    )
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        wait_for_pending_approval(client, tid, "verify_run")
        assert approve_until_task_settles(client, tid) == "verified_completed"
        assert len(fetch_task_detail(client, tid)["verifications"]) == 1


def test_failure_goes_back_as_untrusted_observation_then_fix_verifies(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    fix = run_python_action(f"open('mult.py', 'w').write({GOOD!r})")
    rec = RecordingProvider([create_file_action("mult.py", BAD), fix])
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "verified_completed"
        runs = fetch_task_detail(client, tid)["verifications"]
        assert [r["status"] for r in runs] == ["failed", "passed"]
        assert runs[0]["exit_code"] != 0 and "assert 7 == 12" in runs[0]["stdout"]
        assert [r["attempt"] for r in runs] == [1, 2]
        steps = [s["title"] for s in fetch_task_detail(client, tid)["steps"]]
        assert any(t.startswith("Fix failing tests") for t in steps)
    fix_prompt = next(p for p in rec.prompts if "Fix failing tests" in p)
    assert "UNTRUSTED TOOL OUTPUT" in fix_prompt
    assert "assert 7 == 12" in fix_prompt


def test_retry_budget_fails_task_and_resume_resets_it(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider([create_file_action("mult.py", BAD)])
    with make_test_client(tmp_path, provider=rec, max_verification_attempts=2) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "failed"
        task = client.get(f"/tasks/{tid}").json()
        assert "after 2 attempts" in task["verification_note"]
        assert [r["status"] for r in fetch_task_detail(client, tid)["verifications"]] == ["failed"]
        assert task["status"] == "failed"
        client.post(f"/tasks/{tid}/resume")
        assert approve_until_task_settles(client, tid) == "failed"
        runs = fetch_task_detail(client, tid)["verifications"]
        assert [r["status"] for r in runs] == ["failed", "failed"]
        assert [r["attempt"] for r in runs] == [1, 2]
