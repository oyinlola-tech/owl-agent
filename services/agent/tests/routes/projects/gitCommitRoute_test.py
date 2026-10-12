import subprocess

from supports.taskClient_support import make_test_client

GIT_ENV = {"PATH": "/usr/bin:/bin", "GIT_TEMPLATE_DIR": ""}
IDENTITY = ["-c", "user.email=t@t", "-c", "user.name=t"]


class FixedMessageProvider:
    name = "mock"

    async def complete(self, messages, model=None):
        return "feat: add a second line\n"

    async def complete_stream(self, messages, model=None):
        yield await self.complete(messages, model)

    async def list_models(self):
        return ["mock-1"]

    def describe(self):
        return {"name": "mock", "configured": True, "model": "mock-1"}

    def pop_usage(self):
        return None


def init_repo(path):
    subprocess.run(["git", "-C", str(path), "init", "-q", "-b", "main"], check=True, env=GIT_ENV)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "t@t"], check=True, env=GIT_ENV)
    subprocess.run(["git", "-C", str(path), "config", "user.name", "t"], check=True, env=GIT_ENV)
    (path / "a.txt").write_text("one\n")
    subprocess.run(["git", "-C", str(path), "add", "a.txt"], check=True, env=GIT_ENV)
    subprocess.run(["git", "-C", str(path), "commit", "-q", "-m", "base"], check=True, env=GIT_ENV)


def add_project(client, path):
    res = client.post("/projects", json={"path": str(path), "name": "repo"})
    assert res.status_code in (200, 201), res.text
    return res.json()["project"]["id"]


def test_generate_commit_message_from_working_changes(tmp_path):
    ws = tmp_path / "ws"
    with make_test_client(
        tmp_path,
        provider=FixedMessageProvider(),
        workspace=str(ws),
        data_dir=str(tmp_path / "data"),
    ) as client:
        init_repo(ws)
        pid = add_project(client, ws)
        (ws / "a.txt").write_text("one\ntwo\n")
        res = client.post(f"/projects/{pid}/git/commit-message")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["message"].startswith("feat:")
        assert body["provider_configured"] is True


def test_stage_and_commit_is_journaled(tmp_path):
    ws = tmp_path / "ws"
    with make_test_client(
        tmp_path,
        provider=FixedMessageProvider(),
        workspace=str(ws),
        data_dir=str(tmp_path / "data"),
    ) as client:
        init_repo(ws)
        pid = add_project(client, ws)
        (ws / "a.txt").write_text("one\ntwo\n")
        res = client.post(
            f"/projects/{pid}/git/commit",
            json={"files": ["a.txt"], "message": "chore: add second line"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["committed"] is True
        log = subprocess.run(
            ["git", "-C", str(ws), "log", "--oneline"], capture_output=True, text=True, env=GIT_ENV
        ).stdout
        assert "add second line" in log
        history = client.get(f"/projects/{pid}/commands").json()["commands"]
        assert any("git commit" in row["command"] and row["status"] == "ok" for row in history)


def test_commit_requires_at_least_one_file(tmp_path):
    ws = tmp_path / "ws"
    with make_test_client(
        tmp_path,
        provider=FixedMessageProvider(),
        workspace=str(ws),
        data_dir=str(tmp_path / "data"),
    ) as client:
        init_repo(ws)
        pid = add_project(client, ws)
        res = client.post(f"/projects/{pid}/git/commit", json={"files": [], "message": "x"})
        assert res.status_code == 422
