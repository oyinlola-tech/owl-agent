import subprocess

from supports.taskClient_support import ScriptedMockProvider, make_test_client

GIT_ENV = {"PATH": "/usr/bin:/bin", "GIT_TEMPLATE_DIR": ""}
IDENTITY = ["-c", "user.email=t@t", "-c", "user.name=t"]


def init_repo(path):
    subprocess.run(["git", "-C", str(path), "init", "-q", "-b", "main"], check=True, env=GIT_ENV)
    (path / "a.txt").write_text("one\n")
    subprocess.run(["git", "-C", str(path), "add", "a.txt"], check=True, env=GIT_ENV)
    subprocess.run(
        ["git", "-C", str(path), *IDENTITY, "commit", "-q", "-m", "base"], check=True, env=GIT_ENV
    )


def add_project(client, path):
    res = client.post("/projects", json={"path": str(path), "name": "repo"})
    assert res.status_code in (200, 201), res.text
    return res.json()["project"]["id"]


def test_list_create_and_switch_branches(tmp_path):
    ws = tmp_path / "ws"
    with make_test_client(
        tmp_path,
        provider=ScriptedMockProvider(["x"], []),
        workspace=str(ws),
        data_dir=str(tmp_path / "data"),
    ) as client:
        init_repo(ws)
        pid = add_project(client, ws)
        listed = client.get(f"/projects/{pid}/git/branches").json()
        assert listed["current"] == "main"
        created = client.post(f"/projects/{pid}/git/branches", json={"name": "feature-1"})
        assert created.status_code == 200, created.text
        assert created.json()["created"] is True
        switched = client.post(f"/projects/{pid}/git/checkout", json={"ref": "feature-1"})
        assert switched.status_code == 200, switched.text
        assert switched.json()["ref"] == "feature-1"
        now = client.get(f"/projects/{pid}/git/branches").json()
        assert now["current"] == "feature-1"


def test_create_branch_rejects_option_like_name(tmp_path):
    ws = tmp_path / "ws"
    with make_test_client(
        tmp_path,
        provider=ScriptedMockProvider(["x"], []),
        workspace=str(ws),
        data_dir=str(tmp_path / "data"),
    ) as client:
        init_repo(ws)
        pid = add_project(client, ws)
        res = client.post(f"/projects/{pid}/git/branches", json={"name": "-rf"})
        assert res.status_code == 422


def test_checkout_refuses_dirty_tree_without_confirm(tmp_path):
    ws = tmp_path / "ws"
    with make_test_client(
        tmp_path,
        provider=ScriptedMockProvider(["x"], []),
        workspace=str(ws),
        data_dir=str(tmp_path / "data"),
    ) as client:
        init_repo(ws)
        pid = add_project(client, ws)
        client.post(f"/projects/{pid}/git/branches", json={"name": "other"})
        (ws / "a.txt").write_text("dirty\n")
        blocked = client.post(f"/projects/{pid}/git/checkout", json={"ref": "other"})
        assert blocked.status_code == 502
        forced = client.post(
            f"/projects/{pid}/git/checkout", json={"ref": "other", "confirm_discard": True}
        )
        assert forced.status_code == 200, forced.text
