"""Git inspection (read-only) plus gated commit and push."""

from __future__ import annotations

import asyncio
import os

from .memory import scrub_secrets
from .workspaces import WorkspaceAuth


class GitError(Exception):
    pass


async def _git(auth: WorkspaceAuth, path: str, *args: str, timeout: float = 30.0) -> str:
    root = auth.resolve(path)
    proc = await asyncio.create_subprocess_exec(
        "git",
        "-C",
        root,
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "TERM": "dumb", "GIT_OPTIONAL_LOCKS": "0"},
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError as exc:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        raise GitError("git command timed out") from exc
    if proc.returncode != 0:
        raise GitError(err.decode("utf-8", "replace").strip() or f"git exit {proc.returncode}")
    text, _ = scrub_secrets(out.decode("utf-8", "replace"))
    return text


async def git_status(auth: WorkspaceAuth, path: str = ".") -> dict:
    porcelain = await _git(auth, path, "status", "--porcelain=v1", "--branch")
    return {"status": porcelain}


async def git_diff(auth: WorkspaceAuth, path: str = ".", ref: str = "") -> dict:
    args = ["diff", ref] if ref else ["diff"]
    return {"diff": await _git(auth, path, *args)}


async def git_log(auth: WorkspaceAuth, path: str = ".", limit: int = 10) -> dict:
    if limit < 1 or limit > 50:
        raise GitError("limit out of range")
    out = await _git(
        auth, path, "log", f"-n{limit}", "--pretty=format:%H %ad %an %s", "--date=short"
    )
    return {"commits": [line for line in out.splitlines() if line]}


async def git_branch(auth: WorkspaceAuth, path: str = ".") -> dict:
    return {"branch": (await _git(auth, path, "branch", "--show-current")).strip()}


async def git_commit(auth: WorkspaceAuth, path: str, files: list[str], message: str) -> dict:
    """Stage listed paths and commit. Approval is enforced by the caller."""
    if not files:
        raise GitError("no files listed")
    if not message.strip():
        raise GitError("commit message is required")
    for f in files:
        auth.resolve(os.path.join(path, f))
    await _git(auth, path, "add", "--", *files)
    out = await _git(auth, path, "commit", "-m", message[:500])
    return {"committed": True, "output": out.strip().splitlines()[-1:]}


async def git_push(auth: WorkspaceAuth, path: str = ".", remote: str = "origin") -> dict:
    """Push. Approval with elevated scrutiny is enforced by the caller."""
    if not remote.replace("-", "").replace("_", "").isalnum():
        raise GitError("invalid remote name")
    out = await _git(auth, path, "push", remote, timeout=120.0)
    return {"pushed": True, "output": out.strip().splitlines()[-3:]}
