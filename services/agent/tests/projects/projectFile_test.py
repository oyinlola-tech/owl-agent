import hashlib
import os

import pytest
from supports.projectClient_support import (
    add_project,
    create_sample_project,
    open_local_client,
    write_text_file,
)


@pytest.fixture()
def opened(tmp_path):
    folder = create_sample_project(tmp_path / "files")
    with open_local_client(tmp_path) as client:
        yield client, add_project(client, folder), folder


def test_tree_is_one_level_gitignore_aware_and_hides_sensitive(opened):
    client, project, _ = opened
    tree = client.get(f"/projects/{project['id']}/tree").json()
    names = [e["name"] for e in tree["entries"]]
    assert names[:2] == ["certs", "src"]
    assert "app.ts" not in names
    assert ".env" not in names and ".git" not in names
    assert "dist" not in names and "debug.log" not in names
    assert "keep.log" in names
    assert tree["hidden"] == {"ignored": 2, "sensitive": 1}
    everything = client.get(
        f"/projects/{project['id']}/tree", params={"include_ignored": True}
    ).json()
    flagged = {e["name"]: e["ignored"] for e in everything["entries"]}
    assert flagged["dist"] is True and flagged["keep.log"] is False
    assert ".env" not in flagged
    certs = client.get(f"/projects/{project['id']}/tree", params={"path": "certs"}).json()
    assert certs["entries"] == [] and certs["hidden"]["sensitive"] == 1
    nested = client.get(f"/projects/{project['id']}/tree", params={"path": "src"}).json()
    assert [e["path"] for e in nested["entries"]] == ["src/app.ts"]


def test_nested_gitignore_and_negation(tmp_path, opened):
    client, project, folder = opened
    write_text_file(os.path.join(folder, "src", ".gitignore"), "*.gen.ts\n")
    write_text_file(os.path.join(folder, "src", "types.gen.ts"), "x")
    names = [
        e["name"]
        for e in client.get(f"/projects/{project['id']}/tree", params={"path": "src"}).json()[
            "entries"
        ]
    ]
    assert "types.gen.ts" not in names and "app.ts" in names


def test_traversal_and_symlink_escapes_are_refused(tmp_path, opened):
    client, project, folder = opened
    outside = tmp_path / "outside"
    write_text_file(str(outside / "secret.txt"), "outside data")
    os.symlink(str(outside / "secret.txt"), os.path.join(folder, "link.txt"))
    os.symlink(str(outside), os.path.join(folder, "linkdir"))
    os.symlink(os.path.join(folder, ".env"), os.path.join(folder, "innocent.txt"))
    pid = project["id"]
    for path, code in (
        ("../outside/secret.txt", "path_outside_project"),
        ("src/../../outside/secret.txt", "path_outside_project"),
        ("/etc/passwd", "invalid_path"),
        ("~/.bashrc", "invalid_path"),
        ("link.txt", "path_outside_project"),
        ("linkdir/secret.txt", "path_outside_project"),
        ("innocent.txt", "sensitive_path"),
        (".env", "sensitive_path"),
        ("certs/server.pem", "sensitive_path"),
    ):
        response = client.get(f"/projects/{pid}/file", params={"path": path})
        assert response.status_code in (400, 403), path
        assert response.json()["code"] == code, path
    tree = client.get(f"/projects/{pid}/tree").json()
    names = [e["name"] for e in tree["entries"]]
    assert "link.txt" not in names and "linkdir" not in names and "innocent.txt" not in names
    escaped = client.get(f"/projects/{pid}/tree", params={"path": "linkdir"})
    assert escaped.status_code == 403
    saved = client.put(f"/projects/{pid}/file", json={"path": "link.txt", "content": "pwned"})
    assert saved.status_code == 403
    assert (outside / "secret.txt").read_text() == "outside data"


def test_file_read_returns_text_and_refuses_binary_and_large(tmp_path, opened):
    client, project, folder = opened
    with open(os.path.join(folder, "image.bin"), "wb") as fh:
        fh.write(b"\x89PNG\x00\x00binary")
    write_text_file(os.path.join(folder, "huge.txt"), "a" * (1024 * 1024 + 10))
    pid = project["id"]
    body = client.get(f"/projects/{pid}/file", params={"path": "src/app.ts"}).json()
    assert body["content"] == "export const answer = 42;\n"
    assert body["sha256"] == hashlib.sha256(body["content"].encode()).hexdigest()
    binary = client.get(f"/projects/{pid}/file", params={"path": "image.bin"})
    assert binary.status_code == 422 and binary.json()["code"] == "binary_file"
    large = client.get(f"/projects/{pid}/file", params={"path": "huge.txt"})
    assert large.status_code == 413 and large.json()["code"] == "file_too_large"
    missing = client.get(f"/projects/{pid}/file", params={"path": "nope.txt"})
    assert missing.status_code == 404
    folder_read = client.get(f"/projects/{pid}/file", params={"path": "src"})
    assert folder_read.json()["code"] == "not_a_file"


def test_user_save_is_journaled_with_source_user_and_detects_conflicts(tmp_path, opened):
    client, project, folder = opened
    pid = project["id"]
    current = client.get(f"/projects/{pid}/file", params={"path": "src/app.ts"}).json()
    response = client.put(
        f"/projects/{pid}/file",
        json={
            "path": "src/app.ts",
            "content": "export const answer = 43;\n",
            "base_sha256": current["sha256"],
        },
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["source"] == "user" and saved["created"] is False
    with open(os.path.join(folder, "src", "app.ts")) as fh:
        assert fh.read() == "export const answer = 43;\n"
    row = client.app.state.manager.conn.execute(
        "SELECT source, project_id, task_id, before_text, after_text, approval_id"
        " FROM change_journal WHERE id = ?",
        (saved["journal_id"],),
    ).fetchone()
    assert tuple(row) == (
        "user",
        pid,
        "",
        "export const answer = 42;\n",
        "export const answer = 43;\n",
        "",
    )
    stale = client.put(
        f"/projects/{pid}/file",
        json={"path": "src/app.ts", "content": "x", "base_sha256": current["sha256"]},
    )
    assert stale.status_code == 409 and stale.json()["code"] == "file_changed"
    assert stale.json()["current_sha256"] == saved["sha256"]
    new_file = client.put(
        f"/projects/{pid}/file", json={"path": "src/new.ts", "content": "n", "create": True}
    )
    assert new_file.status_code == 200 and new_file.json()["created"] is True
    no_create = client.put(f"/projects/{pid}/file", json={"path": "other.ts", "content": "n"})
    assert no_create.status_code == 404
    secret = client.put(f"/projects/{pid}/file", json={"path": ".env", "content": "X=1"})
    assert secret.status_code == 403 and secret.json()["code"] == "sensitive_path"


def test_search_is_bounded_and_skips_ignored_and_sensitive(tmp_path, opened):
    client, project, folder = opened
    for index in range(30):
        write_text_file(os.path.join(folder, "notes", f"n{index}.md"), "needle\nneedle\n")
    pid = project["id"]
    body = client.get(f"/projects/{pid}/search", params={"q": "NEEDLE", "limit": 5}).json()
    assert len(body["results"]) == 5 and body["truncated"] is True
    everything = client.get(f"/projects/{pid}/search", params={"q": "needle", "limit": 200}).json()
    paths = {r["path"] for r in everything["results"]}
    assert "README.md" in paths
    assert not {"dist/bundle.js", "debug.log", ".env"} & paths
    secret = client.get(f"/projects/{pid}/search", params={"q": "secretvalue"}).json()
    assert secret["results"] == []
    named = client.get(f"/projects/{pid}/search", params={"q": "app.ts"}).json()
    assert {"path": "src/app.ts", "line": 0, "preview": "app.ts", "kind": "name"} in named[
        "results"
    ]
    assert client.get(f"/projects/{pid}/search", params={"q": ""}).status_code == 422
