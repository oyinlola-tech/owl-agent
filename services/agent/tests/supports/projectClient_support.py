import json
import os
import subprocess

from app import create_app
from app.settings.serviceSettings_setting import Settings
from supports.authorizedClient_support import open_authorized_client


def build_local_settings(tmp_path, **overrides) -> Settings:
    params = {
        "step_delay": 0.01,
        "db_path": str(tmp_path / "owl-data" / "owl.db"),
        "_env_file": None,
        "nvidia_api_key": "",
        "workspaces": "",
    }
    params.update(overrides)
    return Settings(**params)


def open_local_client(tmp_path, **overrides):
    return open_authorized_client(create_app(build_local_settings(tmp_path, **overrides)))


def write_text_file(path, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def create_sample_project(folder) -> str:
    folder = str(folder)
    write_text_file(
        os.path.join(folder, "package.json"),
        json.dumps({"scripts": {"test": "vitest run"}, "dependencies": {"react": "19.0.0"}}),
    )
    write_text_file(os.path.join(folder, "package-lock.json"), "{}")
    write_text_file(os.path.join(folder, "src", "app.ts"), "export const answer = 42;\n")
    write_text_file(os.path.join(folder, "README.md"), "# Sample\nfind the needle here\n")
    write_text_file(os.path.join(folder, ".gitignore"), "dist/\n*.log\n!keep.log\n")
    write_text_file(os.path.join(folder, "dist", "bundle.js"), "needle in build output\n")
    write_text_file(os.path.join(folder, "debug.log"), "needle in a log\n")
    write_text_file(os.path.join(folder, "keep.log"), "kept log\n")
    write_text_file(os.path.join(folder, ".env"), "API_KEY=sk-secretvalue123456\n")
    write_text_file(os.path.join(folder, "certs", "server.pem"), "-----BEGIN PRIVATE KEY-----\n")
    return os.path.realpath(folder)


def initialise_git_repository(folder: str) -> None:
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@e", GIT_COMMITTER_NAME="t")
    env["GIT_COMMITTER_EMAIL"] = "t@e"
    for args in (
        ["init", "-q", "-b", "main"],
        ["add", "README.md"],
        ["commit", "-q", "-m", "first"],
    ):
        subprocess.run(["git", "-C", folder, *args], check=True, env=env, capture_output=True)


def add_project(client, folder: str, name: str = "") -> dict:
    response = client.post("/projects", json={"path": folder, "name": name})
    assert response.status_code in (200, 201), response.text
    return response.json()["project"]


def read_sse_events(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        name = ""
        data = ""
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                data += line[6:]
        if name:
            events.append((name, json.loads(data)))
    return events
