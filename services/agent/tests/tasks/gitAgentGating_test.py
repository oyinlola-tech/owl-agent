import subprocess

from supports.taskClient_support import ScriptedMockProvider, make_test_client, wait_for_task_status

GIT_ENV = {"PATH": "/usr/bin:/bin", "GIT_TEMPLATE_DIR": ""}
IDENTITY = ["-c", "user.email=t@t", "-c", "user.name=t"]
SETTLED = ("completed_unverified", "verified_completed", "failed", "paused")


def init_repo(path):
    path.mkdir(exist_ok=True)
    subprocess.run(["git", "-C", str(path), "init", "-q", "-b", "main"], check=True, env=GIT_ENV)
    (path / "a.txt").write_text("one\n")
    subprocess.run(["git", "-C", str(path), "add", "a.txt"], check=True, env=GIT_ENV)
    subprocess.run(
        ["git", "-C", str(path), *IDENTITY, "commit", "-q", "-m", "base"], check=True, env=GIT_ENV
    )


def pending_approval(client, task_id):
    pending = [
        a for a in client.get(f"/tasks/{task_id}/approvals").json() if a["status"] == "pending"
    ]
    assert pending, "expected a pending approval"
    return pending[-1]


def drive_until_pending(client, prompt, tool, args):
    task_id = client.post("/tasks", json={"prompt": prompt}).json()["id"]
    wait_for_task_status(client, task_id, ("awaiting_approval",), timeout=10.0)
    return task_id


def test_create_branch_is_gated_low_and_runs_after_approval(tmp_path):
    ws = tmp_path / "ws"
    init_repo(ws)
    script = [
        {"tool": "git_create_branch", "args": {"path": ".", "name": "feature-x"}, "why": "branch"},
        {"done": True, "summary": "branched"},
    ]
    with make_test_client(
        tmp_path, provider=ScriptedMockProvider(["Branch"], script), workspace=str(ws)
    ) as client:
        task_id = drive_until_pending(client, "make a branch", "git_create_branch", {})
        approval = pending_approval(client, task_id)
        assert approval["action"] == "git_create_branch"
        assert approval["risk"] == "Low"
        client.post(
            f"/tasks/{task_id}/approvals/{approval['id']}/decision", json={"approved": True}
        )
        wait_for_task_status(client, task_id, SETTLED, timeout=15.0)
        branches = subprocess.run(
            ["git", "-C", str(ws), "branch"], capture_output=True, text=True, env=GIT_ENV
        ).stdout
        assert "feature-x" in branches


def test_merge_is_gated_medium(tmp_path):
    ws = tmp_path / "ws"
    init_repo(ws)
    script = [{"tool": "git_merge", "args": {"path": ".", "ref": "feature"}, "why": "merge"}]
    with make_test_client(
        tmp_path, provider=ScriptedMockProvider(["Merge"], script), workspace=str(ws)
    ) as client:
        task_id = drive_until_pending(client, "merge feature", "git_merge", {})
        approval = pending_approval(client, task_id)
        assert approval["action"] == "git_merge" and approval["risk"] == "Medium"


def test_pull_is_gated_with_network(tmp_path):
    ws = tmp_path / "ws"
    init_repo(ws)
    script = [{"tool": "git_pull", "args": {"path": ".", "remote": "origin"}, "why": "pull"}]
    with make_test_client(
        tmp_path, provider=ScriptedMockProvider(["Pull"], script), workspace=str(ws)
    ) as client:
        task_id = drive_until_pending(client, "pull latest", "git_pull", {})
        approval = pending_approval(client, task_id)
        assert approval["action"] == "git_pull"
        assert approval["network"] is True
        assert "with network access" in approval["title"]


def test_force_delete_branch_is_high_risk(tmp_path):
    ws = tmp_path / "ws"
    init_repo(ws)
    script = [
        {
            "tool": "git_delete_branch",
            "args": {"path": ".", "name": "stale", "force": True},
            "why": "delete",
        }
    ]
    with make_test_client(
        tmp_path, provider=ScriptedMockProvider(["Delete"], script), workspace=str(ws)
    ) as client:
        task_id = drive_until_pending(client, "force delete", "git_delete_branch", {})
        approval = pending_approval(client, task_id)
        assert approval["action"] == "git_delete_branch" and approval["risk"] == "High"
