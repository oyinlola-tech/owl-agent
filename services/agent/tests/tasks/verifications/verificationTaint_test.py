import json
from datetime import datetime

from supports.taskClient_support import make_test_client
from supports.verificationDriver_support import (
    BAD,
    RecordingProvider,
    approve_until_task_settles,
    create_file_action,
    decline_approval,
    fetch_task_detail,
    make_workspace_with_test,
    query_task_database,
    run_python_action,
    start_task_in_workspace,
    wait_for_pending_approval,
)


def find_plan_requirement(client, tid, kind):
    return next(
        r
        for r in fetch_task_detail(client, tid)["verification"]["requirements"]
        if r["kind"] == kind
    )


def insert_journal_entry(mgr, tid, path, before):
    mgr.conn.execute(
        "INSERT INTO change_journal (id, task_id, path, before_text, after_text, approval_id,"
        " applied_at) VALUES (?, ?, ?, ?, '', '', ?)",
        (f"chg-{path}-{len(before)}", tid, path, before, datetime.now().isoformat()),
    )
    mgr.conn.commit()


def test_task_written_package_scripts_taint_the_check(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    pkg = json.dumps({"scripts": {"test": "echo ok"}})
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("package.json", pkg)])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        (appr,) = wait_for_pending_approval(client, tid, "verify_run")
        assert appr["reason"].startswith("Check carefully")
        assert "package.json" in appr["reason"]
        assert "npm run test  ->  echo ok" in appr["command"]
        assert find_plan_requirement(client, tid, "tests")["tainted_by"] == ["package.json"]
        decline_approval(client, tid, appr)


def test_task_written_conftest_taints_pytest(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider(
        [create_file_action("conftest.py", "collect_ignore = ['test_calc.py']\n")]
    )
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        (appr,) = wait_for_pending_approval(client, tid, "verify_run")
        assert appr["reason"].startswith("Check carefully")
        assert find_plan_requirement(client, tid, "tests")["tainted_by"] == ["conftest.py"]
        decline_approval(client, tid, appr)


def test_untainted_check_has_plain_reason(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    with make_test_client(
        tmp_path, provider=RecordingProvider([create_file_action("mult.py")])
    ) as client:
        tid = start_task_in_workspace(client, ws)
        (appr,) = wait_for_pending_approval(client, tid, "verify_run")
        assert appr["reason"].startswith("Independent verification")
        assert find_plan_requirement(client, tid, "tests")["tainted_by"] == []
        decline_approval(client, tid, appr)


def test_package_json_dependency_change_is_not_taint(tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    old = {"scripts": {"test": "jest"}, "dependencies": {}}
    new = {"scripts": {"test": "jest"}, "dependencies": {"left-pad": "1.3.0"}}
    (ws / "package.json").write_text(json.dumps(new))
    with make_test_client(tmp_path, provider=RecordingProvider([])) as client:
        mgr = client.app.state.manager
        tid = start_task_in_workspace(client, ws)
        approve_until_task_settles(client, tid)
        insert_journal_entry(mgr, tid, "package.json", json.dumps(old))
        assert mgr.list_changed_workspace_paths(tid, str(ws)) == []
        (ws / "package.json").write_text(json.dumps({**new, "scripts": {"test": "echo ok"}}))
        assert mgr.list_changed_workspace_paths(tid, str(ws)) == ["package.json"]


def test_done_without_a_fix_does_not_rerun_but_spends_budget(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    rec = RecordingProvider([create_file_action("mult.py", BAD)])
    with make_test_client(tmp_path, provider=rec, max_verification_attempts=3) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "failed"
        runs = fetch_task_detail(client, tid)["verifications"]
        assert [r["status"] for r in runs] == ["failed"], "identical command must not rerun"
        row = query_task_database(
            tmp_path, "SELECT verification_attempts FROM tasks WHERE id = ?", (tid,)
        )
        assert row[0]["verification_attempts"] == 3
    fix_prompts = [p for p in rec.prompts if "Current step: Fix failing tests" in p]
    assert len(fix_prompts) == 2
    assert all("UNTRUSTED TOOL OUTPUT" in p and "assert 7 == 12" in p for p in fix_prompts)


def test_fix_step_accepts_several_actions_before_reverifying(tmp_path):
    ws = make_workspace_with_test(tmp_path)
    fix = run_python_action(
        "open('mult.py', 'w').write('def multiply(a, b):\\n    return a * b\\n')"
    )
    rec = RecordingProvider(
        [
            create_file_action("mult.py", BAD),
            {"tool": "fs_read", "args": {"path": "mult.py"}, "why": "look first"},
            fix,
            {"done": True, "summary": "fixed"},
        ]
    )
    with make_test_client(tmp_path, provider=rec) as client:
        tid = start_task_in_workspace(client, ws)
        assert approve_until_task_settles(client, tid) == "verified_completed"
        runs = fetch_task_detail(client, tid)["verifications"]
        assert [r["status"] for r in runs] == ["failed", "passed"]
        tools = [c["tool"] for c in client.get(f"/tasks/{tid}/tool-calls").json()]
        assert tools == ["fs_create", "fs_read", "exec_run"]
        fix_step = next(s for s in fetch_task_detail(client, tid)["steps"] if s.get("until_done"))
        assert fix_step["status"] == "done"
    assert len([p for p in rec.prompts if "Current step: Fix failing" in p]) == 3
