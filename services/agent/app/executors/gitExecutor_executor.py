from __future__ import annotations

import os
import re

from .commandExecutor_executor import CommandError, CommandExecutor, CommandTimedOutError

GIT_ENVIRONMENT = {"GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
MAX_COMMIT_MESSAGE_DIFF = 16000
INVALID_REF_SEGMENT = re.compile(r"[\x00-\x20\x7f~^:?*\[\\]|\.\.|@\{|//")


class GitError(Exception):
    pass


def validate_git_ref_name(name: str) -> str:
    # Security: a name like "-D" or "--upload-pack=cmd" would turn into a git option and run
    # arbitrary programs; every branch/ref argument is checked against git check-ref-format
    # rules before it is ever passed to git.
    candidate = (name or "").strip()
    if not candidate or candidate.startswith("-"):
        raise GitError("ref name must not be empty or start with '-'")
    if len(candidate) > 200:
        raise GitError("ref name is too long")
    if INVALID_REF_SEGMENT.search(candidate):
        raise GitError("ref name contains characters git forbids")
    if candidate.startswith("/") or candidate.endswith("/") or candidate.endswith("."):
        raise GitError("ref name must not start or end with '/' or end with '.'")
    if candidate.endswith(".lock") or candidate == "@":
        raise GitError("ref name is reserved")
    if any(segment.startswith(".") or segment == "" for segment in candidate.split("/")):
        raise GitError("ref name has an empty or dot-prefixed segment")
    return candidate


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
    # Security: a ref like "--output=<file>" would make git write files without approval.
    if ref.startswith("-"):
        raise GitError("ref must not start with '-'")
    args = ["diff", "--end-of-options", ref] if ref else ["diff"]
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
    executor: CommandExecutor,
    path: str = ".",
    remote: str = "origin",
    network: bool = False,
    force: bool = False,
) -> dict:
    # Security: approval with elevated scrutiny is enforced by the caller; a force push can
    # overwrite remote history, so the caller raises it to High risk.
    if not remote.replace("-", "").replace("_", "").isalnum():
        raise GitError("invalid remote name")
    args = ["push", "--force-with-lease", remote] if force else ["push", remote]
    out = await run_git_command(executor, path, *args, timeout=120.0, network=network)
    return {
        "pushed": True,
        "forced": force,
        "output": out.strip().splitlines()[-3:],
        **executor.describe_sandbox(),
    }


async def _run_git_capturing(
    executor: CommandExecutor, path: str, *args: str, timeout: float = 30.0, network: bool = False
) -> dict:
    root = executor.auth.resolve_authorized_path(path)
    try:
        return await executor.run_command(
            "git", ["git", "-C", root, *args], root, timeout, GIT_ENVIRONMENT, network=network
        )
    except CommandTimedOutError as exc:
        raise GitError("git command timed out") from exc
    except CommandError as exc:
        raise GitError(str(exc)) from exc


async def read_git_branches(executor: CommandExecutor, path: str = ".") -> dict:
    out = await run_git_command(executor, path, "branch", "--format=%(HEAD)%(refname:short)")
    branches = []
    current = ""
    for line in out.splitlines():
        if not line:
            continue
        is_current = line.startswith("*")
        name = line[1:]
        branches.append({"name": name, "current": is_current})
        if is_current:
            current = name
    return {"branches": branches, "current": current, **executor.describe_sandbox()}


async def create_git_branch(executor: CommandExecutor, path: str, name: str) -> dict:
    branch = validate_git_ref_name(name)
    await run_git_command(executor, path, "branch", "--end-of-options", branch)
    return {"created": True, "branch": branch, **executor.describe_sandbox()}


async def checkout_git_ref(
    executor: CommandExecutor, path: str, ref: str, confirm_discard: bool = False
) -> dict:
    target = validate_git_ref_name(ref)
    # Security: switching refs with a dirty tree can silently discard the user's uncommitted
    # work, so it is refused unless the caller explicitly confirms the discard.
    dirty = (await run_git_command(executor, path, "status", "--porcelain=v1")).strip()
    if dirty and not confirm_discard:
        raise GitError("uncommitted changes present; set confirm_discard to switch anyway")
    await run_git_command(executor, path, "checkout", "--end-of-options", target)
    return {
        "checked_out": True,
        "ref": target,
        "had_changes": bool(dirty),
        **executor.describe_sandbox(),
    }


async def merge_git_ref(executor: CommandExecutor, path: str, ref: str) -> dict:
    target = validate_git_ref_name(ref)
    result = await _run_git_capturing(
        executor, path, "merge", "--no-edit", "--end-of-options", target
    )
    if result["exit_code"] == 0:
        return {
            "merged": True,
            "conflicted": [],
            "output": str(result["stdout"]).strip().splitlines()[-3:],
            **executor.describe_sandbox(),
        }
    conflicted = await run_git_command(executor, path, "diff", "--name-only", "--diff-filter=U")
    files = [line for line in conflicted.splitlines() if line]
    if files:
        await _run_git_capturing(executor, path, "merge", "--abort")
        return {"merged": False, "conflicted": files, **executor.describe_sandbox()}
    raise GitError(str(result["stderr"]).strip() or "git merge failed")


async def delete_git_branch(
    executor: CommandExecutor, path: str, name: str, force: bool = False
) -> dict:
    branch = validate_git_ref_name(name)
    # Security: deleting the branch that HEAD points at would leave the repo in a confusing
    # state, so the currently checked-out branch is never deleted.
    current = (await run_git_command(executor, path, "branch", "--show-current")).strip()
    if branch == current:
        raise GitError("cannot delete the currently checked-out branch")
    flag = "-D" if force else "-d"
    out = await run_git_command(executor, path, "branch", flag, "--end-of-options", branch)
    return {
        "deleted": True,
        "branch": branch,
        "forced": force,
        "output": out.strip(),
        **executor.describe_sandbox(),
    }


async def pull_git_remote(
    executor: CommandExecutor, path: str = ".", remote: str = "origin", network: bool = False
) -> dict:
    if not remote.replace("-", "").replace("_", "").isalnum():
        raise GitError("invalid remote name")
    out = await run_git_command(
        executor, path, "pull", "--no-edit", remote, timeout=120.0, network=network
    )
    lowered = out.lower()
    if "already up to date" in lowered:
        strategy = "up_to_date"
    elif "fast-forward" in lowered:
        strategy = "fast_forward"
    else:
        strategy = "merge"
    return {
        "pulled": True,
        "strategy": strategy,
        "output": out.strip().splitlines()[-3:],
        **executor.describe_sandbox(),
    }


async def read_commit_message_diff(executor: CommandExecutor, path: str = ".") -> str:
    staged = await run_git_command(executor, path, "diff", "--staged", "--no-color")
    diff = staged if staged.strip() else await run_git_command(executor, path, "diff", "--no-color")
    return diff[:MAX_COMMIT_MESSAGE_DIFF]
