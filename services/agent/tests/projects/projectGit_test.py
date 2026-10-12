import os

from supports.projectClient_support import (
    add_project,
    create_sample_project,
    initialise_git_repository,
    open_local_client,
    write_text_file,
)

from app.routes.projects.projectGit_route import parse_branch_header, parse_porcelain_z


def test_git_summary_reports_branch_and_changed_files(tmp_path):
    folder = create_sample_project(tmp_path / "repo")
    initialise_git_repository(folder)
    write_text_file(os.path.join(folder, "README.md"), "# Changed\n")
    with open_local_client(tmp_path) as client:
        project = add_project(client, folder)
        body = client.get(f"/projects/{project['id']}/git").json()
        assert body["is_repo"] is True
        assert body["branch"] == "main" and body["upstream"] == ""
        assert body["ahead"] == 0 and body["behind"] == 0
        changed = {c["path"]: c["status"] for c in body["changed"]}
        assert changed["README.md"] == "modified"
        assert changed["package.json"] == "untracked"
        assert ".env" not in changed
        assert body["clean"] is False
        assert "sandboxed" in body and "sandbox_backend" in body


def test_git_summary_for_a_plain_folder(tmp_path):
    folder = create_sample_project(tmp_path / "plain")
    with open_local_client(tmp_path) as client:
        project = add_project(client, folder)
        body = client.get(f"/projects/{project['id']}/git").json()
        assert body["is_repo"] is False and body["changed"] == []


def test_branch_header_parsing():
    assert parse_branch_header("## main...origin/main [ahead 2, behind 1]") == {
        "branch": "main",
        "upstream": "origin/main",
        "ahead": 2,
        "behind": 1,
        "detached": False,
    }
    assert parse_branch_header("## No commits yet on dev")["branch"] == "dev"
    assert parse_branch_header("## HEAD (no branch)")["detached"] is True
    assert parse_branch_header("## feat/x...origin/feat/x [gone]")["upstream"] == "origin/feat/x"


def test_porcelain_parsing_handles_renames_spaces_and_conflicts():
    output = "## main\0R  new name.txt\0old name.txt\0UU both.txt\0 M src/a.py\0?? new dir/\0"
    branch, changed, truncated = parse_porcelain_z(output)
    assert branch["branch"] == "main" and truncated is False
    assert changed[0] == {
        "path": "new name.txt",
        "index": "R",
        "worktree": " ",
        "status": "renamed",
        "original_path": "old name.txt",
    }
    assert [c["status"] for c in changed[1:]] == ["conflicted", "modified", "untracked"]
