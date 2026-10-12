import asyncio
import subprocess

import pytest

from app.executors.commandExecutor_executor import CommandExecutor
from app.executors.gitExecutor_executor import (
    GitError,
    checkout_git_ref,
    create_git_branch,
    delete_git_branch,
    merge_git_ref,
    pull_git_remote,
    read_commit_message_diff,
    read_git_branches,
    validate_git_ref_name,
)
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard

GIT_ENV = {"PATH": "/usr/bin:/bin", "GIT_TEMPLATE_DIR": ""}
IDENTITY = ["-c", "user.email=t@t", "-c", "user.name=t"]


def run_git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, env=GIT_ENV)


def make_repo(tmp_path, name="repo"):
    repo = tmp_path / name
    repo.mkdir()
    run_git(repo, "init", "-q", "-b", "main")
    (repo / "a.txt").write_text("line one\n")
    run_git(repo, "add", "a.txt")
    run_git(repo, *IDENTITY, "commit", "-q", "-m", "base")
    return repo


def executor_for(*roots):
    return CommandExecutor(WorkspaceAccessGuard([str(r) for r in roots]))


def test_create_branch_and_list(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    result = asyncio.run(create_git_branch(ex, str(repo), "feature-x"))
    assert result["created"] and result["branch"] == "feature-x"
    listing = asyncio.run(read_git_branches(ex, str(repo)))
    names = {b["name"] for b in listing["branches"]}
    assert {"main", "feature-x"} <= names
    assert listing["current"] == "main"


@pytest.mark.parametrize("bad", ["-D", "--upload-pack=touch x", "a..b", "a b", "a~1", "feat/.hid"])
def test_ref_name_validation_rejects_option_like_and_illegal_names(bad):
    with pytest.raises(GitError):
        validate_git_ref_name(bad)


@pytest.mark.parametrize("func", [create_git_branch, lambda e, p, n: delete_git_branch(e, p, n)])
def test_option_injection_refused_on_branch_arguments(tmp_path, func):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    with pytest.raises(GitError):
        asyncio.run(func(ex, str(repo), "--output=/tmp/owl-pwned"))


def test_checkout_refuses_dirty_tree_without_confirm(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    asyncio.run(create_git_branch(ex, str(repo), "other"))
    (repo / "a.txt").write_text("uncommitted change\n")
    with pytest.raises(GitError) as exc:
        asyncio.run(checkout_git_ref(ex, str(repo), "other"))
    assert "uncommitted" in str(exc.value).lower()
    result = asyncio.run(checkout_git_ref(ex, str(repo), "other", confirm_discard=True))
    assert result["checked_out"] and result["ref"] == "other"


def test_merge_reports_conflicted_files_and_aborts(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    run_git(repo, "checkout", "-q", "-b", "feature")
    (repo / "a.txt").write_text("feature side\n")
    run_git(repo, *IDENTITY, "commit", "-q", "-am", "feature change")
    run_git(repo, "checkout", "-q", "main")
    (repo / "a.txt").write_text("main side\n")
    run_git(repo, *IDENTITY, "commit", "-q", "-am", "main change")
    result = asyncio.run(merge_git_ref(ex, str(repo), "feature"))
    assert result["merged"] is False
    assert "a.txt" in result["conflicted"]
    state = subprocess.run(
        ["git", "-C", str(repo), "status", "--porcelain=v1"],
        capture_output=True,
        text=True,
        env=GIT_ENV,
    ).stdout
    assert "UU" not in state


def test_merge_clean_fast_forward(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    run_git(repo, "checkout", "-q", "-b", "feature")
    (repo / "b.txt").write_text("new file\n")
    run_git(repo, "add", "b.txt")
    run_git(repo, *IDENTITY, "commit", "-q", "-m", "add b")
    run_git(repo, "checkout", "-q", "main")
    result = asyncio.run(merge_git_ref(ex, str(repo), "feature"))
    assert result["merged"] is True and result["conflicted"] == []


def test_delete_current_branch_is_refused(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    with pytest.raises(GitError) as exc:
        asyncio.run(delete_git_branch(ex, str(repo), "main"))
    assert "currently checked-out" in str(exc.value)


def test_delete_non_current_branch(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    asyncio.run(create_git_branch(ex, str(repo), "scratch"))
    result = asyncio.run(delete_git_branch(ex, str(repo), "scratch"))
    assert result["deleted"] and result["branch"] == "scratch"


def test_pull_reports_fast_forward_from_local_remote(tmp_path):
    origin = make_repo(tmp_path, "origin")
    clone = tmp_path / "clone"
    subprocess.run(["git", "clone", "-q", str(origin), str(clone)], check=True, env=GIT_ENV)
    (origin / "c.txt").write_text("upstream work\n")
    run_git(origin, "add", "c.txt")
    run_git(origin, *IDENTITY, "commit", "-q", "-m", "upstream commit")
    ex = executor_for(clone, origin)
    result = asyncio.run(pull_git_remote(ex, str(clone), "origin"))
    assert result["pulled"] and result["strategy"] in ("fast_forward", "merge")
    assert (clone / "c.txt").exists()


def test_read_commit_message_diff_prefers_staged(tmp_path):
    repo = make_repo(tmp_path)
    ex = executor_for(repo)
    (repo / "a.txt").write_text("staged edit\n")
    run_git(repo, "add", "a.txt")
    diff = asyncio.run(read_commit_message_diff(ex, str(repo)))
    assert "staged edit" in diff
