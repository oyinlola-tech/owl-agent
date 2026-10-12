import asyncio
import subprocess

import pytest
from pydantic import ValidationError

from app.executors.commandExecutor_executor import CommandExecutor
from app.executors.gitExecutor_executor import GitError, read_git_diff
from app.guards.workspaceAccess_guard import WorkspaceAccessGuard
from app.tools.toolArgument_tool import GitReadArguments


def make_git_workspace(tmp_path):
    workspace = tmp_path / "repo"
    workspace.mkdir()
    for command in (
        ["git", "init", "-q"],
        [
            "git",
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            "start",
        ],
    ):
        subprocess.run(
            command,
            cwd=workspace,
            check=True,
            env={"PATH": "/usr/bin:/bin", "GIT_TEMPLATE_DIR": ""},
        )
    (workspace / "a.txt").write_text("changed\n")
    return workspace


@pytest.mark.parametrize("ref", ["--output=/tmp/owl-pwned", "-p", "--ext-diff", " --stat"])
def test_option_like_refs_are_rejected_by_the_argument_model(ref):
    with pytest.raises(ValidationError):
        GitReadArguments(ref=ref)


@pytest.mark.parametrize("ref", ["", "HEAD", "HEAD~1", "main..feature", "v1.0.0"])
def test_normal_refs_are_accepted(ref):
    assert GitReadArguments(ref=ref).ref == ref


def test_git_diff_cannot_write_a_file_through_the_ref(tmp_path):
    workspace = make_git_workspace(tmp_path)
    target = workspace / "written-by-git.txt"
    executor = CommandExecutor(WorkspaceAccessGuard([str(workspace)]))
    with pytest.raises(GitError):
        asyncio.run(read_git_diff(executor, str(workspace), f"--output={target}"))
    assert not target.exists()
