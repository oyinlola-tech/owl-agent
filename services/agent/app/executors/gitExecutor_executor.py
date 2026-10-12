from __future__ import annotations

import os

from .commandExecutor_executor import CommandError, CommandExecutor, CommandTimedOutError

GIT_ENVIRONMENT = {"GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}


class GitError(Exception):
    pass


async def run_git_command(
    executor: CommandExecutor,
    path: str,
    *args: str,
    timeout: float = 30.0,
    task_id: str = "git",
    network: bool = False,
) -> str:
    # Security: git runs hooks and repo-configured programs, so it goes through the same
    # scrubbed environment and sandbox as every other command.
    root = executor.auth.resolve_authorized_path(path)
    try:
        res = await executor.run_command(
            task_id,
            ["git", "-C", root, *args],
            root,
            timeout,
            GIT_ENVIRONMENT,
            network=network,
        )
    except CommandTimedOutError as exc:
        raise GitError("git command timed out") from exc
    except CommandError as exc:
        raise GitError(str(exc)) from exc
    if res["exit_code"] != 0:
        raise GitError(str(res["stderr"]).strip() or f"git exit {res['exit_code']}")
    return str(res["stdout"])


async def read_git_status(executor: CommandExecutor, path: str = ".") -> dict:
    porcelain = await run_git_command(executor, path, "status", "--porcelain=v1", "--branch")
    return {"status": porcelain, **executor.describe_sandbox()}


async def read_git_diff(executor: CommandExecutor, path: str = ".", ref: str = "") -> dict:
    args = ["diff", ref] if ref else ["diff"]
    return {"diff": await run_git_command(executor, path, *args), **executor.describe_sandbox()}


async def read_git_log(executor: CommandExecutor, path: str = ".", limit: int = 10) -> dict:
    if limit < 1 or limit > 50:
        raise GitError("limit out of range")
    out = await run_git_command(
        executor, path, "log", f"-n{limit}", "--pretty=format:%H %ad %an %s", "--date=short"
    )
    commits = [line for line in out.splitlines() if line]
    return {"commits": commits, **executor.describe_sandbox()}


async def read_git_branch(executor: CommandExecutor, path: str = ".") -> dict:
    out = await run_git_command(executor, path, "branch", "--show-current")
    return {"branch": out.strip(), **executor.describe_sandbox()}


async def commit_git_files(
    executor: CommandExecutor, path: str, files: list[str], message: str
) -> dict:
    # Security: approval is enforced by the caller; every listed file must still resolve
    # inside an authorized workspace.
    if not files:
        raise GitError("no files listed")
    if not message.strip():
        raise GitError("commit message is required")
    for f in files:
        executor.auth.resolve_authorized_path(os.path.join(path, f))
    await run_git_command(executor, path, "add", "--", *files)
    out = await run_git_command(executor, path, "commit", "-m", message[:500])
    return {
        "committed": True,
        "output": out.strip().splitlines()[-1:],
        **executor.describe_sandbox(),
    }


async def push_git_branch(
    executor: CommandExecutor, path: str = ".", remote: str = "origin", network: bool = False
) -> dict:
    # Security: approval with elevated scrutiny is enforced by the caller.
    if not remote.replace("-", "").replace("_", "").isalnum():
        raise GitError("invalid remote name")
    out = await run_git_command(executor, path, "push", remote, timeout=120.0, network=network)
    return {
        "pushed": True,
        "output": out.strip().splitlines()[-3:],
        **executor.describe_sandbox(),
    }
